var Spinner = require('cli-spinner').Spinner
let fileUtils = require('./files.js')
let _ = require('lodash')
let request = require('request')
let progress = require('request-progress')
let chalk = require('chalk')
let xml2js = require('xml2js')

function startRetrieve (conn, options) {
  let retrieveRes = conn.metadata.retrieve(options)
  retrieveRes.on('progress', p => {
    console.log('Polling: ' + p.state)
  })

  retrieveRes.poll(options.pollInterval || 5 * 1000, options.pollTimeout || 60 * 1000)

  return new Promise((resolve, reject) => {
    retrieveRes.on('complete', p => {
      console.log('Polling complete')
      resolve(p.id)
    })
  })
}

function retrieveZip (conn, reqId) {
  const endpoint = conn.instanceUrl + '/services/Soap/m/' + conn.version
  const soapenv = 'http://schemas.xmlsoap.org/soap/envelope/'
  const met = 'http://soap.sforce.com/2006/04/metadata'

  return new Promise((resolve, reject) => {
    progress(request({
      method: 'POST',
      url: endpoint,
      headers: {
        'Accept-Encoding': 'deflate',
        'Content-Type': 'text/xml',
        'SOAPAction': '""'
      },
      body: `<soapenv:Envelope xmlns:soapenv="${soapenv}" xmlns:met="${met}">
        <soapenv:Header>
            <met:SessionHeader>
              <met:sessionId>${conn.accessToken}</met:sessionId>
            </met:SessionHeader>
        </soapenv:Header>
        <soapenv:Body>
            <met:checkRetrieveStatus>
              <met:asyncProcessId>${reqId}</met:asyncProcessId>
              <met:includeZip>true</met:includeZip>
            </met:checkRetrieveStatus>
        </soapenv:Body>
      </soapenv:Envelope>`
    }, function (error, response, body) {
      if (error) reject(error)
      xml2js.parseString(response.body, { explicitArray: false }, function (err, dom) {
        if (err) {
          reject(err)
        } else {
          resolve(dom['soapenv:Envelope']['soapenv:Body'].checkRetrieveStatusResponse.result.zipFile)
        }
      })
    })).on('progress', state => {
      status.setSpinnerTitle(`%s Downloading... ${(Math.round(state.size.transferred / 1024 / 1024))}MB`)
    })
  })
}

var status = new Spinner('%s Retrieving metadata. Please wait...')
status.setSpinnerString('|/-\\')

module.exports = function (conn) {
  return {
    retrieve () {
      status.start()
      fileUtils
        .readPackageXml('./src/package.xml')
        .then(f => {
          return {
            unpackaged: f,
            apiVersion: '39.0',
            singlePackage: true
          }
        })
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
