const fs = require('fs')
const path = require('path')
const unzipper = require('unzipper')
const ncp = require('ncp').ncp
const rimraf = require('rimraf')
const archiver = require('archiver')
const stream = require('stream')

module.exports = {

  directoryBase: undefined,

  readFile (path, encoding) {
    return new Promise((resolve, reject) => {
      fs.readFile(path, encoding, function (err, data) {
        if (err) reject(err)
        else resolve(data)
      })
    })
  },

  getCurrentDirectoryBase () {
    if (this.directoryBase) return this.directoryBase
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

  extractZipContents (zipFileContent, directory) {
    const bufferStream = new stream.PassThrough()
    bufferStream.end(new Buffer(zipFileContent, 'base64'))
    return bufferStream
      .pipe(unzipper.Extract({ path: directory }))
      .promise()
  },

  zipDirectory (srcPath, destPath) {
    const archive = archiver('zip', {
      zlib: { level: 9 }
    })
    archive.on('error', err => { throw err })
    archive.directory(srcPath, destPath)
    return archive
  },

  readDirectory (path, filterFn = f => f) {
    return new Promise((resolve, reject) => {
      fs.readdir(path, (err, files) => {
        if (err) reject(err)
        else { resolve(files.filter(filterFn)) }
      })
    })
  },

  deleteFilesInDirectory (path, filterFn = f => f) {
    return this.readDirectory(path)
      .then(files => {
        const filesToDelete = files.filter(filterFn)
        filesToDelete.forEach(f => fs.unlinkSync(`${path}/${f}`))
        return filesToDelete
      })
  },

  copyDirectory (source, destination) {
    return new Promise((resolve, reject) => {
      ncp(source, destination, function (err) {
        if (err) reject(err)
        else resolve('done')
      })
    })
  },

  deleteDirectory (path) {
    return new Promise((resolve, reject) => {
      rimraf(path, (err) => {
        if (err) reject(err)
        else resolve()
      })
    })
  }
}
