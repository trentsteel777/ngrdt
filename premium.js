#!/usr/bin/env node
'use strict'

const fs = require('fs')
const axios = require('axios')
const { EJDB2 } = require('ejdb2_node')
const { thirdFridayOfNextMonth, today } = require('./src/utils.js')
const { logger } = require('./src/logger.js')
const sleep = require('sleep')

const googleRunSample = require('./src/insert-column.js')

const symbols = fs.readFileSync('./src/resources/watchlist.txt').toString().split("\n")
const symbolsLength = process.env.NODE_ENV !== 'production' ? 1 : symbols.length

async function fetchAndSave() {
  logger.info(`Opening database.`)
  const db = await EJDB2.open('optionchains.db', { truncate: false })
  
  for (let i = 0; i < symbolsLength; i++) {
    try {
      let apiUrl = `https://query2.finance.yahoo.com/v7/finance/options/${symbols[i]}?formatted=true&lang=en-US&region=US&date=${thirdFridayOfNextMonth}`

      logger.info(`{${apiUrl}}`)
      let response = await axios.get(apiUrl)

      let key = response.data.optionChain.result[0].underlyingSymbol
      let json = response.data.optionChain.result[0]

      await db.put(key, json, today)

      let price = json.quote.regularMarketPrice
      let calls = json.options[0].calls
      let puts = json.options[0].puts


      sleep.msleep(1000)
    }
    catch (e) {
      logger.error('Error: ' + e)
    }
  }

  logger.info(`Closing database.`)
  await db.close()
}

/*
  https://github.com/trentsteel777/pygrdt/blob/master/analysisportal/views.py  
   annotations = {
      'marginOfSafety' : ( (F('optionChain__stock__price') - F('strike')) / F('optionChain__stock__price') ),
      'returnOnOption' : F('bid') / ((F('strike') * D(0.1)) + F('bid')),
      'marginPerContract' :  (((F('strike') * D(0.1)) + F('bid')) * sharesPerContract),
      'exposurePerContract' : (F('optionChain__stock__price') * sharesPerContract),
  } */
function filterPuts(puts, stockPrice) {
  let belowStrike = stockPrice * 0.85
  let sharesPerContract = 100

  let highPremiumPuts = []
  for(let i = 0; i < puts.length; i++) {
    let put = puts[i]
    let putStrike = put.strike.raw
    if(putStrike <= belowStrike) {
      highPremiumPuts.push({
        lastPrice : put.lastPrice.raw,
        marginOfSafety : (stockPrice - putStrike) / stockPrice,
        returnOnOption : lastPrice / ((putStrike * 0.1) + lastPrice),
        marginPerContract : (((putStrike * 0.1) + lastPrice) * sharesPerContract),
        exposurePerContract : (lastPrice * sharesPerContract)
      })

    }
  }
  return highPremiumPuts
}

function filterCalls(puts, price) {
  let aboveStrike = price * 1.15
  let sharesPerContract = 100


}

fetchAndSave()
  .catch(e => {
    logger.error('Error: ' + e.message);
  })
