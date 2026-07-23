// specificity — programmatic API
// Exposes profile reading and instruction building for programmatic use.

const { getProfilePath, getExperiencePath, getProfileDir, hasProfile, readProfile, readExperience } = require('../hooks/specificity-config');
const { getSpecificityInstructions, getProfileContext } = require('../hooks/specificity-instructions');

module.exports = {
  // Config
  getProfileDir,
  getProfilePath,
  getExperiencePath,
  hasProfile,
  readProfile,
  readExperience,

  // Instructions
  getSpecificityInstructions,
  getProfileContext,
};
