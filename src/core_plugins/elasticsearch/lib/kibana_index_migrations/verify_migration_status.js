import Promise from 'bluebird';
import { isIndexMigrated } from '@kbn/migrations';
import { migrationOpts } from './migration_opts';

/**
 * A health check function that verifies the migration status of the '.kibana'
 * index.
 *
 * @param {KibanaPlugin} plugin
 * @param {KibanaServer} server
 */
export async function verifyMigrationStatus(plugin, server) {
  const REQUEST_DELAY = server.config().get('elasticsearch.healthCheck.delay');
  const opts = migrationOpts(server);
  const isMigrated = await isIndexMigrated(opts);
  if (!isMigrated) {
    plugin.status.red(`Index "${opts.index}" is out of date and needs to be migrated.`);
    return Promise.delay(REQUEST_DELAY).then(() => verifyMigrationStatus(plugin, server));
  }
}
