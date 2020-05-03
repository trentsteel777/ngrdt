#!/usr/bin/env node
'use strict'

const axios = require('axios')
const { EJDB2 } = require('ejdb2_node')
const moment = require('moment')
var sleep = require('sleep')
//https://finance.yahoo.com/quotes/MSFT,AAPL,AMZN,FB,BRK.B,GOOGL,GOOG,JNJ,JPM,V
// https://www.zacks.com/funds/etf/SPY/holding
// $('div[id^="Leaderboard-bottom"]').html($('#etf_holding_table').DataTable().columns( 1 ).data().eq( 0 ).sort().unique().join( '<br>' ))
async function run() {
  const db = await EJDB2.open('optionchains.db', { truncate: true })
  const symbols = [ 'MSFT','AAPL','AMZN'/* ,'BRK.B','GOOG','JNJ','JPM','V' */ ] //'RDS-B'
  for(var i = 0; i < symbols.length; i++) {
    let symbol = symbols[i]
    let apiUrl = `https://query2.finance.yahoo.com/v7/finance/options/${symbol}?formatted=true&lang=en-US&region=US&date=${thirdFridayOfNextMonth()}`
    
    axios.get(apiUrl).then(response => {
      var optionChain = response.data.optionChain
  
      db.put(symbol, optionChain)
    })
    .catch(err => {
      console.log('Error fetching data from: ' + err.config.url)
    })
    .finally(() => db.close())
  
    sleep.sleep(1)
  }
   
}
run()
.catch(err => {
  console.log('Error: ' + err)
});

function sleeper(ms) {
  return function(x) {
    return new Promise(resolve => setTimeout(() => resolve(x), ms));
  };
}
  // get the next month out using yahoo functions
  // select watchlist and loop over watch list
  // log statements
  //  get and store data -> 
  // do analysis
  // update google sheet

  // data model -> symbol -> date -> optionchains
  
function thirdFridayOfNextMonth() {
  // moment().format('dddd DD-MMMM-YYYY hh:mm:ss a')
  return moment()
    .add(1, 'M')
    .utc()
    .startOf('month')
    .endOf('isoweek')
    .add(2, 'w')
    .subtract(2, 'd')
    .startOf('day')
    .unix()
}