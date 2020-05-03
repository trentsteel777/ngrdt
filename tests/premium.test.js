'use strict'

var moment = require('moment');

describe('premium.js', () => {
  let expirationDatesArr = [
    1589500800,
    1592524800,
    1594944000,
    1602806400,
    1610668800,
    1642723200
  ]

  beforeAll(() => {
    //allCountries = JSON.parse(fs.readFileSync(__dirname + '/data/countries.test.json', 'utf8'))
  })

  test('expirationDatesArr', () => {
    expect(expirationDatesArr).toHaveLength(6)

    for(var i = 0; i < expirationDatesArr.length; i++) {
      var epochDate = expirationDatesArr[i];
    }

  })
  test('thirdFriday', () => {
    console.log('')    
  })
})
