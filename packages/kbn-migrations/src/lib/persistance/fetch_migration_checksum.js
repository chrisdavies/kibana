import { DOC_TYPE, MIGRATION_DOC_ID } from '../consts';
import { fetchOrNull } from '../fetch_or_null';

/**
 * Retrieves the migration checksum from the specified index,
 * returns empty string if the index has no migration state.
 *
 * @param {ElasticsearchJs} callCluster
 * @param {string} index
 * @returns {string}
 */
export async function fetchMigrationChecksum(callCluster, index) {
  const result = await fetchOrNull(callCluster('get', {
    index,
    id: MIGRATION_DOC_ID,
    type: DOC_TYPE,
    _source: ['migration.checksum'],
  }));

  return result ? result._source.migration.checksum : '';
}
