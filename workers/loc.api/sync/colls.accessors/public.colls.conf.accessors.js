'use strict'

const { pick } = require('lodash')
const {
  decorate,
  injectable,
  inject
} = require('inversify')

const TYPES = require('../../di/types')

class PublicСollsСonfAccessors {
  constructor (dao) {
    this.dao = dao
  }

  async editPublicСollsСonf (confName, args) {
    const name = 'publicСollsСonf'
    const data = []

    if (Array.isArray(args.params)) {
      data.push(...args.params)
    } else {
      data.push(args.params)
    }

    const { _id } = await this.dao.checkAuthInDb(args)
    const conf = await this.dao.getElemsInCollBy(
      name,
      {
        filter: {
          confName,
          user_id: _id
        },
        sort: [['symbol', 1]]
      }
    )
    const newData = data.reduce((accum, curr) => {
      if (
        conf.every(item => item.symbol !== curr.symbol) &&
        accum.every(item => item.symbol !== curr.symbol)
      ) {
        accum.push({
          ...pick(curr, ['symbol', 'start']),
          confName,
          user_id: _id
        })
      }

      return accum
    }, [])
    const removedSymbols = conf.reduce((accum, curr) => {
      if (
        data.every(item => item.symbol !== curr.symbol) &&
        accum.every(symbol => symbol !== curr.symbol)
      ) {
        accum.push(curr.symbol)
      }

      return accum
    }, [])
    const updatedData = data.reduce((accum, curr) => {
      if (
        conf.some(item => item.symbol === curr.symbol) &&
        accum.every(item => item.symbol !== curr.symbol)
      ) {
        accum.push({
          ...curr,
          confName,
          user_id: _id
        })
      }

      return accum
    }, [])

    if (newData.length > 0) {
      await this.dao.insertElemsToDb(
        name,
        null,
        newData
      )
    }
    if (removedSymbols.length > 0) {
      await this.dao.removeElemsFromDb(
        name,
        args.auth,
        {
          confName,
          user_id: _id,
          symbol: removedSymbols
        }
      )
    }

    await this.dao.updateElemsInCollBy(
      name,
      updatedData,
      ['confName', 'user_id', 'symbol'],
      ['start']
    )
  }

  async getPublicСollsСonf (confName, args) {
    const { _id } = await this.dao.checkAuthInDb(args)
    const conf = await this.dao.getElemsInCollBy(
      'publicСollsСonf',
      {
        filter: {
          confName,
          user_id: _id
        },
        sort: [['symbol', 1]]
      }
    )
    const res = conf.map(item => pick(item, ['symbol', 'start']))

    return res
  }
}

decorate(injectable(), PublicСollsСonfAccessors)
decorate(inject(TYPES.DAO), PublicСollsСonfAccessors, 0)

module.exports = PublicСollsСonfAccessors
