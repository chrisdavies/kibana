// The primary logic for applying migrations to an index
import moment from 'moment';
import {
  buildMigrationState,
  convertIndexToAlias,
  setReadonly,
  cloneIndexSettings,
  applyMappings,
  applySeeds,
  applyTransforms,
  saveMigrationState,
  setAlias,
  migrationContext,
  ensureIndexExists,
} from './lib';
import { isIndexMigrated } from './is_index_migrated';

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
  const context = await migrationContext(opts);
  const isMigrated = await isIndexMigrated(opts);

  if (isMigrated) {
    return skipMigration(context);
  } else {
    return runMigration(context);
  }
}

function skipMigration({ index, log }) {
  log.info(() => `Skipping migration of "${index}" because the index is already up to date.`);
  return { index, isSkipped: true };
}

async function runMigration({
  index,
  destIndex,
  callCluster,
  log,
  mappings,
  plugins,
  scrollSize,
  unappliedMigrations,
}) {
  log.info(() => `Migrating from "${index}" to "${destIndex}".`);
  log.debug(() => `Preparing to run "${index}" migrations ${unappliedMigrations.map(({ id }) => id).join(', ')}`);

  // This is a kibana index-specific call. It *shouldn't* hurt to invoke this
  // regardless of what index is being migrated.
  log.info(() => `Ensuring "${index}" exists.`);
  await ensureIndexExists(callCluster, index);

  log.info(() => `Ensuring "${index}" is an alias.`);
  await convertIndexToAlias(callCluster, index, `${index}-original`);

  log.info(() => `Setting "${index}" to read-only.`);
  await setReadonly(callCluster, index, true);

  log.info(() => `Creating "${destIndex}".`);
  await cloneIndexSettings(callCluster, index, destIndex);

  log.info(() => `Applying mappings to "${destIndex}".`);
  await applyMappings(callCluster, destIndex, mappings);

  log.info(() => `Applying seeds to "${destIndex}".`);
  await applySeeds(callCluster, log, destIndex, unappliedMigrations);

  log.info(() => `Applying transforms to "${destIndex}".`);
  await applyTransforms(callCluster, log, index, destIndex, unappliedMigrations, scrollSize);

  log.info(() => `Saving migration state to "${destIndex}".`);
  await saveMigrationState(callCluster, destIndex, buildMigrationState(plugins, mappings));

  log.info(() => `Pointing alias "${index}" to "${destIndex}".`);
  await setAlias(callCluster, index, destIndex);

  return { destIndex, index, isSkipped: false };
}
