let Spinner = require('cli-spinner').Spinner
let fileUtils = require('./files.js')
let chalk = require('chalk')

let status = new Spinner('%s Deploying metadata. Please wait...')
status.setSpinnerString('|/-\\')

module.exports = function (conn) {
  return {
    deploy () {
      status.start()
      fileUtils
        .deleteDirectory('./srcTmp')
        .then(() => fileUtils.copyDirectory('./src', './srcTmp'))
        .then(() => {
          return new Promise((resolve, reject) => {
            let archive = fileUtils.zipDirectory('./srcTmp', '')
            archive.on('end', function () {
              fileUtils.deleteDirectory('./srcTmp')
            })

            conn.metadata.deploy(archive, {singlePackage: true, checkOnly: true})
              .on('progress', p => {
                console.log('Polling: ' + p.state)
              })
              .on('complete', p => {
                console.log('Polling complete')
                conn.metadata.checkDeployStatus(p.id, false).then(infos => {
                  console.log(infos)
                  if (infos.success) resolve(infos)
                  else reject(infos)
                })
              })
              .on('error', e => {
                reject(e)
              })
              .poll(5 * 1000, 600 * 1000)

            archive.finalize()
          })
        })
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
