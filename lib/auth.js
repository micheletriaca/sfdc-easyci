let inquirer = require('inquirer')
let projectStore = require('./project-store.js')
let jsforce = require('jsforce')
let fileUtils = require('./files.js')

let login = creds => {
  let conn = new jsforce.Connection({
    loginUrl: creds.serverUrl,
    version: '39.0'
  })

  return conn
    .login(creds.username, creds.password)
    .then(userInfo => conn)
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
          let newProj = {
            serverUrl: creds.serverUrl,
            username: creds.username,
            password: creds.password,
            path: fileUtils.getCurrentDirectoryBase()
          }
          projectStore.addProject(newProj)
          return newProj
        })
        .then(login)
    }
  }
}
