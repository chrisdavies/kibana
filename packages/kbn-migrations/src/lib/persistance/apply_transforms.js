import { bulkInsert } from './bulk_insert';
import { buildTransformFunction } from '../migration_pipeline';
import { standardToRaw, rawToStandard } from '../standardize_doc';

/**
 * Runs all transform migrations on docs in the sourceIndex and persists
 * the resulting docs to destIndex.
 *
 * @param {ElasticsearchJs} callCluster
 * @param {MigrationLogger} log
 * @param {string} sourceIndex
 * @param {string} destIndex
 * @param {KibanaMigration[]} migrations
 * @param {number} [scrollSize=100] The number of documents to process at a time
 */
export async function applyTransforms(callCluster, log, sourceIndex, destIndex, migrations, scrollSize = 100) {
  const migrationFn = buildTransformFunction(migrations);
  await eachScroll(callCluster, sourceIndex, async (scroll) => {
    const docs = scroll.hits.hits.map((doc) => {
      return standardToRaw(migrationFn(rawToStandard(doc)));
    });
    return bulkInsert(callCluster, log, destIndex, docs);
  }, scrollSize);
}

async function eachScroll(callCluster, index, eachFn, size = 100) {
  const scroll = '1m';
  let result = await callCluster('search', { index, scroll, body: { size } });

  while (result.hits.hits.length) {
    await eachFn(result);
    result = await callCluster('scroll', { scrollId: result._scroll_id, scroll });
  }
}
