const Spinner = require('cli-spinner').Spinner
const fileUtils = require('./files.js')
const projectStore = require('./project-store.js')
const _ = require('lodash')
const request = require('request')
const progress = require('request-progress')
const chalk = require('chalk')
const xml2js = require('xml2js-es6-promise')
const moment = require('moment')
const xmlUtils = require('./xml/transformer.js')

const status = new Spinner('%s Retrieving metadata. Please wait...')
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
      .on('error', e => {
        reject(e)
      })
      .poll(options.pollInterval || 5 * 1000, options.pollTimeout || 600 * 1000)
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
  const deltaPackageXml = clone(originalPackageXml)
  const projectData = projectStore.getProject()
  const oldMetadata = _(projectData.metadata || metadata)
    .groupBy('type')
    .mapValues(t => _.keyBy(t, 'fullName'))
    .value()

  const staticResourceTag = _.find(deltaPackageXml.types, {name: 'StaticResource'})
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
  const staticResourceMap = _(metadata).filter({type: 'StaticResource'}).keyBy('fullName').value()
  const fileShouldBeDeleted = f => !staticResourceMap[f.replace(/\.resource.*/, '')]
  return fileUtils.deleteFilesInDirectory(fileUtils.getCurrentDirectoryBase() + 'src/staticresources', fileShouldBeDeleted).then(() => deltaPackageXml)
}

function restoreOriginalPackageXml (originalPackageXml) {
  const staticResourceTag = _.find(originalPackageXml.types, {name: 'StaticResource'})
  if (!staticResourceTag || staticResourceTag.members !== '*') return 'nothingtodo'

  return xmlUtils.processXml(packageToMerge => {
    const pRoot = packageToMerge.Package
    const staticResourceTag = _.find(pRoot.types, {name: 'StaticResource'})
    if (!staticResourceTag) {
      pRoot.types.push({
        members: '*',
        name: 'StaticResource'
      })
    } else {
      staticResourceTag.members = '*'
    }
    pRoot.types = _.sortBy(pRoot.types, 'name')
    return packageToMerge
  })
}

function persistNewMetadataConfig (metadata) {
  projectStore.getProject().metadata = metadata
}

function removeUselessFLS (profileDir, defaultEnabled = true) {
  if (!fileUtils.directoryExists(profileDir)) return
  xmlUtils.processXmlsInDirectory(profileDir, jsonProfile => {
    const pRoot = _.values(jsonProfile)[0]
    pRoot.fieldPermissions = _.filter(pRoot.fieldPermissions, fp => {
      return !fp.field.endsWith('__c') || fp.editable === !defaultEnabled + '' || fp.readable === !defaultEnabled + ''
    })
    return jsonProfile
  })
}

function removeUselessTranslations (translationsDir) {
  if (!fileUtils.directoryExists(translationsDir)) return
  xmlUtils.processXmlsInDirectory(translationsDir, jsonTranslation => {
    const pRoot = _.values(jsonTranslation)[0]
    const filterFn = f => {
      const labelKo = !f.label
      const relationshipLabelKo = !f.relationshipLabel
      const pickvaluesKo = !f.picklistValues || !_.find(f.picklistValues, pv => pv.translation !== '')
      const sectionsKo = !f.sections || !_.find(f.sections, pv => pv.label !== '')
      const errorMessageKo = !f.errorMessage

      return f.caseValues || (!labelKo || !relationshipLabelKo || !pickvaluesKo || !sectionsKo || !errorMessageKo)
    }
    pRoot.fields = _.filter(pRoot.fields, filterFn)
    pRoot.webLinks = _.filter(pRoot.webLinks, filterFn)
    pRoot.recordTypes = _.filter(pRoot.recordTypes, filterFn)
    pRoot.quickActions = _.filter(pRoot.quickActions, filterFn)
    pRoot.layouts = _.filter(pRoot.layouts, filterFn)
    pRoot.validationRules = _.filter(pRoot.validationRules, filterFn)

    return jsonTranslation
  })
}

module.exports = function (conn) {
  let tmpOriginalPackageXml = null
  let tmpMetadata = null

  return {
    retrieve () {
      const srcFolder = fileUtils.getCurrentDirectoryBase() + '/src/'
      status.start()
      xmlUtils
        .readPackageXml(srcFolder + 'package.xml')
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
        .then(data => fileUtils.extractZipContents(data, srcFolder))
        .then(() => restoreOriginalPackageXml(tmpOriginalPackageXml))
        .then(() => persistNewMetadataConfig(tmpMetadata))
        .then(() => removeUselessFLS(srcFolder + 'profiles'))
        .then(() => removeUselessFLS(srcFolder + 'permissionsets', false))
        .then(() => removeUselessTranslations(srcFolder + 'objectTranslations'))
        .then(f => {
          status.stop()
          console.log('\n' + chalk.green('Done'))
        })
        .catch(e => {
          status.stop()
          console.log('\n' + chalk.red('Errors during execution: ' + e))
          process.exit(1)
        })
    }
  }
}
