// Logic for the command `yarn migration:add-transform`
require('../../src/babel-register');
const { generateMigration } = require('./generate_migration');

generateMigration('transform', (id) => `
// Uniquely identifies this migration
export const id = ${JSON.stringify(id)};

// Determine whether or not this migration applies to the specified document.
export function filter(doc) {
  return false;
}

// Transforms the specified document from the previous version to the current version.
export function transform(doc) {
  return {
    ...doc,
  };
}
`);
