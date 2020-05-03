'use strict'

/**
 * @fileOverview Main functions to retrieve, parse and display searched countries.
 */
const chalk = require('chalk')
const axios = require('axios')
const Table = require('cli-table')
const { trimLowerCase } = require('./utils.js')
const { MSG_NO_RESULTS, MSG_COUNTRIES_NOT_FOUND } = require('./usermessages.js')

/**
 * @summary Retrieves all countries with their population
 * @param {String} apiUrl URL that points to population api
 * @returns {Promise} containing population data for all countries
 * @export
 */
exports.sendRequest = function (apiUrl) {
  return axios.get(apiUrl).then(res => res.data)
}

/**
 * @summary Accepts array of countries and filters out the ones not being searched for then
 *          sorts them from highest population to lowest
 * @param {Array} allCountries this is from the rest service
 * @param {Array} searchCountryNames user input from the command line; trimmed and lowercased
 * @returns {Array} filtered and sorted array of countries
 * @export
 */
exports.filterAndSort = function (allCountries, searchCountryNames) {
  return allCountries
    .filter((country) => searchCountryNames.includes(country.name.toLowerCase()))
    .sort((countryA, countryB) => countryB.population - countryA.population)
}

/**
 * @summary Builds the outut population table for the console
 * @param {Array} countries the array of countries that will be printed as a table
 * @returns {Table} Sub-type of Array that can be pretty printed in console
 * @export
 */
exports.buildTable = function (countries) {
  const table = new Table({
    head: [chalk.green('Country'), chalk.green('Population')],
    colWidths: [20, 20]
  })
  countries.forEach(country => {
    table.push([country.name, country.population.toLocaleString()])
  })
  return table
}

/**
 * @summary Prints population Table to console
 * @param {Table} populationTable
 * @returns {undefined}
 * @export
 */
exports.print = function (populationTable) {
  if (populationTable.length > 0) {
    console.log(populationTable.toString())
  } else if (populationTable.length === 0) {
    console.log(MSG_NO_RESULTS)
  }
}

/**
 * @summary Prints any user country inputs that weren't matched
 * @param {String[]} countryNamesArgArr list of user inputs
 * @param {Table} populationTable table that will be displayed to the user
 * @returns {undefined}
 * @export
 */
exports.printCountriesNotFound = function (countryNamesArgArr, populationTable) {
  if (countryNamesArgArr.length !== populationTable.length && populationTable.length > 0) {
    let includedCountryNames = populationTable.map(arr => trimLowerCase(arr[0]))
    let originalCountriesArg = countryNamesArgArr.filter(arg => !includedCountryNames.includes(trimLowerCase(arg)))
    console.log(chalk.keyword('orange')(MSG_COUNTRIES_NOT_FOUND + originalCountriesArg))
  }
}
