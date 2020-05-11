#!/usr/bin/env node
'use strict'

const fs = require('fs')
const axios = require('axios')
const { EJDB2 } = require('ejdb2_node')
const { thirdFridayOfNextMonth, today, formatUnixDate } = require('./src/utils.js')
const { logger } = require('./src/logger.js')
const sleep = require('sleep')
const moment = require('moment')
const { GoogleSpreadsheet } = require('google-spreadsheet');
const config = require('./application_properties.json')


const symbols = fs.readFileSync('./src/resources/watchlist.txt').toString().split("\n")
const symbolsLength = process.env.NODE_ENV !== 'production' ? 1 : symbols.length
const OUTPUT_SHEET_ID = 0
const OVERVIEW_SHEET_ID = 375661784

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

      //let calls = json.options[0].calls
      let puts = filterPuts(json.options[0].puts, json)
      
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
  const doc = new GoogleSpreadsheet(config.googleSheetId);
  
  if(!doc) {
    let errMsg = 'Could not connect to Google Sheet'
    logger.error(errMsg)
    throw new Error(errMsg)
  }
  // use service account creds
  await doc.useServiceAccountAuth(require('./client_secret.json'));

  await doc.loadInfo(); // loads document properties and worksheets
  const outputSheet = doc.sheetsById[OUTPUT_SHEET_ID];

  if(!outputSheet) {
    let errMsg = 'Could not find OUTPUT sheet'
    logger.error(errMsg)
    throw new Error(errMsg)
  }

  outputSheet.clear()

  await outputSheet.loadCells('A1:N' + (optionsArr.length + 1)); // loads a range of cells

  // PRINT HEADER
  let colIndx = 0;
  outputSheet.getCell(0, colIndx++).value = 'SYMBOL'
  outputSheet.getCell(0, colIndx++).value = 'STOCK PRICE'
  outputSheet.getCell(0, colIndx++).value = 'STRIKE'
  outputSheet.getCell(0, colIndx++).value = 'EXPIRY'
  outputSheet.getCell(0, colIndx++).value = 'TYPE'

  outputSheet.getCell(0, colIndx++).value = 'LAST PRICE'
  outputSheet.getCell(0, colIndx++).value = 'MARGIN OF SAFETY'
  outputSheet.getCell(0, colIndx++).value = 'RETURN ON OPTION'
  outputSheet.getCell(0, colIndx++).value = 'EXPOSURE PER CONTRACT'

  outputSheet.getCell(0, colIndx++).value = 'CONTRACT'
  outputSheet.getCell(0, colIndx++).value = 'EARNINGS'
  outputSheet.getCell(0, colIndx++).value = 'DIVIDEND'
  outputSheet.getCell(0, colIndx++).value = '52 WEEK RANGE'

  for(let i = 0; i < optionsArr.length; i++) {
    let option = optionsArr[i]
    let cellIndx = i + 1

    let colIndx = 0;
    outputSheet.getCell(cellIndx, colIndx++).value = option.symbol
    outputSheet.getCell(cellIndx, colIndx++).value = option.stockPrice
    outputSheet.getCell(cellIndx, colIndx++).value = option.strike
    outputSheet.getCell(cellIndx, colIndx++).value = option.expiry
    outputSheet.getCell(cellIndx, colIndx++).value = option.type

    outputSheet.getCell(cellIndx, colIndx++).value = option.lastPrice
    outputSheet.getCell(cellIndx, colIndx++).value = option.marginOfSafety
    outputSheet.getCell(cellIndx, colIndx++).value = option.returnOnOption
    outputSheet.getCell(cellIndx, colIndx++).value = option.exposurePerContract

    outputSheet.getCell(cellIndx, colIndx++).value = option.contractSymbol
    outputSheet.getCell(cellIndx, colIndx++).value = option.earningsDate
    outputSheet.getCell(cellIndx, colIndx++).value = option.dividendDate
    outputSheet.getCell(cellIndx, colIndx++).value = option.fiftyTwoWeekRange
  }
  await outputSheet.saveUpdatedCells()


  
  const overviewSheet = doc.sheetsById[OVERVIEW_SHEET_ID];
  if(!overviewSheet) {
    logger.warn('Could not find OVERVIEW sheet. Cannot update last updated time.')
  }

  let range = 10;
  await overviewSheet.loadCells('A1:B' + range); // loads a range of cells
  for(let i = 0; i <= range; i++) {
    if('last_updated' === overviewSheet.getCell(i, 0).value) {
      overviewSheet.getCell(i, 1).value = moment().format('YYYY-MM-DD HH:mm:ss')
      break;
    }
  }
  await overviewSheet.saveUpdatedCells()
}

/*
  https://github.com/trentsteel777/pygrdt/blob/master/analysisportal/views.py  
   annotations = {
      'marginOfSafety' : ( (F('optionChain__stock__price') - F('strike')) / F('optionChain__stock__price') ),
      'returnOnOption' : F('bid') / ((F('strike') * D(0.1)) + F('bid')),
      'marginPerContract' :  (((F('strike') * D(0.1)) + F('bid')) * sharesPerContract),
      'exposurePerContract' : (F('optionChain__stock__price') * sharesPerContract),
  } */
function filterPuts(puts, json) {
  let stockPrice = json.quote.regularMarketPrice
  let belowStrike = stockPrice * 0.85
  let sharesPerContract = 100

  let highPremiumPuts = []
  for(let i = 0; i < puts.length; i++) {
    let put = puts[i]
    let putStrike = put.strike.raw
    if(putStrike <= belowStrike) {
      let lastPrice = put.lastPrice.raw
      highPremiumPuts.push({
        symbol : json.underlyingSymbol,
        stockPrice : stockPrice,
        strike: putStrike,
        expiry: put.expiration.fmt,
        type: 'PUT',

        lastPrice : lastPrice,
        marginOfSafety : (stockPrice - putStrike) / stockPrice,
        returnOnOption : lastPrice / ((putStrike * 0.1) + lastPrice),
        marginPerContract : (((putStrike * 0.1) + lastPrice) * sharesPerContract),
        exposurePerContract : (putStrike * sharesPerContract),

        contractSymbol: put.contractSymbol,	
        earningsDate: formatUnixDate(json.quote.earningsTimestamp),
        dividendDate: formatUnixDate(json.quote.dividendDate),	
        fiftyTwoWeekRange: json.quote.fiftyTwoWeekRange
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
