const _ = require('lodash')
const STD_OBJECTS = {
  '39.0': {
    'Salesforce': [
      'Account',
      'Macro',
      'Asset',
      'Opportunity',
      'Campaign',
      'Order',
      'Case',
      'PriceBook2',
      'Contact',
      'Product2',
      'Contract',
      'PushTopic',
      'Document',
      'Quote',
      'DuplicateRecordSet',
      'ProfileSkill',
      'ProfileSkillEndorsement',
      'ProfileSkillUser',
      'Idea',
      'Solution',
      'Lead',
      'StreamingChannel'
    ]
  }
}

class Profile {
  constructor (jsonProfile, fileName, apiVersion = '39.0') {
    this._jsonProfile = jsonProfile
    this._apiVersion = apiVersion
    this._obj = this._jsonProfile.Profile
    this._stdObjectsPerLicence = STD_OBJECTS[this._apiVersion][this._obj.userLicense] || []
    Object.defineProperty(this, 'name', {
      get: () => fileName.replace('.profile', '')
    })

    if (!this._stdObjectsPerLicence.length) {
      console.warn(`No configuration found for apiVersion ${this._apiVersion} and licence ${this._obj.userLicense}`)
    }
  }

  isCustom () {
    return this._obj.custom
  }

  getDisabledObjects () {
    const managedObjects = _.keyBy(this._obj.objectPermissions, 'object')
    return this._stdObjectsPerLicence.filter(obj => {
      const isAlreadyManaged = managedObjects[obj] && true
      return !isAlreadyManaged
    })
  }
}

module.exports = Profile
