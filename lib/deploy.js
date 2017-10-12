const Spinner = require('cli-spinner').Spinner
const fileUtils = require('./files.js')
const chalk = require('chalk')
const xmlUtils = require('./xml/transformer.js')
const _ = require('lodash')
const SObject = require('./xml/sobject.js')
const Profile = require('./xml/profile.js')

const status = new Spinner('%s Deploying metadata. Please wait...')
status.setSpinnerString('|/-\\')

function deploy (conn, directory) {
  return new Promise((resolve, reject) => {
    const streamingZip = fileUtils.zipDirectory(directory, '')
    streamingZip.on('end', function () {
      fileUtils.deleteDirectory(directory)
    })

    conn.metadata.deploy(streamingZip, {singlePackage: true, checkOnly: true})
      .on('progress', p => {
        console.log('Polling: ' + p.state)
      })
      .on('complete', p => {
        console.log('Polling complete')
        conn.metadata.checkDeployStatus(p.id, false)
          .then(infos => {
            console.log(infos)
            if (infos.success) resolve(infos)
            else reject(infos)
          })
      })
      .on('error', e => {
        reject(e)
      })
      .poll(5 * 1000, 600 * 1000)

    streamingZip.finalize()
  })
}

function restoreUselessFLS (dir, defaultToRestoreIsRw = true) {
  if (!fileUtils.directoryExists(dir)) return
  // 1st step: get field infos from objects
  // 2nd step: rebuild missing FLSs, except for required fields
  return xmlUtils.processXmlsInDirectory(dir, (jsonProfile, profileName, done) => {
    const existentFieldMap = _.keyBy(_.values(jsonProfile)[0].fieldPermissions, 'field')
    const fieldPermissions = _.values(jsonProfile)[0].fieldPermissions || []

    xmlUtils.readXmlsInDirectory(fileUtils.getCurrentDirectoryBase() + '/src/objects', (jsonObject, fileName) => {
      const obj = new SObject(jsonObject, fileName)
      let objNames = []
      if (obj.name === 'Activity') objNames = ['Task', 'Event']
      else objNames = [obj.name]

      for (const objName of objNames) {
        obj.getFLSFields()
          .filter(f => !existentFieldMap[`${objName}.${f}`])
          .forEach(f => fieldPermissions.push({
            editable: defaultToRestoreIsRw,
            field: `${objName}.${f}`,
            readable: defaultToRestoreIsRw
          }))
      }
    }, objName => !objName.endsWith('__mdt')).then(() => {
      _.values(jsonProfile)[0].fieldPermissions = _.sortBy(fieldPermissions, 'field')
      done(jsonProfile)
    })
  })
}

function restoreDisabledPermissions (profileDir) {
  xmlUtils
    .parseXml(`${profileDir}/Admin.profile`)
    .then(jsonProfile => jsonProfile.Profile.userPermissions)
    .then(allPermissions => xmlUtils.processXmlsInDirectory(profileDir, (jsonProfile, profileName) => {
      const currentProfileUserPermissions = _.groupBy(jsonProfile.Profile.userPermissions, 'name')
      _.each(allPermissions, ap => {
        if (!currentProfileUserPermissions[ap]) {
          jsonProfile.Profile.userPermissions.push({
            enabled: false,
            name: ap.name
          })
        }
      })
      return jsonProfile
    }))
}

function restoreDisabledObjects (profileDir) {
  xmlUtils
    .processXmlsInDirectory(profileDir, (jsonProfile, profileName) => {
      const p = new Profile(jsonProfile, profileName, '39.0') // TODO- FIX API VERSION
      if (p.isCustom()) {
        const disabledObjectBlocks = p.getDisabledObjects().map(o => ({
          allowCreate: false,
          allowDelete: false,
          allowEdit: false,
          allowRead: false,
          modifyAllRecords: false,
          viewAllRecords: false,
          object: o
        }))

        jsonProfile.Profile.objectPermissions.push(...disabledObjectBlocks)
      }
      return jsonProfile
    })
}

module.exports = function (conn) {
  const TMP_DIR = './srcTmp'

  return {
    deploy () {
      const srcFolder = fileUtils.getCurrentDirectoryBase() + '/src/'
      status.start()
      fileUtils
        .deleteDirectory(TMP_DIR)
        .then(() => fileUtils.copyDirectory(srcFolder, TMP_DIR))
        .then(() => restoreUselessFLS(`${TMP_DIR}/profiles`))
        .then(() => restoreUselessFLS(`${TMP_DIR}/permissionsets`, false))
        .then(() => restoreDisabledPermissions(`${TMP_DIR}/profiles`))
        .then(() => restoreDisabledObjects(`${TMP_DIR}/profiles`))
        .then(() => deploy(conn, TMP_DIR))
        .then(() => fileUtils.deleteDirectory(TMP_DIR))
        .then(() => {
          status.stop()
          console.log('ok')
        })
        .catch(e => {
          status.stop()
          console.log(chalk.red('Error: ' + e))
        })
    }
  }
}
