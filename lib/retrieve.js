var Spinner = require('cli-spinner').Spinner
let fileUtils = require('./files.js')
let projectStore = require('./project-store.js')
let _ = require('lodash')
let request = require('request')
let progress = require('request-progress')
let chalk = require('chalk')
let xml2js = require('xml2js-es6-promise')
let moment = require('moment')
let fs = require('fs')
let xmlUtils = require('./xml/transformer.js')

let status = new Spinner('%s Retrieving metadata. Please wait...')
status.setSpinnerString('|/-\\')

function clone (obj) {
  return JSON.parse(JSON.stringify(obj))
}

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

function getBigMetadataInfos (conn) {
  return conn.metadata.list([
    {type: 'StaticResource'}
  ], conn.version)
}

function computeDeltaAndSyncDeleted (metadata, originalPackageXml) {
  let deltaPackageXml = clone(originalPackageXml)
  let projectData = projectStore.getProject()
  let oldMetadata = _(projectData.metadata || metadata)
    .groupBy('type')
    .mapValues(t => _.keyBy(t, 'fullName'))
    .value()

  let staticResourceTag = _.find(deltaPackageXml.types, {name: 'StaticResource'})
  if (!staticResourceTag || staticResourceTag.members !== '*') return deltaPackageXml

  // I retain every new SR on server + every modified SR on server
  staticResourceTag.members = _(metadata)
    .filter(m => {
      const isOnlyOnServer = _.get(oldMetadata, `[${m.type}][${m.fullName}]`, false) === false
      const isModifiedOnServer = !isOnlyOnServer && moment(m.lastModifiedDate).isAfter(oldMetadata[m.type][m.fullName].lastModifiedDate)
      return isOnlyOnServer || isModifiedOnServer
    })
    .map('fullName')
    .value()

  // I have to delete all SR deleted on the server
  let staticResourceMap = _(metadata).filter({type: 'StaticResource'}).keyBy('fullName').value()
  return fileUtils.readDirectory('./src/staticresources')
    .then(files => {
      files
        .filter(file => !staticResourceMap[file.replace(/\.resource.*/, '')])
        .forEach(f => fs.unlinkSync(`./src/staticresources/${f}`))

      return deltaPackageXml
    })
}

function restoreOriginalPackageXml (originalPackageXml) {
  let staticResourceTag = _.find(originalPackageXml.types, {name: 'StaticResource'})
  if (!staticResourceTag || staticResourceTag.members !== '*') return 'nothingtodo'

  return fileUtils.readPackageXml('./src/package.xml', false)
    .then(packageToMerge => {
      let staticResourceTag = _.find(packageToMerge.Package.types, {name: 'StaticResource'})
      if (!staticResourceTag) {
        packageToMerge.Package.types.push({
          members: '*',
          name: 'StaticResource'
        })
      } else {
        staticResourceTag.members = '*'
      }
      packageToMerge.Package.types = _.sortBy(packageToMerge.Package.types, 'name')
      return packageToMerge
    })
    .then(mergedPackage => xmlUtils.buildAndStoreXml(mergedPackage, './src/package.xml'))
}

function persistNewMetadataConfig (metadata) {
  let projectData = projectStore.getProject()
  projectData.metadata = metadata
}

module.exports = function (conn) {
  let tmpOriginalPackageXml = null
  let tmpMetadata = null

  return {
    retrieve () {
      status.start()
      fileUtils
        .readPackageXml('./src/package.xml')
        .then(packageXml => { tmpOriginalPackageXml = clone(packageXml); return packageXml })
        .then(_.partial(getBigMetadataInfos, conn))
        .then(metadata => { tmpMetadata = clone(metadata); return metadata })
        .then(() => computeDeltaAndSyncDeleted(tmpMetadata, tmpOriginalPackageXml))
        .then(deltaPackageXml => startRetrieve(conn, {
          unpackaged: deltaPackageXml,
          apiVersion: conn.version,
          singlePackage: true
        }))
        .then(_.partial(retrieveZip, conn))
        .then(data => fileUtils.extractZipContents(data, './src'))
        .then(() => restoreOriginalPackageXml(tmpOriginalPackageXml))
        .then(() => persistNewMetadataConfig(tmpMetadata))
        .then(f => {
          status.stop()
          console.log('\n' + chalk.green('Done'))
        })
    }
  }
}
