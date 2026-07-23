#!/usr/bin/env node
// specificity — instruction builder for Claude hooks and Pi extension.
// Reads the developer's profile and experience files, then injects them
// as session context so the agent has the user's model available.

const fs = require('fs');
const { readProfile, readExperience, hasProfile } = require('./specificity-config');

const SKILL_PATH = require('path').join(__dirname, '..', 'skills', 'specificity', 'SKILL.md');

function getProfileContext() {
  if (!hasProfile()) {
    return 'No Specificity profile found. Run `/specificity-setup` to build one (one interview, works globally).';
  }

  const profile = readProfile();
  const experience = readExperience();

  let context = 'SPECIFICITY ACTIVE — developer profile loaded.\n\n';
  context += '## Profile\n\n' + (profile || '');
  if (experience) {
    context += '\n\n## Experience\n\n' + experience;
  }
  context += '\n\nRead this before interpreting the developer\'s messages. Decode against it first; only ask when it cannot resolve ambiguity.';
  return context;
}

function getSpecificityInstructions() {
  try {
    const skillBody = fs.readFileSync(SKILL_PATH, 'utf8')
      .replace(/^---[\s\S]*?---\s*/, '');
    return 'SPECIFICITY ACTIVE — developer-understanding mode.\n\n' + skillBody + '\n\n' + getProfileContext();
  } catch (e) {
    return 'SPECIFICITY ACTIVE — developer-understanding mode.\n\n' + getProfileContext();
  }
}

module.exports = {
  getProfileContext,
  getSpecificityInstructions,
};
