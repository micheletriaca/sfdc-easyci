let Spinner = require('cli-spinner').Spinner
let fileUtils = require('./files.js')
let chalk = require('chalk')

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

module.exports = function (conn) {
  const TMP_DIR = './srcTmp'

  return {
    deploy () {
      status.start()
      fileUtils
        .deleteDirectory(TMP_DIR)
        .then(() => fileUtils.copyDirectory('./src', TMP_DIR))
        .then(() => deploy(conn, TMP_DIR))
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
