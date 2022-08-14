'use strict'

/**
 * @fileOverview util functions
 */
const moment = require('moment')

exports.thirdFridayOfNextMonth = (function () {
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
})()

exports.today = (function () {
    return moment()
        .utc()
        .startOf('day')
        .unix()
})()

exports.formatUnixDate = (function(unixEpochTime) {
    return moment.unix(unixEpochTime).format('YYYY-MM-DD')
})

// EXCEL: Unix date checker formula: =(G20/86400)+DATE(1970,1,1)
exports.nextSixFridaysUnixArr = (function () { 
    let thisFridayDate = moment()
    .utc()
    .endOf('isoweek')
    .subtract(2, 'd')
    .startOf('day')

    if(thisFridayDate.isoWeekday() > 4) {
        thisFridayDate.add(1, 'w')
    }

    let nextSixFridaysUnixArr = [thisFridayDate.unix()]     
    for(let i = 0; i < 5; i++) {
        thisFridayDate.add(1, 'w')
        nextSixFridaysUnixArr.push(thisFridayDate.unix())
    }

    const index = nextSixFridaysUnixArr.indexOf(exports.thirdFridayOfNextMonth);
    if (index > -1) { // only splice array when item is found
        nextSixFridaysUnixArr.splice(index, 1); // 2nd parameter means remove one item only
    }

    return nextSixFridaysUnixArr
})()

