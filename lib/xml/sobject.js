const _ = require('lodash')

class SObject {
  constructor (jsonObject, fileName) {
    this._jsonObject = jsonObject
    Object.defineProperty(this, 'name', {
      get: () => fileName.replace('.object', '')
    })
  }

  getFLSFields () {
    const obj = this._jsonObject.CustomObject
    const res = _(obj.fields || [])
      .filter(f => {
        const isFLSField = (
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
