import { checksumMigrations, fetchMigrationChecksum, pluginsWithMigrations } from './lib';

/**
 * Checks whether or not the specified index is in need of migrations.
 *
 * @param {MigrationOpts} opts
 * @returns {Promise<boolean>} - if true: the index is up to date / migrated, false: the index needs to be migrated
 */
export async function isIndexMigrated(opts) {
  const { callCluster, index, mappings } = opts;
  const storedChecksum = await fetchMigrationChecksum(callCluster, index);
  const currentChecksum = checksumMigrations(pluginsWithMigrations(opts.plugins), mappings);
  return storedChecksum === currentChecksum;
}
