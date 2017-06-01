const fileUtils = require('./files.js')
const Preferences = require('preferences')
const prefs = new Preferences('org.sfdceasyci')

module.exports = {
  hasProject (projectKey) {
    return (prefs[projectKey] && true) || false
  },
  getProject (projectKey = fileUtils.getCurrentDirectoryBase()) {
    return this.hasProject(projectKey) ? prefs[projectKey] : null
  },
  addProject (project) {
    prefs[project.path] = project
  }
}
