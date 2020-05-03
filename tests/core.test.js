'use strict'

/**
 * @fileOverview test core functions
 */
const fs = require('fs')
const chalk = require('chalk')
const { fetchCountries, filterAndSort, buildTable, print, printCountriesNotFound } = require('../src/core.js')
const { MSG_NO_RESULTS, MSG_COUNTRIES_NOT_FOUND } = require('../src/usermessages.js')

describe('core.js', () => {
  let allCountries
  let searchedCountries = [
    { name: 'India', population: 1295210000 },
    { name: 'Ireland', population: 6378000 }
  ]

  beforeAll(() => {
    allCountries = JSON.parse(fs.readFileSync(__dirname + '/data/countries.test.json', 'utf8'))
  })

  test('filterAndSort', () => {
    let searchedCountryNames = ['ireland', 'india']
    let searchedCountries = filterAndSort(allCountries, searchedCountryNames)

    expect(searchedCountries).toHaveLength(2)
    // Should be sorted by population
    expect(searchedCountries[0].name).toBe('India')
    expect(searchedCountries[1].name).toBe('Ireland')
  })

  test('buildTable', () => {
    let populationTable = buildTable(searchedCountries)

    expect(populationTable).toHaveLength(2)
    expect(populationTable.constructor.name).toBe('Table')
  })

  test('print_withResults', () => {
    const spy = jest.spyOn(console, 'log')

    let populationTable = buildTable(searchedCountries)
    print(populationTable)
    expect(console.log).toHaveBeenCalled()
    expect(console.log).toHaveBeenCalledWith(populationTable.toString())
  })
  
  test('print_withNoResults', () => {
    const spy = jest.spyOn(console, 'log')

    let populationTable = buildTable([])
    print(populationTable)
    expect(console.log).toHaveBeenCalled()
    expect(console.log).toHaveBeenCalledWith(MSG_NO_RESULTS)
  })

  test('printCountriesNotFound', () => {
    const spy = jest.spyOn(console, 'log')

    let missingCountry = 'missing'
    let countryNamesArgArr = ['Ireland', 'India', missingCountry]
    let populationTable = buildTable(searchedCountries)
    printCountriesNotFound(countryNamesArgArr, populationTable)
    expect(console.log).toHaveBeenCalled()
    expect(console.log).toHaveBeenCalledWith(chalk.keyword('orange')(MSG_COUNTRIES_NOT_FOUND + missingCountry))
  })
})
