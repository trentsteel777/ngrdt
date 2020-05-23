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
const WATCHLIST_SHEET_ID = 596817924

const TARGET_RETURN = (option) => option.returnOnCapital <= 0.12 && option.returnOnCapital >= 0.08
const ADD_REDUCER = (accumulator, option) => accumulator + option.returnOnCapital

const BATCH_SIZE = 1000

async function fetchAndSave() {
  logger.info(`Starting application.`)
  //logger.info(`Opening database.`)
  //const db = await EJDB2.open('optionchains.db', { truncate: false })

  let outputArr = []
  let watchlistRecords = []
  var symbol = null;
  for (let i = 0; i < symbolsLength; i++) {
    try {
      symbol = symbols[i]
      let apiUrl = `https://query2.finance.yahoo.com/v7/finance/options/${symbol}?formatted=true&lang=en-US&region=US&date=${thirdFridayOfNextMonth}`
      
      logger.info(`{${apiUrl}}`)
      let response = await axios.get(apiUrl)
      
      let json = response.data.optionChain.result[0]
      
      //await db.put(symbol, json, today)
      let puts = []
      if(json.options[0].puts) {
        puts = filterPuts(json.options[0].puts, json)
        outputArr.push(...puts)
      }
      else {
        logger.warn('No puts for: ' + symbol)
      }
      let calls = []
      if(json.options[0].calls) {
        calls = filterCalls(json.options[0].calls, json)
        outputArr.push(...calls)
      }
      else {
        logger.warn('No calls for: ' + symbol)
      }
      
      
      if(calls.some(TARGET_RETURN) || puts.some(TARGET_RETURN)) {
        try {
          logger.info(`Adding ${symbol} to watchlist.`)
  
          let callAvgReturn = (calls.reduce(ADD_REDUCER, 0) / calls.length).toFixed(2)
          let putAvgReturn = (puts.reduce(ADD_REDUCER, 0) / puts.length).toFixed(2)
  
          sleep.msleep(100)
          let summaryProfileUrl = `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${symbol}?modules=summaryProfile`
          logger.info(`{${summaryProfileUrl}}`)
          let summaryProfileResponse = await axios.get(summaryProfileUrl)
          let summaryProfile = summaryProfileResponse.data.quoteSummary.result[0].summaryProfile
  
          sleep.msleep(100)
          let defaultKeyStatisticsUrl = `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${symbol}?modules=defaultKeyStatistics`
          logger.info(`{${defaultKeyStatisticsUrl}}`)
          let defaultKeyStatisticsResponse = await axios.get(defaultKeyStatisticsUrl)
          
          let beta = '';
          if(defaultKeyStatisticsResponse.data.quoteSummary.result) {
            let defaultKeyStatistics = defaultKeyStatisticsResponse.data.quoteSummary.result[0].defaultKeyStatistics
            
            if(defaultKeyStatistics.beta) {
              beta = defaultKeyStatistics.beta.raw
            }
            else if(defaultKeyStatistics.beta3Year) {
              beta = defaultKeyStatistics.beta3Year.raw
            }

          }

          let stockPrice = json.quote.regularMarketPrice
          let watchlistRecord = {
            symbol: symbol,
            stockPrice: stockPrice,
  
            sector: summaryProfile.sector,
            industry: summaryProfile.industry,
            employees: summaryProfile.fullTimeEmployees,
  
            marketcap: json.quote.marketCap,
  
            beta: beta,
  
            pe: stockPrice / json.quote.epsTrailingTwelveMonths,
            eps: json.quote.epsTrailingTwelveMonths,
            volume: json.quote.regularMarketVolume,
            avgVolume: json.quote.averageDailyVolume3Month,
  
            callReturn: callAvgReturn,
            putReturn: putAvgReturn,
  
            earningsDate: formatUnixDate(json.quote.earningsTimestamp),
            dividendDate: formatUnixDate(json.quote.dividendDate),
            fiftyTwoWeekRange: json.quote.fiftyTwoWeekRange,
            exchange: json.quote.exchange,
          }
          watchlistRecords.push(watchlistRecord)
        }
        catch(e) {
          logger.error(`Failed adding ${symbol} to watchlist. ` + e.message)
        }
      }

      sleep.msleep(1000)
    }
    catch (e) {
      logger.error(symbol + ': ' + e.message)
    }
  }
 
  await updateGoogleSheet(outputArr, watchlistRecords)
  //logger.info(`Closing database.`)
  //await db.close()

  logger.info(`Shutting down application.`)
}


// https://codelabs.developers.google.com/codelabs/sheets-api/#5
// https://console.developers.google.com/apis/credentials/wizard?api=sheets.googleapis.com&project=findpremiums
// https://www.fastcomet.com/tutorials/nodejs/google-spreadsheet-package
// https://www.npmjs.com/package/google-spreadsheet
async function updateGoogleSheet(optionsArr, watchlistRecords) {

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
      'RETURN ON OPTION', 'EXPOSURE PER CONTRACT', 'RETURN ON CAPITAL','CONTRACT', 'EARNINGS', 'DIVIDEND', '52 WEEK RANGE', 'EXCHANGE']
  await outputSheet.setHeaderRow(headers)

  if(outputSheet.rowCount < optionsArr.length) {
    let missingRowCount = optionsArr.length + 1
    logger.info('Creating ' + missingRowCount + ' rows in OUPUT sheet.')

    var blankRow = {}
    for(let i = 0; i < headers.length; i++)  blankRow[headers[i]] = ''

    let emptyRowArray = [...Array(missingRowCount)].map(e => blankRow) 

    await outputSheet.addRows(emptyRowArray, { raw : false, insert : false })
  }

  await outputSheet.loadCells('A1:'+ columnToLetter(headers.length) + (optionsArr.length + 1)); // loads a range of cells
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
    outputSheet.getCell(cellIndx, colIndx++).value = option.exchange

    if(i + 1 === optionsArr.length) {
      logger.info('POSTing final data to OUTPUT spreadsheet.')
      await outputSheet.saveUpdatedCells()
    }
    else if(i !== 0 && i % BATCH_SIZE === 0) {
      let num = parseInt(i / BATCH_SIZE)
      let lastBatch = parseInt(optionsArr.length / BATCH_SIZE)
      logger.info(`POSTing batch ${num} of ${lastBatch} to OUTPUT spreadsheet.`)
      await outputSheet.saveUpdatedCells()
    }
  }

  
  const overviewSheet = doc.sheetsById[OVERVIEW_SHEET_ID];
  if(!overviewSheet) {
    logger.warn('Could not find OVERVIEW sheet. Cannot update last updated time.')
  }
  else {
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

  // UPDATE WATCHLIST SHEET

  const watchlistSheet = doc.sheetsById[WATCHLIST_SHEET_ID];

  if(!watchlistSheet) {
    let errMsg = 'Could not find WATCHLIST sheet'
    logger.error(errMsg)
    throw new Error(errMsg)
  }
  
  await watchlistSheet.clear()
  
  let watchlistHeaders = ['SYMBOL', 'STOCK PRICE', 'SECTOR', 'INDUSTRY', 'EMPLOYEES', 'MARKET CAP', 'BETA', 'PE', 'EPS', 'VOLUME',
                  'AVG. VOLUME', 'CALL RETURN', 'PUT RETURN', 'EARNINGS', 'DIVIDEND', '52 WEEK RANGE', 'EXCHANGE']
  await watchlistSheet.setHeaderRow(watchlistHeaders)

  if(watchlistSheet.rowCount < watchlistRecords.length) {
    let missingRowCount = watchlistRecords.length + 1
    logger.info('Creating ' + missingRowCount + ' rows in WATCHLIST sheet.')

    var blankRow = {}
    for(let i = 0; i < watchlistHeaders.length; i++)  blankRow[watchlistHeaders[i]] = ''

    let emptyRowArray = [...Array(missingRowCount)].map(e => blankRow) 

    await watchlistSheet.addRows(emptyRowArray, { raw : false, insert : false })
  }

  await watchlistSheet.loadCells('A1:'+ columnToLetter(watchlistHeaders.length) + (watchlistRecords.length + 1)); // loads a range of cells
  for(let i = 0; i < watchlistRecords.length; i++) {
    let watchlistRecord = watchlistRecords[i]
    let cellIndx = i + 1

    let colIndx = 0;
    watchlistSheet.getCell(cellIndx, colIndx++).value = watchlistRecord.symbol
    watchlistSheet.getCell(cellIndx, colIndx++).value = watchlistRecord.stockPrice

    watchlistSheet.getCell(cellIndx, colIndx++).value = watchlistRecord.sector
    watchlistSheet.getCell(cellIndx, colIndx++).value = watchlistRecord.industry
    watchlistSheet.getCell(cellIndx, colIndx++).value = watchlistRecord.employees

    watchlistSheet.getCell(cellIndx, colIndx++).value = watchlistRecord.marketcap

    watchlistSheet.getCell(cellIndx, colIndx++).value = watchlistRecord.beta

    watchlistSheet.getCell(cellIndx, colIndx++).value = watchlistRecord.pe
    watchlistSheet.getCell(cellIndx, colIndx++).value = watchlistRecord.eps
    watchlistSheet.getCell(cellIndx, colIndx++).value = watchlistRecord.volume
    watchlistSheet.getCell(cellIndx, colIndx++).value = watchlistRecord.avgVolume

    watchlistSheet.getCell(cellIndx, colIndx++).value = watchlistRecord.callReturn
    watchlistSheet.getCell(cellIndx, colIndx++).value = watchlistRecord.putReturn

    watchlistSheet.getCell(cellIndx, colIndx++).value = watchlistRecord.earningsDate
    watchlistSheet.getCell(cellIndx, colIndx++).value = watchlistRecord.dividendDate
    watchlistSheet.getCell(cellIndx, colIndx++).value = watchlistRecord.fiftyTwoWeekRange
    watchlistSheet.getCell(cellIndx, colIndx++).value = watchlistRecord.exchange

    if(i + 1 === watchlistRecords.length) {
      logger.info('POSTing final data to WATCHLIST spreadsheet.')
      await watchlistSheet.saveUpdatedCells()
    }
    else if(i !== 0 && i % BATCH_SIZE === 0) {
      let num = parseInt(i / BATCH_SIZE)
      let lastBatch = parseInt(watchlistRecords.length / BATCH_SIZE)
      logger.info(`POSTing batch ${num} of ${lastBatch} to WATCHLIST spreadsheet.`)
      await watchlistSheet.saveUpdatedCells()
    }
  }

  
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
      let bid = option.bid ? option.bid.raw : 0
      let returnOnCapital = bid / stockPrice
      if(returnOnCapital >= 0.01) {
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
          openInterest: option.openInterest ? option.openInterest.raw : 0,
  
          marginOfSafety : (stockPrice - strike) / stockPrice,
          returnOnOption : bid / ((strike * 0.1) + bid),
          marginPerContract : (((strike * 0.1) + bid) * sharesPerContract),
          exposurePerContract : (strike * sharesPerContract),
          returnOnCapital: returnOnCapital,
  
          contractSymbol: option.contractSymbol,	
          earningsDate: formatUnixDate(json.quote.earningsTimestamp),
          dividendDate: formatUnixDate(json.quote.dividendDate),	
          fiftyTwoWeekRange: json.quote.fiftyTwoWeekRange,
          exchange: json.quote.fullExchangeName
        })
      }

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
      let bid = option.bid ? option.bid.raw : 0
      let returnOnCapital = bid / stockPrice
      if(returnOnCapital >= 0.01) {
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
          openInterest: option.openInterest ? option.openInterest.raw : 0,
  
          marginOfSafety : (strike - stockPrice) / stockPrice,
          returnOnOption : bid / ((strike * 0.1) + bid),
          marginPerContract : (((strike * 0.1) + bid) * sharesPerContract),
          exposurePerContract : (strike * sharesPerContract),
          returnOnCapital: returnOnCapital,
  
          contractSymbol: option.contractSymbol,	
          earningsDate: formatUnixDate(json.quote.earningsTimestamp),
          dividendDate: formatUnixDate(json.quote.dividendDate),	
          fiftyTwoWeekRange: json.quote.fiftyTwoWeekRange,
          exchange: json.quote.fullExchangeName
        })
      }

    }
  }
  return filteredOptions
}

fetchAndSave()
  .catch(e => {
    logger.error('fetchAndSave: ' + e.message);
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