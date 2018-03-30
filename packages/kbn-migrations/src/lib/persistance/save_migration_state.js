import { MIGRATION_DOC_ID, DOC_TYPE } from '../consts';

/**
 * Saves the migration state (checksum and applied migration ids) to
 * the specified index.
 *
 * @param {ElasticsearchJs} callCluster
 * @param {string} index
 * @param {KibanaMigration[]} migration
 */
export async function saveMigrationState(callCluster, index, migration) {
  return await callCluster('update', {
    index,
    id: MIGRATION_DOC_ID,
    type: DOC_TYPE,
    body: {
      doc: {
        migration,
      },
      doc_as_upsert: true,
    },
  });
}
