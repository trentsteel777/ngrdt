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
const isProd = config.environment === 'production'

const symbols = fs.readFileSync('./src/resources/watchlist.txt').toString().split("\n")
const symbolsLength = isProd ? symbols.length : 1
const OUTPUT_SHEET_ID = 0
const OVERVIEW_SHEET_ID = 375661784


async function fetchAndSave() {
  logger.info(`Starting application.`)
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

      if(json.options[0].puts) {
        let puts = filterPuts(json.options[0].puts, json)
        outputArr.push(...puts)
      }
      else {
        logger.warn('No puts for: ' + symbols[i])
      }

      if(json.options[0].calls) {
        let calls = filterCalls(json.options[0].calls, json)
        outputArr.push(...calls)
      }
      else {
        logger.warn('No calls for: ' + symbols[i])
      }

      sleep.msleep(1000)
    }
    catch (e) {
      logger.error(e.message)
    }
  }

  await updateGoogleSheet(outputArr)
  //logger.info(`Closing database.`)
  //await db.close()

  logger.info(`Shutting down application.`)
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
  
  await outputSheet.clear()
  
  let headers = ['SYMBOL', 'STOCK PRICE', 'STRIKE', 'EXPIRY', 'TYPE', 'LAST PRICE', 'BID', 'ASK', 'VOLUME', 'OPEN INTEREST', 'MARGIN OF SAFETY', 
      'RETURN ON OPTION', 'EXPOSURE PER CONTRACT', 'RETURN ON CAPITAL','CONTRACT', 'EARNINGS', 'DIVIDEND', '52 WEEK RANGE']
  await outputSheet.setHeaderRow(headers)

  if(outputSheet.rowCount < optionsArr.length) {
    let missingRowCount = optionsArr.length + 1
    logger.info('Creating ' + missingRowCount + ' rows.')

    var blankRow = {}
    for(let i = 0; i < headers.length; i++)  blankRow[headers[i]] = ''

    let emptyRowArray = [...Array(missingRowCount)].map(e => blankRow) 

    await outputSheet.addRows(emptyRowArray, { raw : false, insert : false })
  }

  await outputSheet.loadCells('A1:'+ columnToLetter(headers.length) + (optionsArr.length + 1)); // loads a range of cells
  const batchSize = 1000
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
    outputSheet.getCell(cellIndx, colIndx++).value = option.bid
    outputSheet.getCell(cellIndx, colIndx++).value = option.ask
    outputSheet.getCell(cellIndx, colIndx++).value = option.volume
    outputSheet.getCell(cellIndx, colIndx++).value = option.openInterest

    outputSheet.getCell(cellIndx, colIndx++).value = option.marginOfSafety
    outputSheet.getCell(cellIndx, colIndx++).value = option.returnOnOption
    outputSheet.getCell(cellIndx, colIndx++).value = option.exposurePerContract
    outputSheet.getCell(cellIndx, colIndx++).value = option.returnOnCapital

    outputSheet.getCell(cellIndx, colIndx++).value = option.contractSymbol
    outputSheet.getCell(cellIndx, colIndx++).value = option.earningsDate
    outputSheet.getCell(cellIndx, colIndx++).value = option.dividendDate
    outputSheet.getCell(cellIndx, colIndx++).value = option.fiftyTwoWeekRange

    if(i + 1 === optionsArr.length) {
      logger.info('POSTing final data to spreadsheet.')
      await outputSheet.saveUpdatedCells()
    }
    else if(i !== 0 && i % batchSize === 0) {
      let num = parseInt(i / batchSize)
      let lastBatch = parseInt(optionsArr.length / batchSize)
      logger.info(`POSTing batch ${num} of ${lastBatch} to spreadsheet.`)
      await outputSheet.saveUpdatedCells()
    }
  }

  
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
function filterPuts(options, json) {
  let stockPrice = json.quote.regularMarketPrice
  let belowStrike = stockPrice * 0.85
  let sharesPerContract = 100

  let filteredOptions = []
  for(let i = 0; i < options.length; i++) {
    let option = options[i]
    let strike = option.strike.raw
    if(strike <= belowStrike) {
      let bid = option.bid.raw
      filteredOptions.push({
        symbol : json.underlyingSymbol,
        stockPrice : stockPrice,
        strike: strike,
        expiry: option.expiration.fmt,
        type: 'PUT',

        lastPrice : option.lastPrice.raw,
        bid: bid,
        ask: option.ask.raw,
        volume: option.volume ? option.volume.raw : 0,
        openInterest: option.openInterest.raw,

        marginOfSafety : (stockPrice - strike) / stockPrice,
        returnOnOption : bid / ((strike * 0.1) + bid),
        marginPerContract : (((strike * 0.1) + bid) * sharesPerContract),
        exposurePerContract : (strike * sharesPerContract),
        returnOnCapital: bid / stockPrice,

        contractSymbol: option.contractSymbol,	
        earningsDate: formatUnixDate(json.quote.earningsTimestamp),
        dividendDate: formatUnixDate(json.quote.dividendDate),	
        fiftyTwoWeekRange: json.quote.fiftyTwoWeekRange
      })

    }
  }
  return filteredOptions
}

function filterCalls(options, json) {
  let stockPrice = json.quote.regularMarketPrice
  let aboveStrike = stockPrice * 1.15
  let sharesPerContract = 100

  let filteredOptions = []
  for(let i = 0; i < options.length; i++) {
    let option = options[i]
    let strike = option.strike.raw
    if(strike >= aboveStrike) {
      let bid = option.bid.raw
      filteredOptions.push({
        symbol : json.underlyingSymbol,
        stockPrice : stockPrice,
        strike: strike,
        expiry: option.expiration.fmt,
        type: 'CALL',

        lastPrice : option.lastPrice.raw,
        bid: bid,
        ask: option.ask.raw,
        volume: option.volume ? option.volume.raw : 0,
        openInterest: option.openInterest.raw,

        marginOfSafety : (strike - stockPrice) / stockPrice,
        returnOnOption : bid / ((strike * 0.1) + bid),
        marginPerContract : (((strike * 0.1) + bid) * sharesPerContract),
        exposurePerContract : (strike * sharesPerContract),
        returnOnCapital: bid / stockPrice,

        contractSymbol: option.contractSymbol,	
        earningsDate: formatUnixDate(json.quote.earningsTimestamp),
        dividendDate: formatUnixDate(json.quote.dividendDate),	
        fiftyTwoWeekRange: json.quote.fiftyTwoWeekRange
      })

    }
  }
  return filteredOptions
}

fetchAndSave()
  .catch(e => {
    logger.error(e.message);
  })

// https://stackoverflow.com/questions/21229180/convert-column-index-into-corresponding-column-letter
function columnToLetter(column) {
  var temp, letter = '';
  while (column > 0)
  {
    temp = (column - 1) % 26;
    letter = String.fromCharCode(temp + 65) + letter;
    column = (column - temp - 1) / 26;
  }
  return letter;
}

function letterToColumn(letter) {
  var column = 0, length = letter.length;
  for (var i = 0; i < length; i++)
  {
    column += (letter.charCodeAt(i) - 64) * Math.pow(26, length - i - 1);
  }
  return column;
}