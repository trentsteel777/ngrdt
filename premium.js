#!/usr/bin/env node
'use strict'

const fs = require('fs')
const axios = require('axios')
const { EJDB2 } = require('ejdb2_node')
const { thirdFridayOfNextMonth, today } = require('./src/utils.js')
const { logger } = require('./src/logger.js')
const sleep = require('sleep')

const symbols = fs.readFileSync('./src/resources/watchlist.txt').toString().split("\n")
const symbolsLength = process.env.NODE_ENV !== 'production' ? 1 : symbols.length

async function fetchAndSave() {
  logger.info(`Opening database.`)
  const db = await EJDB2.open('optionchains.db', { truncate: true })
  
  for (let i = 0; i < symbolsLength; i++) {
    try {
      let apiUrl = `https://query2.finance.yahoo.com/v7/finance/options/${symbols[i]}?formatted=true&lang=en-US&region=US&date=${thirdFridayOfNextMonth}`

      logger.info(`{${apiUrl}}`)
      let response = await axios.get(apiUrl)

      let key = response.data.optionChain.result[0].underlyingSymbol
      let json = response.data.optionChain.result[0]

      await db.put(key, json, today)

      sleep.msleep(500)
    }
    catch (e) {
      logger.error('Error: ' + e)
    }
  }


  for (let i = 0; i < symbolsLength; i++) {
    try { //"contractSymbol": "A200619C00070000"
      const q = db.createQuery('/options/0/calls/*/percentChange/[raw = 0] | /options/0/calls/*/percentChange/raw + /hasMiniOptions', symbols[i]) // [hasMiniOptions = :hasMiniOptions]
  
      for await (const doc of q.stream()) { // .setBoolean('hasMiniOptions', false) .setBoolean('inTheMoney', true)
        logger.info(`Found ${doc} `)
      }
    }
    catch(e) {
      logger.error('Error reading DB: ' + e)
    }
  }

  logger.info(`Closing database.`)
  await db.close()
}

fetchAndSave()
  .catch(e => {
    logger.error('Error: ' + e.message);
  })
