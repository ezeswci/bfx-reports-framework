'use strict'

const {
  decorate,
  injectable,
  inject
} = require('inversify')

const TYPES = require('../../di/types')
const {
  calcGroupedData,
  groupByTimeframe,
  splitSymbolPairs,
  getMtsGroupedByTimeframe
} = require('../helpers')

class Trades {
  constructor (
    dao,
    ALLOWED_COLLS,
    syncSchema,
    FOREX_SYMBS,
    currencyConverter
  ) {
    this.dao = dao
    this.ALLOWED_COLLS = ALLOWED_COLLS
    this.syncSchema = syncSchema
    this.FOREX_SYMBS = FOREX_SYMBS
    this.currencyConverter = currencyConverter

    this.tradesMethodColl = this.syncSchema.getMethodCollMap()
      .get('_getTrades')
  }

  async _getTrades ({
    auth,
    start,
    end,
    symbol
  }) {
    const user = await this.dao.checkAuthInDb({ auth })

    const symbFilter = (
      Array.isArray(symbol) &&
      symbol.length !== 0
    )
      ? { $in: { symbol } }
      : {}
    const tradesModel = this.syncSchema.getModelsMap()
      .get(this.ALLOWED_COLLS.TRADES)

    return this.dao.getElemsInCollBy(
      this.ALLOWED_COLLS.TRADES,
      {
        filter: {
          user_id: user._id,
          $lte: { mtsCreate: end },
          $gte: { mtsCreate: start },
          ...symbFilter
        },
        sort: [['mtsCreate', -1]],
        projection: tradesModel,
        exclude: ['user_id'],
        isExcludePrivate: true
      }
    )
  }

  _calcAmounts (data = []) {
    return data.map((trade = {}) => {
      const {
        execAmount,
        execPrice,
        fee,
        feeCurrency,
        symbol
      } = { ...trade }
      const symb = splitSymbolPairs(symbol)[1]
      const isFeeInUsd = feeCurrency === 'USD'
      const isPriceInUsd = symb === 'USD'

      const calcAmount = (
        Number.isFinite(execAmount) &&
        Number.isFinite(execPrice)
      )
        ? Math.abs(execAmount * execPrice)
        : null

      const _feeUsd = (
        isFeeInUsd &&
        Number.isFinite(fee)
      )
        ? fee
        : null
      const feeUsd = (
        !isFeeInUsd &&
        isPriceInUsd &&
        Number.isFinite(fee) &&
        Number.isFinite(execPrice)
      )
        ? fee * execPrice
        : _feeUsd
      const _feeForCurrConv = (
        !isFeeInUsd &&
        !isPriceInUsd &&
        Number.isFinite(fee)
      )
        ? fee
        : null
      const feeForCurrConv = (
        Number.isFinite(_feeForCurrConv) &&
        Number.isFinite(execPrice) &&
        symb !== feeCurrency
      )
        ? _feeForCurrConv * execPrice
        : _feeForCurrConv

      return {
        ...trade,
        calcAmount,
        feeUsd,
        feeForCurrConv
      }
    }, {})
  }

  _calcTrades (fieldName) {
    return (data = []) => data.reduce((accum, trade = {}) => {
      const _trade = { ...trade }
      const value = _trade[fieldName]

      if (!Number.isFinite(value)) {
        return { ...accum }
      }

      return {
        ...accum,
        USD: Number.isFinite(accum.USD)
          ? accum.USD + value
          : value
      }
    }, {})
  }

  _getTradesByTimeframe () {
    return ({ tradesGroupedByTimeframe = {} }) => {
      const tradesArr = Object.entries(tradesGroupedByTimeframe)

      if (tradesArr.length === 0) {
        return { USD: 0 }
      }

      const res = tradesArr.reduce((
        accum,
        [symb, amount]
      ) => {
        if (
          symb !== 'USD' ||
          !Number.isFinite(amount)
        ) {
          return { ...accum }
        }

        return {
          ...accum,
          [symb]: amount
        }
      }, {})

      return res
    }
  }

  async getTrades (
    {
      auth = {},
      params = {}
    } = {}
  ) {
    const {
      start = 0,
      end = Date.now(),
      symbol: symbs
    } = { ...params }
    const _symbol = Array.isArray(symbs)
      ? symbs
      : [symbs]
    const symbol = _symbol.filter((s) => (
      s && typeof s === 'string'
    ))
    const args = {
      auth,
      start,
      end,
      symbol
    }

    const {
      symbolFieldName: tradesSymbolFieldName,
      dateFieldName: tradesDateFieldName
    } = this.tradesMethodColl

    const trades = await this._getTrades(args)
    const calcedTradesAmount = this._calcAmounts(
      trades
    )
    const convertedTrades = await this.currencyConverter
      .convertManyByCandles(
        calcedTradesAmount,
        {
          symbolFieldName: tradesSymbolFieldName,
          dateFieldName: tradesDateFieldName,
          convFields: [
            {
              inputField: 'calcAmount',
              outputField: 'amountUsd'
            },
            {
              inputField: 'feeForCurrConv',
              outputField: 'feeUsd'
            }
          ]
        }
      )

    return convertedTrades
  }

  _getStartMtsFromTrades (trades) {
    if (
      !Array.isArray(trades) ||
      trades.length === 0
    ) {
      return 0
    }

    const { mtsCreate } = { ...trades[trades.length - 1] }

    return mtsCreate
  }

  async getGroupedDataIn (
    fieldName,
    {
      auth = {},
      params = {}
    } = {}
  ) {
    const {
      start = 0,
      end = Date.now(),
      timeframe = 'day'
    } = { ...params }
    const {
      symbolFieldName: tradesSymbolFieldName
    } = this.tradesMethodColl

    const trades = await this.getTrades({
      auth,
      params: {
        ...params,
        start,
        end,
        timeframe
      }
    })

    const tradesGroupedByTimeframe = await groupByTimeframe(
      trades,
      timeframe,
      this.FOREX_SYMBS,
      'mtsCreate',
      tradesSymbolFieldName,
      this._calcTrades(fieldName)
    )
    const mtsGroupedByTimeframe = getMtsGroupedByTimeframe(
      this._getStartMtsFromTrades(trades),
      end,
      timeframe
    )

    const groupedData = await calcGroupedData(
      {
        tradesGroupedByTimeframe,
        mtsGroupedByTimeframe
      },
      false,
      this._getTradesByTimeframe(),
      true
    )

    return groupedData
  }
}

decorate(injectable(), Trades)
decorate(inject(TYPES.DAO), Trades, 0)
decorate(inject(TYPES.ALLOWED_COLLS), Trades, 1)
decorate(inject(TYPES.SyncSchema), Trades, 2)
decorate(inject(TYPES.FOREX_SYMBS), Trades, 3)
decorate(inject(TYPES.CurrencyConverter), Trades, 4)

module.exports = Trades