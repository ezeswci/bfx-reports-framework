'use strict'

// TODO: returns just mock data for now
module.exports = async (dao, args) => {
  const res = [
    {
      mts: Date.UTC(2018, 11, 2),
      vals: { JPY: 500, GBP: 100, USD: 5000 }
    },
    {
      mts: Date.UTC(2018, 11, 3),
      vals: { EUR: -200, JPY: 400, GBP: 200, USD: 4000 }
    },
    {
      mts: Date.UTC(2018, 11, 4),
      vals: { EUR: -300, JPY: 300, GBP: 300 }
    },
    {
      mts: Date.UTC(2018, 11, 5),
      vals: { EUR: -400, JPY: 200, GBP: 400, USD: 2000 }
    },
    {
      mts: Date.UTC(2018, 11, 6),
      vals: { EUR: -500, JPY: 100, GBP: 500, USD: 1000 }
    },
    {
      mts: Date.UTC(2018, 11, 7),
      vals: { EUR: -600, GBP: 600 }
    }
  ]

  return res
}
