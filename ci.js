const clear = require('clear')
const chalk = require('chalk')
const figlet = require('figlet')
const program = require('commander')
const auth = require('./lib/auth.js')
const projectStore = require('./lib/project-store.js')
const _ = require('lodash')
const inquirer = require('inquirer')
const fileUtils = require('./lib/files.js')

let conn

program
.version('0.1.0')
.option('-p, --path [path]', 'Specify path [.]', '.')
.parse(process.argv)

if (program.path !== '.') fileUtils.directoryBase = program.path
const packagexmlPath = fileUtils.getCurrentDirectoryBase() + '/src/package.xml'

clear()
console.log(
  chalk.green(
    figlet.textSync('Sfdc EasyCI')
  )
)

console.log('Working with: ' + packagexmlPath)

if (!fileUtils.fileExists(packagexmlPath)) {
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
  if (!fileUtils.fileExists(packagexmlPath)) {
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
