const xml2jsParser = require('xml2js-es6-promise')
const xml2jsBuilder = require('xml2js')
const fileUtils = require('../files.js')
const fs = require('fs')
const _ = require('lodash')

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
      .then(jsonFile => {
        return new Promise((resolve, reject) => {
          const res = fileCallback(jsonFile, function (...args) { resolve(...args) })
          if (res !== undefined) resolve(res)
        })
      })
      .then(transformedJsonFile => this.buildAndStoreXml(transformedJsonFile, filePath))
  },

  readXmlsInDirectory (dir, fileCallback, filterFn = f => f) {
    return fileUtils.readDirectory(dir, filterFn)
      .then(files => Promise.all(files.map(file => this.parseXml(`${dir}/${file}`).then(jsonFile => fileCallback(jsonFile, file)))))
  },

  processXmlsInDirectory (dir, fileCallback, filterFn = f => f) {
    return fileUtils.readDirectory(dir, filterFn)
      .then(files => Promise.all(files.map(file => this.processXml(`${dir}/${file}`, _.partial(fileCallback, _, file)))))
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
