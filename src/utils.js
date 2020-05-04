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