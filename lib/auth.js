let inquirer = require('inquirer')
let prefs = require('./prefs.js')
let jsforce = require('jsforce')
let fileUtils = require('./files.js')

let login = creds => {
  let conn = new jsforce.Connection({
    loginUrl: creds.serverUrl
  })

  return conn.login(creds.username, creds.password)
    .then(userInfo => {
      return conn
    })
}

module.exports = {
  getCredentials: (orgCreds) => {
    if (orgCreds) return login(orgCreds)
    else {
      let questions = [
        {
          name: 'serverUrl',
          type: 'list',
          message: 'Org type',
          choices: [{
            name: 'Sandbox',
            value: 'https://test.salesforce.com'
          }, {
            name: 'Production',
            value: 'https://login.salesforce.com'
          }]
        },
        {
          name: 'username',
          type: 'input',
          message: 'Enter your Sfdc username:',
          validate: function (value) {
            if (value.length) {
              return true
            } else {
              return 'Please enter your Sfdc username:'
            }
          }
        },
        {
          name: 'password',
          type: 'password',
          message: 'Enter your password:',
          validate: function (value) {
            if (value.length) {
              return true
            } else {
              return 'Please enter your password'
            }
          }
        }
      ]

      return inquirer.prompt(questions)
        .then(creds => {
          creds.projectPath = fileUtils.getCurrentDirectoryBase()
          prefs.creds = Object.assign({}, prefs.creds, {[creds.username]: creds})
          return creds
        })
        .then(login)
    }
  }
}
