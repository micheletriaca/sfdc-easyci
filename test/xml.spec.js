let xmlUtils = require('../lib/xml/transformer.js')
let fs = require('fs')
let _ = require('lodash')

describe('XML functions', function () {
  beforeEach(function () {
    spyOn(fs, 'writeFile').and.callFake(function (destPath, xml, callback) {
      callback(null, xml)
    })
  })

  it('renders the same xml it receives', function (done) {
    xmlUtils.processXml('./test/supporting-files/package.xml', jsonXml => jsonXml)
      .then(packageXml => {
        expect(fs.writeFile).toHaveBeenCalled()
        expect(packageXml).toEqual(fs.readFileSync('./test/supporting-files/package.xml', 'utf-8'))
        done()
      })
  })

  it('filters an xml tag', function (done) {
    xmlUtils.processXml('./test/supporting-files/package.xml', jsonXml => {
      let worklows = _.find(jsonXml.Package.types, {name: 'Workflow'})
      worklows.members = worklows.members.filter(m => m !== 'CustomObject1__c')
      return jsonXml
    }).then(packageXml => {
      expect(fs.writeFile).toHaveBeenCalled()
      expect(packageXml).toEqual(fs.readFileSync('./test/supporting-files/filteredPackage.xml', 'utf-8'))
      done()
    })
  })

  it('calls processXml for each filtered file in a folder', function (done) {
    spyOn(xmlUtils, 'processXml')

    xmlUtils.processXmlsInDirectory('./test/supporting-files', f => f.indexOf('package.xml' !== -1))
      .then(() => {
        expect(xmlUtils.processXml.calls.count()).toEqual(2)
        done()
      })
  })

  it('gets a parsed package.xml', function (done) {
    xmlUtils.readPackageXml('./test/supporting-files/package.xml')
      .then(packageXml => {
        expect(packageXml.Package).toBe(undefined)
        expect(packageXml.types).not.toBe(undefined)
        done()
      })
  })

  it('gets an unparsed package.xml', function (done) {
    xmlUtils.readPackageXml('./test/supporting-files/package.xml', false)
      .then(packageXml => {
        expect(packageXml.Package).not.toBe(undefined)
        expect(packageXml.types).toBe(undefined)
        done()
      })
  })
})
