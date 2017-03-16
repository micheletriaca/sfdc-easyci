let fileUtils = require('./files.js')
let Preferences = require('preferences')
let prefs = new Preferences('org.sfdceasyci')

module.exports = {
  hasProject (projectKey) {
    return prefs[projectKey] && true || false
  },
  getProject (projectKey = fileUtils.getCurrentDirectoryBase()) {
    return this.hasProject(projectKey) ? prefs[projectKey] : null
  },
  addProject(project) {
    prefs[project.path] = project
  }
}
