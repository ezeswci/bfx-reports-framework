'use strict'

const { orderBy } = require('lodash')

const {
  decorate,
  injectable,
  inject
} = require('inversify')

const TYPES = require('../../di/types')
const {
  isForexSymb
} = require('../helpers')

class FullTaxReport {
  constructor (
    dao,
    syncSchema,
    ALLOWED_COLLS,
    winLoss,
    positionsSnapshot
  ) {
    this.dao = dao
    this.syncSchema = syncSchema
    this.ALLOWED_COLLS = ALLOWED_COLLS
    this.winLoss = winLoss
    this.positionsSnapshot = positionsSnapshot
  }

  _getPositionsSnapshotAndTickers (args) {
    const {
      auth = {},
      params = {}
    } = { ...args }
    const { mts: end = Date.now() } = { ...params }
    const _args = {
      auth,
      params: { end }
    }

    return this.positionsSnapshot
      .getPositionsSnapshotAndTickers(_args)
  }

  _calcWinLossTotalAmount (winLoss) {
    if (
      !Array.isArray(winLoss) ||
      winLoss.length === 0
    ) {
      return null
    }

    const res = winLoss.reduce((accum, item = {}) => {
      const itemArr = Object.entries({ ...item })
      const subRes = itemArr.reduce((subAccum, [symb, amount]) => {
        const _subAccum = { ...accum, ...subAccum }

        if (
          !isForexSymb(symb) ||
          !Number.isFinite(amount)
        ) {
          return _subAccum
        }

        return {
          ..._subAccum,
          [symb]: Number.isFinite(_subAccum[symb])
            ? _subAccum[symb] + amount
            : amount
        }
      }, {})

      return {
        ...accum,
        ...subRes
      }
    }, {})
    const { USD } = { ...res }

    return USD
  }

  async _getMovements ({
    user = {},
    start = 0,
    end = Date.now()
  }) {
    const movementsModel = this.syncSchema.getModelsMap()
      .get(this.ALLOWED_COLLS.MOVEMENTS)

    const _withdrawals = await this.dao.getElemsInCollBy(
      this.ALLOWED_COLLS.MOVEMENTS,
      {
        filter: {
          $lt: { amount: 0 },
          $gte: { mtsStarted: start },
          $lte: { mtsStarted: end },
          user_id: user._id
        },
        sort: [['mtsStarted', -1]],
        projection: movementsModel,
        exclude: ['user_id'],
        isExcludePrivate: true
      }
    )
    const _deposits = await this.dao.getElemsInCollBy(
      this.ALLOWED_COLLS.MOVEMENTS,
      {
        filter: {
          $gt: { amount: 0 },
          $gte: { mtsUpdated: start },
          $lte: { mtsUpdated: end },
          user_id: user._id
        },
        sort: [['mtsUpdated', -1]],
        projection: movementsModel,
        exclude: ['user_id'],
        isExcludePrivate: true
      }
    )

    const withdrawals = Array.isArray(_withdrawals)
      ? _withdrawals
      : []
    const deposits = Array.isArray(_deposits)
      ? _deposits
      : []
    const _movements = [
      ..._withdrawals,
      ..._deposits
    ]
    const movements = orderBy(
      _movements,
      ['mtsUpdated'],
      ['desc']
    )

    return {
      movements,
      withdrawals,
      deposits
    }
  }

  _calcMovementsTotalAmount (movements) {
    if (
      !Array.isArray(movements) ||
      movements.length === 0
    ) {
      return null
    }

    const res = movements.reduce((accum, movement = {}) => {
      const { amount, amountUsd, currency } = { ...movement }
      const _isForexSymb = isForexSymb(currency)
      const _isNotUsedAmountUsdField = (
        _isForexSymb &&
        !Number.isFinite(amountUsd)
      )
      const _amount = _isNotUsedAmountUsdField
        ? amount
        : amountUsd
      const symb = _isNotUsedAmountUsdField
        ? currency
        : 'USD'

      if (!Number.isFinite(_amount)) {
        return { ...accum }
      }

      return {
        ...accum,
        [symb]: Number.isFinite(accum[symb])
          ? accum[symb] + _amount
          : _amount
      }
    }, {})
    const { USD } = { ...res }

    return USD
  }

  async getFullTaxReport ({
    auth = {},
    params: {
      start = 0,
      end = Date.now()
    } = {}
  } = {}) {
    const user = await this.dao.checkAuthInDb({ auth })

    const args = {
      auth,
      params: {
        timeframe: end,
        start,
        end
      }
    }

    const winLoss = await this.winLoss.getWinLoss(args)
    const winLossTotalAmount = this._calcWinLossTotalAmount(winLoss)

    const {
      positionsSnapshot: startPositionsSnapshot,
      tickers: startTickers
    } = await this._getPositionsSnapshotAndTickers({
      auth,
      params: { mts: start }
    })
    const {
      positionsSnapshot: endPositionsSnapshot,
      tickers: endTickers
    } = await this._getPositionsSnapshotAndTickers({
      auth,
      params: { mts: end }
    })

    const {
      movements,
      withdrawals,
      deposits
    } = await this._getMovements({
      user,
      start,
      end
    })
    const movementsTotalAmount = this._calcMovementsTotalAmount(
      movements
    )
    const depositsTotalAmount = this._calcMovementsTotalAmount(
      deposits
    )
    const withdrawalsTotalAmount = this._calcMovementsTotalAmount(
      withdrawals
    )

    return {
      winLossTotalAmount,
      startPositionsSnapshot,
      startTickers,
      endPositionsSnapshot,
      endTickers,
      movements,
      movementsTotalAmount,
      depositsTotalAmount,
      withdrawalsTotalAmount
    }
  }
}

decorate(injectable(), FullTaxReport)
decorate(inject(TYPES.DAO), FullTaxReport, 0)
decorate(inject(TYPES.SyncSchema), FullTaxReport, 1)
decorate(inject(TYPES.ALLOWED_COLLS), FullTaxReport, 2)
decorate(inject(TYPES.WinLoss), FullTaxReport, 3)
decorate(inject(TYPES.PositionsSnapshot), FullTaxReport, 4)

module.exports = FullTaxReport
