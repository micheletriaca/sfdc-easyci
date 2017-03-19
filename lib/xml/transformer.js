let xml2jsParser = require('xml2js-es6-promise')
let xml2jsBuilder = require('xml2js')
let fileUtils = require('../files.js')
let fs = require('fs')

module.exports = {
  parseXml (sourcePath) {
    return fileUtils
      .readFile(sourcePath)
      .then(data => xml2jsParser(data, {explicitArray: false}))
  },

  buildAndStoreXml (dom, destPath) {
    return new Promise((resolve, reject) => {
      const builder = new xml2jsBuilder.Builder({
        renderOpts: {
          'pretty': true,
          'indent': '    ',
          'newline': '\n'
        },
        xmldec: {
          encoding: 'UTF-8'
        }
      })

      const xml = builder.buildObject(dom) + '\n'

      fs.writeFile(destPath, xml, function (err, data) {
        if (err) reject(err)
        resolve(xml)
      })
    })
  },

  processXml (filePath, fileCallback) {
    return this.parseXml(filePath)
      .then(jsonFile => fileCallback(jsonFile))
      .then(transformedJsonFile => this.buildAndStoreXml(transformedJsonFile, filePath))
  },

  processXmlsInDirectory (dir, fileCallback, filterFn = f => f) {
    return fileUtils.readDirectory(dir, filterFn)
      .then(files => {
        files.forEach(file => this.processXml(`${dir}/${file}`, fileCallback))
        return files
      })
  },

  readPackageXml (filePath, dropEnvelope = true) {
    return this.parseXml(filePath)
      .then(dom => {
        if (dropEnvelope) {
          delete dom.Package.$
          return dom.Package
        } else {
          return dom
        }
      })
  }
}
