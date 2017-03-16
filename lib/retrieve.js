var Spinner = require('cli-spinner').Spinner
let fileUtils = require('./files.js')
let _ = require('lodash')
let request = require('request')
let progress = require('request-progress')
let chalk = require('chalk')
let xml2js = require('xml2js-es6-promise')

var status = new Spinner('%s Retrieving metadata. Please wait...')
status.setSpinnerString('|/-\\')

function startRetrieve (conn, options) {
  return new Promise((resolve, reject) => {
    conn.metadata.retrieve(options)
      .on('progress', p => {
        console.log('Polling: ' + p.state)
      })
      .on('complete', p => {
        console.log('Polling complete')
        resolve(p.id)
      })
      .poll(options.pollInterval || 5 * 1000, options.pollTimeout || 60 * 1000)
  })
}

function retrieveZip (conn, reqId) {
  const endpoint = conn.instanceUrl + '/services/Soap/m/' + conn.version
  const soapEnv = 'http://schemas.xmlsoap.org/soap/envelope/'
  const met = 'http://soap.sforce.com/2006/04/metadata'

  return new Promise((resolve, reject) => {
    progress(request({
      method: 'POST',
      url: endpoint,
      headers: {
        'Content-Type': 'text/xml',
        'SOAPAction': '""'
      },
      body: `
        <soapenv:Envelope xmlns:soapenv="${soapEnv}" xmlns="${met}">
          <soapenv:Header>
              <SessionHeader>
                <sessionId>${conn.accessToken}</sessionId>
              </SessionHeader>
          </soapenv:Header>
          <soapenv:Body>
              <checkRetrieveStatus>
                <asyncProcessId>${reqId}</asyncProcessId>
                <includeZip>true</includeZip>
              </checkRetrieveStatus>
          </soapenv:Body>
        </soapenv:Envelope>
      `
    }, function (error, response, body) {
      if (error) reject(error)
      xml2js(response.body, { explicitArray: false })
        .then(dom => dom['soapenv:Envelope']['soapenv:Body'].checkRetrieveStatusResponse.result.zipFile)
        .then(resolve)
    })).on('progress', state => {
      status.setSpinnerTitle(`%s Downloading... ${(Math.round(state.size.transferred / 1024 / 1024))}MB`)
    })
  })
}

module.exports = function (conn) {
  return {
    retrieve () {
      status.start()
      fileUtils
        .readPackageXml('./src/package.xml')
        .then(f => ({
          unpackaged: f,
          apiVersion: '39.0',
          singlePackage: true
        }))
        .then(_.partial(startRetrieve, conn))
        .then(_.partial(retrieveZip, conn))
        .then(data => fileUtils.extractZipContents(data, './src'))
        .then((f) => {
          status.stop()
          console.log('\n' + chalk.green('Done'))
        })
    }
  }
}
