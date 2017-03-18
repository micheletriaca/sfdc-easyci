let fs = require('fs')
let path = require('path')
let xml2js = require('xml2js-es6-promise')
let decompress = require('decompress')

let readFileP = function (path, encoding) {
  return new Promise((resolve, reject) => {
    fs.readFile(path, encoding, function (err, data) {
      if (err) reject(err)
      else resolve(data)
    })
  })
}

module.exports = {
  getCurrentDirectoryBase () {
    return path.resolve(process.cwd())
  },

  directoryExists (filePath) {
    try {
      return fs.statSync(filePath).isDirectory()
    } catch (err) {
      return false
    }
  },

  fileExists (filePath) {
    try {
      return fs.existsSync(filePath)
    } catch (err) {
      return false
    }
  },

  readPackageXml (filePath, dropEnvelope = true) {
    return readFileP(filePath, 'utf-8')
      .then(data => xml2js(data, { explicitArray: false }))
      .then(dom => {
        if (dropEnvelope) {
          delete dom.Package.$
          return dom.Package
        } else {
          return dom
        }
      })
  },

  extractZipContents (zipFileContent, directory) {
    return new Promise((resolve, reject) => {
      decompress(new Buffer(zipFileContent, 'base64'), directory).then(files => {
        resolve(files)
      })
    })
  }
}
