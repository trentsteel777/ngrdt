'use strict'

/**
 * @fileOverview test util functions
 */

const moment = require('moment');
const { thirdFridayOfNextMonth, today } = require('../src/utils.js')

describe('utils.js', () => {
  let expirationDatesArr = [
    1589500800,
    1592524800,
    1594944000,
    1602806400,
    1610668800,
    1642723200
  ]

  test('expirationDatesArr', () => {
    expect(expirationDatesArr).toHaveLength(6)

    for(var i = 0; i < expirationDatesArr.length; i++) {
      var epochDate = expirationDatesArr[i];
    }

  })

  test('thirdFriday', () => {
    console.log(thirdFridayOfNextMonth)    
  })

  test('today', () => {
    console.log(moment().utc().startOf('day').format('dddd DD-MMMM-YYYY hh:mm:ss a'))
    console.log(today)    
  })
})
