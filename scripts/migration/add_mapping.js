// Logic for the command `yarn migration:add-mapping`
require('../../src/babel-register');
const { generateMigration } = require('./generate_migration');

generateMigration('mapping', (id) => `
// Uniquely identifies this migration
export const id = ${JSON.stringify(id)};

// Returns a mapping definition to be added to the Elasticsearch
// index that is being migrated.
export function mapping() {
  return {
    properties: {
      yourpropname: {
        properties: {
          todo: { type: 'keyword' },
        },
      },
    },
  };
}
`);
