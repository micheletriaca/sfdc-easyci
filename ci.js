const clear = require('clear')
const chalk = require('chalk')
const figlet = require('figlet')
const auth = require('./lib/auth.js')
const projectStore = require('./lib/project-store.js')
const _ = require('lodash')
const inquirer = require('inquirer')
const fileUtils = require('./lib/files.js')
let conn

clear()
console.log(
  chalk.green(
    figlet.textSync('Sfdc EasyCI')
  )
)

if (!fileUtils.fileExists('./src/package.xml')) {
  console.log(chalk.red('Current directory is not a Salesforce project!'))
  process.exit()
}

const currentPrj = projectStore.getProject() || {}
const orgs = {}
if (currentPrj) orgs[currentPrj.path] = currentPrj

inquirer.prompt([
  {
    name: 'org',
    type: 'list',
    choices: _.keys(orgs).concat(['new']),
    message: 'Select org'
  }
])
.then(fData => auth.getCredentials(fData.org === 'new' ? undefined : orgs[fData.org]))
// Check path is still correct
.then(c => {
  conn = c
  if (!fileUtils.fileExists('./src/package.xml')) {
    throw new Error('Current directory is not a Salesforce project!')
  } else {
    return inquirer.prompt([
      {
        name: 'operation',
        type: 'list',
        choices: ['retrieve', 'deploy'],
        message: 'Select operation'
      }
    ])
  }
})
.then(fData => {
  switch (fData.operation) {
    case 'retrieve':
      return require('./lib/retrieve.js')(conn).retrieve()
    case 'deploy':
      return require('./lib/deploy.js')(conn).deploy()
  }
})
.catch(err => {
  return console.error(chalk.red(err))
})
