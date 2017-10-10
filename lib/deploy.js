let Spinner = require('cli-spinner').Spinner
let fileUtils = require('./files.js')
let chalk = require('chalk')
let xmlUtils = require('./xml/transformer.js')
let _ = require('lodash')
let SObject = require('./xml/sobject.js')

let status = new Spinner('%s Deploying metadata. Please wait...')
status.setSpinnerString('|/-\\')

function deploy (conn, directory) {
  return new Promise((resolve, reject) => {
    let streamingZip = fileUtils.zipDirectory(directory, '')
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
    let existentFieldMap = _.keyBy(_.values(jsonProfile)[0].fieldPermissions, 'field')
    let fieldPermissions = _.values(jsonProfile)[0].fieldPermissions || []

    xmlUtils.readXmlsInDirectory(fileUtils.getCurrentDirectoryBase() + '/src/objects', (jsonObject, fileName) => {
      let obj = new SObject(jsonObject, fileName)
      let objNames = []
      if (obj.name === 'Activity') objNames = ['Task', 'Event']
      else objNames = [obj.name]

      for (let objName of objNames) {
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

module.exports = function (conn) {
  const TMP_DIR = './srcTmp'

  return {
    deploy () {
      let srcFolder = fileUtils.getCurrentDirectoryBase() + '/src/'
      status.start()
      fileUtils
        .deleteDirectory(TMP_DIR)
        .then(() => fileUtils.copyDirectory(srcFolder, TMP_DIR))
        .then(() => restoreUselessFLS(`${TMP_DIR}/profiles`))
        .then(() => restoreUselessFLS(`${TMP_DIR}/permissionsets`, false))
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
