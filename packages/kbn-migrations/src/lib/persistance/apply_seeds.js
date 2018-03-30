import { seededDocs } from '../migration_pipeline';
import { standardToRaw } from '../standardize_doc';
import { bulkInsert } from './bulk_insert';

/**
 * Applies seed migrations (new document inserts) to the specified index.
 *
 * @param {ElasticsearchJs} callCluster
 * @param {MigrationLogger} log
 * @param {string} index
 * @param {KibanaMigration[]} migrations
 */
export async function applySeeds(callCluster, log, index, migrations) {
  const docs = seededDocs(migrations).map(standardToRaw);
  if (docs.length) {
    await bulkInsert(callCluster, log, index, docs);
  }
}
