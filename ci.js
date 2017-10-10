let clear = require('clear')
let chalk = require('chalk')
let figlet = require('figlet')
let program = require('commander')
let auth = require('./lib/auth.js')
let projectStore = require('./lib/project-store.js')
let _ = require('lodash')
let inquirer = require('inquirer')
let fileUtils = require('./lib/files.js')

let conn

program
.version('0.1.0')
.option('-p, --path [path]', 'Specify path [.]', '.')
.parse(process.argv)

let packagexmlPath = program.path + '/src/'

clear()
console.log(
  chalk.green(
    figlet.textSync('Sfdc EasyCI')
  )
)

console.log('Working with: ' + packagexmlPath)

if (!fileUtils.fileExists(packagexmlPath + 'package.xml')) {
  console.log(chalk.red('Current directory is not a Salesforce project!'))
  process.exit()
}

let currentPrj = projectStore.getProject() || {}
let orgs = {}
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
  if (!fileUtils.fileExists(packagexmlPath + 'package.xml')) {
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
      return require('./lib/retrieve.js')(conn, packagexmlPath).retrieve()
    case 'deploy':
      return require('./lib/deploy.js')(conn, packagexmlPath).deploy()
  }
})
.catch(err => {
  return console.error(chalk.red(err))
})
