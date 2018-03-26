// Logic for the command `yarn migration:add-seed . file-name`
require('../../src/babel-register');
const { generateMigration } = require('./generate_migration');

generateMigration('seed', (id) => `
// Uniquely identifies this seed file
export const id = ${JSON.stringify(id)};

// Returns a document to be upserted to the Elasticsearch index being migrated
export function seed() {
  return {
    // TODO... return the object to be stored.
    // If you want to specify an id, you need to return an object
    // that looks like this:
    // {
    //   _id: 'my-id',
    //   _source: { whatever: 'you are storing' }
    // }
  };
}
`);
