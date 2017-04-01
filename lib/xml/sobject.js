let _ = require('lodash')

class SObject {
  constructor (jsonObject, fileName) {
    this._jsonObject = jsonObject
    Object.defineProperty(this, 'name', {
      get: () => fileName.replace('.object', '')
    })
  }

  getFLSFields () {
    let obj = this._jsonObject.CustomObject
    let res = _(obj.fields || [])
      .filter(f => {
        let isFLSField = (
          !obj.customSettingsType &&
          f.required !== 'true' &&
          f.type !== 'MasterDetail' &&
          f.fullName.indexOf('__c') !== -1
        )
        return isFLSField
      })
      .map('fullName')
      .value()
    return res
  }
}

module.exports = SObject
