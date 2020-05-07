#!/usr/bin/env node
'use strict'

const fs = require('fs')
const axios = require('axios')
const { EJDB2 } = require('ejdb2_node')
const { thirdFridayOfNextMonth, today } = require('./src/utils.js')
const { logger } = require('./src/logger.js')
const sleep = require('sleep')
const { GoogleSpreadsheet } = require('google-spreadsheet');

const symbols = fs.readFileSync('./src/resources/watchlist.txt').toString().split("\n")
const symbolsLength = process.env.NODE_ENV !== 'production' ? 1 : symbols.length

async function fetchAndSave() {
  //logger.info(`Opening database.`)
  //const db = await EJDB2.open('optionchains.db', { truncate: false })
  
  let outputArr = []
  for (let i = 0; i < symbolsLength; i++) {
    try {
      let apiUrl = `https://query2.finance.yahoo.com/v7/finance/options/${symbols[i]}?formatted=true&lang=en-US&region=US&date=${thirdFridayOfNextMonth}`

      logger.info(`{${apiUrl}}`)
      let response = await axios.get(apiUrl)

      let key = response.data.optionChain.result[0].underlyingSymbol
      let json = response.data.optionChain.result[0]

      //await db.put(key, json, today)

      let price = json.quote.regularMarketPrice
      //let calls = json.options[0].calls
      let puts = filterPuts(json.options[0].puts, price)
      
      outputArr.push(...puts)

      sleep.msleep(1000)
    }
    catch (e) {
      logger.error('Error: ' + e)
    }
  }
  await updateGoogleSheet(outputArr)
  //logger.info(`Closing database.`)
  //await db.close()
}


// https://codelabs.developers.google.com/codelabs/sheets-api/#5
// https://console.developers.google.com/apis/credentials/wizard?api=sheets.googleapis.com&project=findpremiums
// https://www.fastcomet.com/tutorials/nodejs/google-spreadsheet-package
// https://www.npmjs.com/package/google-spreadsheet
async function updateGoogleSheet(optionsArr) {

  // spreadsheet key is the long id in the sheets URL
  const doc = new GoogleSpreadsheet('15U8xKl3Aleop4tZASViSOFAAmbGDTCiBYf9gsiXOj1Q');

  // use service account creds
  await doc.useServiceAccountAuth(require('./client_secret.json'));

  await doc.loadInfo(); // loads document properties and worksheets
  const sheet = doc.sheetsByIndex[0]; 
  await sheet.loadCells('A1:E10'); // loads a range of cells

  for(let i = 0; i < optionsArr.length; i++) {
    let option = optionsArr[i]
    let cellIndx = i + 1
    sheet.getCell(cellIndx, 0).value = option.lastPrice
    sheet.getCell(cellIndx, 1).value = option.marginOfSafety
    sheet.getCell(cellIndx, 2).value = option.returnOnOption
    sheet.getCell(cellIndx, 3).value = option.exposurePerContract
  }
  await sheet.saveUpdatedCells()

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
    if(true || putStrike <= belowStrike) {
      let lastPrice = put.lastPrice.raw
      highPremiumPuts.push({
        lastPrice : lastPrice,
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
