// specificity — programmatic API
// Exposes profile reading and instruction building for programmatic use.

import {
  getProfileDir,
  getProfilePath,
  getExperiencePath,
  hasProfile,
  readProfile,
  readExperience,
} from "../hooks/specificity-config.js";
import { getSpecificityInstructions, getProfileContext } from "../hooks/specificity-instructions.js";

export {
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
