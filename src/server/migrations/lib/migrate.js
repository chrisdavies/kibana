// The primary logic for applying migrations to an index
import moment from 'moment';
import { migrationState, getMigrationContext } from './migration_helpers';
import {
  convertIndexToAlias,
  setReadonly,
  cloneIndexSettings,
  applyMappings,
  applySeeds,
  applyTransforms,
  saveMigrationState,
  setAlias,
  fetchUnappliedMigrations,
  MIGRATION_STATE_ID,
} from './persistance';

/**
 * @typedef {{elapsedMs: number, index: string, destIndex: string, isSkipped: false} | {index: string, isSkipped: true}} MigrationResult
*/

/**
 * Performs a migration of the specified index using the migrations defined by
 * the specified plugins.
 * @param {MigrationOpts} opts
 * @returns {MigrationResult}
 */
export async function migrate(opts) {
  const { result, elapsedMs } = await measureElapsedTime(() => runMigrationIfOutOfDate(opts));
  return {
    ...result,
    elapsedMs
  };
}

async function measureElapsedTime(fn) {
  const startTime = moment();
  const result = await fn();
  return {
    result,
    elapsedMs: moment().diff(startTime, 'ms'),
  };
}

async function runMigrationIfOutOfDate(opts) {
  const context = getMigrationContext(opts);
  const migrations = await fetchUnappliedMigrations(context);

  if (migrations.length === 0) {
    return skipMigration(context);
  } else {
    return runMigration(context, migrations);
  }
}

function skipMigration({ index, log }) {
  log.info(() => `Skipping migration of "${index}" because the index is already up to date.`);
  return { index, isSkipped: true };
}

async function runMigration({ index, destIndex, server, callCluster, log, plugins }, migrations) {
  log.info(() => `Migrating from "${index}" to "${destIndex}".`);
  log.debug(() => `Preparing to run "${index}" migrations ${migrations.map(({ id }) => id).join(', ')}`);

  // This is a kibana index-specific call. It *shouldn't* hurt to invoke this
  // regardless of what index is being migrated.
  log.info(() => `Ensuring "${index}" exists.`);
  await ensureKibanaIndexExists(server, callCluster);

  log.info(() => `Ensuring "${index}" is an alias.`);
  await convertIndexToAlias(callCluster, index, `${index}-original`);

  log.info(() => `Setting "${index}" to read-only.`);
  await setReadonly(callCluster, index, true);

  log.info(() => `Creating "${destIndex}".`);
  await cloneIndexSettings(callCluster, index, destIndex);

  log.info(() => `Applying mappings to "${destIndex}".`);
  await applyMappings(callCluster, destIndex, migrations);

  log.info(() => `Applying seeds to "${destIndex}".`);
  await applySeeds(callCluster, log, destIndex, migrations);

  log.info(() => `Applying transforms to "${destIndex}".`);
  await applyTransforms(callCluster, log, index, destIndex, migrations);

  log.info(() => `Saving migration state to "${destIndex}".`);
  await saveMigrationState(callCluster, destIndex, migrationState(plugins));

  log.info(() => `Pointing alias "${index}" to "${destIndex}".`);
  await setAlias(callCluster, index, destIndex);

  return { destIndex, index, isSkipped: false };
}

// Kibana-index-specific function that uses the saved objects client to ensure
// the Kibana index exists prior to migrations. We need to create the index, as
// seed and mappings migrations rely on the index existing.
async function ensureKibanaIndexExists(server, callCluster) {
  const savedObjectsClient = server.savedObjectsClientFactory({ callCluster });

  try {
    await savedObjectsClient.create('migration', {
      checksum: '',
      plugins: [],
    }, { id: MIGRATION_STATE_ID });
  } catch (err) {
    if (!savedObjectsClient.errors.isConflictError(err)) {
      throw err;
    }
  }
}
