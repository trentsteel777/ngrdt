#!/usr/bin/env node
'use strict'

const fs = require('fs')
const axios = require('axios')
var os = require("os");
//const { EJDB2 } = require('ejdb2_node')
const { thirdFridayOfNextMonth, nextSixFridaysUnixArr /* thirdFridayOfNextMonth is removed from this */, formatUnixDate } = require('./src/utils.js')

const { logger } = require('./src/logger.js')
const sleep = require('sleep')
const moment = require('moment')
const { GoogleSpreadsheet } = require('google-spreadsheet');
const xpath = require('xpath')
const dom = require('xmldom').DOMParser


const config = require('./application_properties.json')
const isProd = config.environment === 'production'

const symbols = fs.readFileSync('./src/resources/watchlist.txt').toString().split("\n")
const symbolsLength = isProd ? symbols.length : 1
const OUTPUT_SHEET_ID = 0
const OVERVIEW_SHEET_ID = 375661784
const SECTORS_FILE_LOC = './src/resources/sectors.txt'
const BATCH_SIZE = 1000

let header_config = {
  headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:126.0) Gecko/20100101 Firefox/126.0",
      Accept: "*/*",
      "Accept-Language": "en-GB,en;q=0.5",
      "Accept-Encoding": "gzip, deflate, br, zstd",
      Referer: "https://finance.yahoo.com/quote/AAPL/options/",
      "Content-Type": "text/plain",
      Origin: "https://finance.yahoo.com",
      Connection: "keep-alive",
      Cookie: "GUC=AQABCAFmM-VmZEIeLAQy&s=AQAAAFcOYMD8&g=ZjKe3g; A1=d=AQABBAMFn2UCELaarNGHlTIObFHZwR1VlYQFEgABCAHlM2ZkZuIjb2UB9qMAAAcIAQWfZYKw0mI&S=AQAAAspdWcZCG_vcCQOG5cwIauQ; A3=d=AQABBAMFn2UCELaarNGHlTIObFHZwR1VlYQFEgABCAHlM2ZkZuIjb2UB9qMAAAcIAQWfZYKw0mI&S=AQAAAspdWcZCG_vcCQOG5cwIauQ; cmp=t=1717606887&j=1&u=1---&v=29; PRF=t%3DELOX%252BPANW%252BPYPL%252BCOIN%252BSLV%252BEURUSD%253DX%252BNVDA%252BPLTR%252BNKE%252BTSLA%252BSPY%252BGLD%252BTLT%252BIEF%252BBB%26newChartbetateaser%3D1; axids=gam=y-IVEA9vlE2uJkoK8j5IpbEbjgu6168y.F~A&dv360=eS0ySmc1Snh0RTJ1SDVKb0NNOTQ4TjBkMXhSQTZ2WEVEWH5B&ydsp=y-.h8eHlBE2uLifzKlhnTatUkr8toNw.Rj~A&tbla=y-pz4K8WVE2uKYEA.FnTcZun2697i1uAi6~A; tbla_id=a42f4d8d-6685-4b70-b592-29ca1fba5071-tuctd2c245e; A1S=d=AQABBAMFn2UCELaarNGHlTIObFHZwR1VlYQFEgABCAHlM2ZkZuIjb2UB9qMAAAcIAQWfZYKw0mI&S=AQAAAspdWcZCG_vcCQOG5cwIauQ; EuConsent=CP4KqwAP4KqwAAOACBENA3EoAP_gAEPgACiQJhNB9G7WTXFneXp2YPskOYUX0VBJ4MAwBgCBAcABzBIUIAwGVmAzJEyIICACGAIAIGJBIABtGAhAQEAAYIAFAABIAEEAABAAIGAAACAAAABACAAAAAAAAAAQgEAXMBQgmAZEAFoIQUhAhgAgAQAAIAAEAIgBAgQAEAAAQAAICAAIACgAAgAAAAAAAAAEAFAIEQAAAAECAotkfQTBADINSogCLAkJCIQcIIEAIgoCACgQAAAAECAAAAmCAoQBgEqMBEAIEQAAAAAAAAQEACAAACABCAAIAAgQAAAAAQAAAAACAAAEAAAAAAAAAAAAAAAAAAAAAAAAAMQAhBAACAACAAgoAAAABAAAAAAAAIARAAAAAAAAAAAAAAAAARAAAAAAAAAAAAAAAAAAAQIAAAAAAABAAILAAA",
      "Sec-Fetch-Dest": "empty",
      "Sec-Fetch-Mode": "cors",
      "Sec-Fetch-Site": "same-site",
      Priority: "u=4",
      TE: "trailers"
  }
}

async function fetchCrumb() {
  try {
      const response = await axios.get("https://query2.finance.yahoo.com/v1/test/getcrumb", header_config);

      const crumb = response.data;

      logger.info("crumb: " + crumb);

      return crumb;
  } catch (e) {
      logger.error(e);
  }
}

async function fetchAndSave() {
  logger.info(`Starting application.`)
  //logger.info(`Opening database.`)
  //const db = await EJDB2.open('optionchains.db', { truncate: false })

  let crumb = await fetchCrumb()
  let outputArr = []
  var symbol = null;
  for (let i = 0; i < symbolsLength; i++) {
    try {
      symbol = symbols[i].trim()
      let isFetchWeeklies = await requestOptionChain(symbol, thirdFridayOfNextMonth, outputArr, crumb)
      sleep.msleep(1000)

      if(isFetchWeeklies.length > 0) {
        let extraExpirationDates = isFetchWeeklies.filter( ed => nextSixFridaysUnixArr.indexOf(ed) > -1)
        for(let j = 0; j < extraExpirationDates.length; j++) {
          await requestOptionChain(symbol, extraExpirationDates[j], outputArr, crumb)
          sleep.msleep(1000)
        }
      }
      
    }
    catch (e) {
      logger.error(symbol + ': ' + e)
    }
  }
 
  let sectorInfoMap = getSectorInfoMap()
  for(var i = 0; i < outputArr.length; i++) {
    let option = outputArr[i]
    let symbol = option.symbol
    let sectorInfo = sectorInfoMap[symbol]
    if(!sectorInfo) {
      sectorInfo = await addSectorInfoToFile(symbol)
      sectorInfoMap[symbol] = sectorInfo
      sleep.msleep(1000)
    }
    option.sector = sectorInfo.sector
    option.industry = sectorInfo.industry
  }

  await updateGoogleSheet(outputArr)
  //logger.info(`Closing database.`)
  //await db.close()

  logger.info(`Shutting down application.`)
}

async function requestOptionChain(symbol, expirationDateUnix, outputArr, crumb) {
  let apiUrl = `https://query2.finance.yahoo.com/v7/finance/options/${symbol}?formatted=true&lang=en-US&region=US&date=${expirationDateUnix}&crumb=${crumb}`
    
  logger.info(`{${apiUrl}}`)
  let response = await axios.get(apiUrl, header_config)
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

  if(calls.length > 0 || puts.length > 0) {
    return json.expirationDates
  }
  return []
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
  
  let headers = ['SYMBOL', 'STOCK PRICE', 'STRIKE',  'TYPE', 'BID', 'EXPOSURE PER CONTRACT', 
      'RETURN ON CAPITAL', 'OPEN INTEREST', 'SECTOR', 'INDUSTRY', '52 WEEK RANGE',
      'MARGIN OF SAFETY', 'RETURN ON OPTION', 'CONTRACT', 'EARNINGS', 
      'DIVIDEND', 'EXCHANGE', 'LAST PRICE', 'ASK', 'VOLUME', 'EXPIRY']
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
    outputSheet.getCell(cellIndx, colIndx++).value = option.type
    
    outputSheet.getCell(cellIndx, colIndx++).value = option.bid
    
    outputSheet.getCell(cellIndx, colIndx++).value = option.exposurePerContract
    outputSheet.getCell(cellIndx, colIndx++).value = option.returnOnCapital

    outputSheet.getCell(cellIndx, colIndx++).value = option.openInterest
    
    outputSheet.getCell(cellIndx, colIndx++).value = option.sector
    outputSheet.getCell(cellIndx, colIndx++).value = option.industry
    
    outputSheet.getCell(cellIndx, colIndx++).value = option.fiftyTwoWeekRange
    
    outputSheet.getCell(cellIndx, colIndx++).value = option.marginOfSafety
    outputSheet.getCell(cellIndx, colIndx++).value = option.returnOnOption
    outputSheet.getCell(cellIndx, colIndx++).value = option.contractSymbol
    outputSheet.getCell(cellIndx, colIndx++).value = option.earningsDate
    outputSheet.getCell(cellIndx, colIndx++).value = option.dividendDate
    outputSheet.getCell(cellIndx, colIndx++).value = option.exchange
    
    outputSheet.getCell(cellIndx, colIndx++).value = option.lastPrice
    outputSheet.getCell(cellIndx, colIndx++).value = option.ask
    outputSheet.getCell(cellIndx, colIndx++).value = option.volume
    outputSheet.getCell(cellIndx, colIndx++).value = option.expiry

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
      let returnOnCapital = bid / strike
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
          earningsDate: json.quote.earningsTimestamp ? formatUnixDate(json.quote.earningsTimestamp) : 'UNKNOWN',
          dividendDate: json.quote.dividendDate ? formatUnixDate(json.quote.dividendDate) : 'UNKNOWN',	
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
      let returnOnCapital = bid / strike
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
          earningsDate: json.quote.earningsTimestamp ? formatUnixDate(json.quote.earningsTimestamp) : 'UNKNOWN',
          dividendDate: json.quote.dividendDate ? formatUnixDate(json.quote.dividendDate) : 'UNKNOWN',	
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

function getSectorInfoMap() {
  let sectorInfoMap = {}
  let sectors = fs.readFileSync(SECTORS_FILE_LOC).toString().split(os.EOL)

  sectors = sectors.filter((el) => el.length > 0) // filter out empty lines
  for(let i = 0; i < sectors.length; i++) {
    let sectorInfoArray = sectors[i].trim().split(",")
    let symbol = sectorInfoArray[0]
    let sector = sectorInfoArray[1]
    let industry = sectorInfoArray[2]

    sectorInfoMap[symbol] = {
      sector: sector,
      industry: industry
    }

    //console.log(symbol + " : " + sectorInfoMap[symbol])
  }
  return sectorInfoMap
}

async function addSectorInfoToFile(symbol) {
  let sector = null
  let industry = null
  let source = null
  try {
    source = "yahoo"
    let yahooProfileUrl=`https://query2.finance.yahoo.com/v10/finance/quoteSummary/${symbol}?modules=summaryProfile`
    let profileResponse = await axios.get(yahooProfileUrl, header_config)
    let summaryProfile	= profileResponse.data.quoteSummary.result[0].summaryProfile
    if(summaryProfile.sector && summaryProfile.industry) {
      sector = summaryProfile.sector.trim()
      industry = summaryProfile.industry.trim()
    }
  }
  catch(e) {
    logger.error("Failed to get sector and industry from yahoo.\n" + e);
  }

  if(!sector || !industry) {
    try {
      source = "finviz"
      let finvizUrl = `https://finviz.com/quote.ashx?t=${symbol}&ty=c&ta=1&p=d`
      let finvizResponse = await axios.get(finvizUrl)

      // https://stackoverflow.com/questions/56213117/how-to-silent-all-the-warning-messages-of-xml-dom-in-node-js
      let doc = new dom({
          locator: {},
          errorHandler: { warning: function (w) { }, 
          error: function (e) { }, 
          fatalError: function (e) { console.error(e) } }
        })
        .parseFromString(finvizResponse.data)

      let nodes = xpath.select("//table[@class='fullview-title']//tr[3]", doc)
      let finvizInfoArr = nodes[0].firstChild.textContent.split("|")
      sector = finvizInfoArr[0].trim()
      industry = finvizInfoArr[1].trim()
    }
    catch(e) {
      logger.error("Failed to get sector and industry from finviz.\n" + e);
    }
  }

  let line = `${symbol},${sector},${industry}`
  try {
    fs.appendFileSync(SECTORS_FILE_LOC, line + os.EOL);
    logger.info(`${line} - ${SECTORS_FILE_LOC} - ${source}`);
  } catch (err) {
    logger.error(err);
  }
  
  return {
    sector:sector,
    industry:industry
  }
  
}
