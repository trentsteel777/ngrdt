'use strict'

/**
 * @fileOverview test util functions
 */
const { hasCountryNamesArg, trimLowerCase } = require('../src/utils.js')

describe('utils.js', () => {
  test('trimLowerCase', () => {
    expect(trimLowerCase('  iReLand  ')).toBe('ireland')
  })

  test('hasCountryNamesArg', () => {
    expect(hasCountryNamesArg(
      [
        '/usr/local/bin/node',
        '/home/user/Workspace/FindCountryPopulations/premium.js',
        'Ireland,India'
      ]
    )).toBe(true)
  })
})
