#!/usr/bin/env node
'use strict'

/*
  This is a node helper application to retrieve optionable stocks from finviz.

  Usage: From Linux / Odroid Run: node finvizWatchlistHelper.js

  Watchlist requests run synchronously and appear in log/watchlist.log

  Copy and paste them into watchlist.txt after this helper program finishes
*/
const sleep = require('sleep')
var XMLHttpRequest = require("xmlhttprequest").XMLHttpRequest;
const { createLogger, format, transports } = require('winston');
const { combine, timestamp, label, printf } = format;
const fs = require('fs')

const logDir = 'logs/';
const logFileName = 'watchlist.log';

fs.writeFile(logDir + logFileName, '', () => {}) // clear watchlist file

const myFormat = printf(({ level, message, label, timestamp }) => {
  return `${message}`; // Just log the SYMBOL
});

const logger = createLogger({
  level: 'info',
  format: format.combine(
    myFormat
  ),
  transports: [
    new (transports.File)({
      level: 'info',
      filename: logFileName,
      dirname: logDir
    })
  ]
});


function reqListener() {
    var pattern = /(screener-link-primary">)([^<\/a>]+)(<\/a>)/g;
    var match;    

    while (match = pattern.exec(this.responseText)) {
      logger.info(match[2]);
    }
}
console.log("Starting application");

let start = 1
let increment = 21
let end = 5621
for(let i = start; i <= end; i = i + 20) {
  var url = "https://finviz.com/screener.ashx?v=111&f=sh_opt_option&ft=4&r=" + i;
  console.log(url);
  var oReq = new XMLHttpRequest();
  oReq.addEventListener("load", reqListener);
  oReq.open("GET", url, false);  
  oReq.send();
  //sleep.msleep(1000)
}

console.log("Ending application");