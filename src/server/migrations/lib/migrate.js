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

async function runMigration({ index, destIndex, client, log, plugins }, migrations) {
  log.info(() => `Migrating from "${index}" to "${destIndex}".`);
  log.debug(() => `Preparing to run ${index} migrations ${migrations.map(({ id }) => id).join(', ')}`);

  log.info(() => `Ensuring ${index} is an alias.`);
  await convertIndexToAlias(client, index, `${index}-original`);

  log.info(() => `Setting ${index} to read-only.`);
  await setReadonly(client, index, true);

  log.info(() => `Creating ${destIndex}.`);
  await cloneIndexSettings(client, index, destIndex);

  log.info(() => `Applying mappings to ${destIndex}.`);
  await applyMappings(client, destIndex, migrations);

  log.info(() => `Applying seeds to ${destIndex}.`);
  await applySeeds(client, log, destIndex, migrations);

  log.info(() => `Applying transforms to ${destIndex}.`);
  await applyTransforms(client, log, index, destIndex, migrations);

  log.info(() => `Saving migration state to ${destIndex}.`);
  await saveMigrationState(client, destIndex, migrationState(plugins));

  log.info(() => `Pointing alias ${index} to ${destIndex}.`);
  await setAlias(client, index, destIndex);

  return { destIndex, index, isSkipped: false };
}
