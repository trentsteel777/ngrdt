#!/usr/bin/env node
'use strict'

const fs = require('fs')
const axios = require('axios')
const { EJDB2 } = require('ejdb2_node')
const { thirdFridayOfNextMonth, today } = require('./src/utils.js')
const { logger } = require('./src/logger.js')
const sleep = require('sleep')

const symbols = fs.readFileSync('./src/resources/watchlist.txt').toString().split("\n")
const symbolsLength = process.env.NODE_ENV !== 'production' ? 3 : symbols.length

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
    const q = db.createQuery('/*', symbols[i])

    for await (const doc of q.stream()) {
      //logger.info(`Found ${doc.id} : ${doc.json.underlyingSymbol}`)
    }
  }

  logger.info(`Closing database.`)
  await db.close()
}

fetchAndSave()
  .catch(e => {
    logger.error('Error: ' + e.message);
  })
