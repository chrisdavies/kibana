// The primary logic for applying migrations to an index
const Joi = require('joi');
const { MigrationState, MigrationStatus, Persistence, MigrationContext, Opts } = require('./lib');

module.exports = {
  fetchStatus,
  migrate,
};

const fetchStatusOptsSchema = Joi.object().unknown().keys({
  callCluster: Opts.callClusterSchema.required(),
  index: Opts.indexSchema.required(),
  plugins: Opts.pluginArraySchema.required(),
});

const migrateOptsSchema = Joi.object().unknown().keys({
  callCluster: Opts.callClusterSchema.required(),
  index: Opts.indexSchema.required(),
  plugins: Opts.pluginArraySchema.required(),
  log: Joi.func().required(),
  elasticVersion: Joi.string().required(),
  force: Joi.bool().default(false),
});

/**
 * @typedef {elapsedMs: number, index: string, destIndex: string, status: MigrationStatus} MigrationResult
*/

/**
 * Checks whether or not the specified index is in need of migrations.
 *
 * @param {MigrationOpts} opts
 * @returns {Promise<MigrationStatus>}
 */
async function fetchStatus(opts) {
  Joi.assert(opts, fetchStatusOptsSchema);
  const { plugins, migrationState } = await MigrationContext.fetch(opts);
  return MigrationState.status(plugins, migrationState);
}

/**
 * Performs a migration of the specified index using the migrations defined by
 * the specified plugins.
 * @param {MigrationOpts} opts
 * @returns {MigrationResult}
 */
async function migrate(opts) {
  Joi.assert(opts, migrateOptsSchema);
  const { result, elapsedMs } = await measureElapsedTime(() => runMigrationIfOutOfDate(opts));
  return {
    ...result,
    elapsedMs
  };
}

async function measureElapsedTime(fn) {
  const startTime = Date.now();
  const result = await fn();
  return { result, elapsedMs: Date.now() - startTime };
}

async function runMigrationIfOutOfDate(opts) {
  const context = await MigrationContext.fetch(opts);
  const status = await MigrationState.status(context.plugins, context.migrationState);

  try {
    if (status === MigrationStatus.migrated || (status === MigrationStatus.migrating && !context.force)) {
      return skipMigration(context, status);
    }

    // This can happen if you attempt to migrate the current index to some future
    // version, the migration fails, and you revert your Kibana to the same version
    // as the existing index. In this case, the existing index state is 'migrating'
    // and it is read-only.
    if (context.nextMigrationState.previousIndex === context.destIndex) {
      return resetIndex(context);
    }

    return runMigration(context);
  } catch (err) {
    context.log.error(err);
    throw err;
  }
}

function skipMigration({ index, log }, status) {
  log.info(() => `Skipping migration of "${index}", beacause its status is: ${status}`);
  return { index, status, destIndex: index, skippedMigration: true };
}

async function runMigration(context) {
  const { log, index, destIndex, migrationPlan, callCluster, scrollSize, nextMigrationState } = context;

  log.info(() => `Preparing to migrate "${index}"`);
  log.debug(() => `Migrations being applied: ${migrationPlan.migrations.map(({ id }) => id).join(', ')}`);

  log.info(() => `Ensuring index ${index} exists`);
  await ensureIndexExists(context);

  log.info(() => `Marking index ${index} as migrating`);
  await setMigrationStatus(context, MigrationStatus.migrating);

  log.info(() => `Ensuring alias ${index} exists`);
  await ensureIsAliased(context);

  log.info(() => `Setting index ${index} to read-only`);
  await Persistence.setReadonly(callCluster, index, true);

  log.info(() => `Setting up destination index`);
  await createDestIndex(context);

  log.info(() => `Seeding ${destIndex}`);
  await Persistence.applySeeds(callCluster, log, destIndex, migrationPlan.migrations);

  log.info(() => `Transforming ${index} into ${destIndex}`);
  await Persistence.applyTransforms(callCluster, log, index, destIndex, migrationPlan.migrations, scrollSize);

  log.info(() => `Saving migration state to ${destIndex}`);
  await MigrationState.save(callCluster, destIndex, undefined, nextMigrationState);

  log.info(() => `Pointing alias ${index} to ${destIndex}`);
  await Persistence.setAlias(callCluster, index, destIndex);

  return migrationResult(context);
}

async function setMigrationStatus({ callCluster, index, migrationStateVersion, migrationState }, status) {
  await Persistence.setReadonly(callCluster, index, false);
  await MigrationState.save(callCluster, index, migrationStateVersion, {
    ...migrationState,
    status,
  });
}

async function ensureIndexExists({ log, index, initialIndex, callCluster, migrationPlan: { mappings } }) {
  const exists = await Persistence.indexExists(callCluster, index);
  if (!exists) {
    log.info(() => `Creating index ${initialIndex}`);
    await Persistence.createIndex(callCluster, initialIndex, {
      mappings,
      aliases: {
        [index]: {},
      },
      settings: {
        index: {
          number_of_replicas: '1',
          number_of_shards: '5',
        },
      },
    });
  }
}

async function ensureIsAliased({ callCluster, index, initialIndex, log }) {
  const isAlias = await Persistence.aliasExists(callCluster, index);
  if (!isAlias) {
    log.info(() => `Converting index ${index} to an alias`);
    await Persistence.convertIndexToAlias(callCluster, index, initialIndex);
  }
}

async function createDestIndex({ callCluster, force, destIndex, index, migrationPlan, log }) {
  const exists = await Persistence.indexExists(callCluster, destIndex);
  if (exists) {
    if (!force) {
      throw new Error(`Destination index ${destIndex} already exists!`);
    }
    log.info(() => `Deleting destination index ${destIndex}`);
    await callCluster('indices.delete', { index: destIndex });
  }
  log.info(() => `Creating destination index ${destIndex}`);
  await Persistence.cloneIndexSettings(callCluster, index, destIndex, migrationPlan.mappings);
}

async function resetIndex(context) {
  const { log, index, destIndex } = context;
  log.info(() => `Re-activating "${index}" to use "${destIndex}"`);
  await setMigrationStatus(context, MigrationStatus.migrated);
  return migrationResult(context);
}

function migrationResult({ index, destIndex }) {
  return { index, destIndex, status: MigrationStatus.migrated };
}
