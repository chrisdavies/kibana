import _ from 'lodash';
import moment from 'moment';
import { fetchOrNull } from './fetch_or_null';
import { DOC_TYPE, MIGRATION_DOC_ID } from './consts';

/**
 * Validates the migration opts argument and returns an object which can be used
 * to run migrations.
 * @param {MigrationOpts} opts
 */
export async function migrationContext(opts) {
  const state = await fetchMigrationState(opts.callCluster, opts.index);
  const plugins = pluginsWithUnappliedMigrations(pluginsWithMigrations(opts.plugins), state);
  const unappliedMigrations = _.compact(_.flatMap(plugins, 'unappliedMigrations'));
  return {
    ...opts,
    plugins,
    unappliedMigrations,
    destIndex: `${opts.index}-${moment().format('YYYYMMDDHHmmss')}`,
    log: migrationLogger(opts.log),
  };
}

export function pluginsWithMigrations(plugins) {
  return plugins.filter(({ migrations }) => !!migrations);
}

async function fetchMigrationState(callCluster, index) {
  const result = await fetchOrNull(callCluster('get', {
    index,
    id: MIGRATION_DOC_ID,
    type: DOC_TYPE,
  }));

  return result ? result._source.migration : {
    checksum: '',
    plugins: [],
  };
}

function migrationLogger(log) {
  const logFn = prefix => msg => log(prefix, typeof msg === 'function' ? msg() : msg);
  const logger = (...args) => log(...args);
  logger.info = logFn(['info', 'migration']);

  // Temporarily change this to info, to see migration debug logs without
  // all the noise of normal Kibana debug logs.
  logger.debug = logFn(['debug', 'migration']);

  return logger;
}
function pluginsWithUnappliedMigrations(plugins, state) {
  const hash = _.keyBy(state.plugins, 'id');
  const result = plugins.map((p) => ({
    ...p,
    ...partitionPluginMigrations(p, (hash[p.id] || {})),
  }));
  return validatePlugins(result);
}

function partitionPluginMigrations(plugin, { appliedMigrations }) {
  const appliedMigrationIds = appliedMigrations || [];
  return {
    appliedMigrationIds,
    unappliedMigrations: (plugin.migrations || [])
      .slice(appliedMigrationIds.length)
      .map(m => ({ ...m, pluginId: plugin.id })),
  };
}

function validatePlugins(plugins) {
  plugins.forEach(assertValidPlugin);
  return plugins;
}

function assertValidPlugin(plugin) {
  assertConsistentOrder(plugin);
  assertUniqueMigrationIds(plugin);
}

function assertConsistentOrder({ id, migrations, appliedMigrationIds }) {
  for (let i = 0; i < appliedMigrationIds.length; ++i) {
    const actual = migrations[i] && migrations[i].id;
    const expected = appliedMigrationIds[i];
    if (actual !== expected) {
      throw new Error(`Plugin "${id}" migration order has changed. Expected migration "${expected}", but found "${actual}".`);
    }
  }
}

function assertUniqueMigrationIds({ id, migrations }) {
  const dup = duplicatedId(migrations);
  if (dup) {
    throw new Error(`Plugin "${id}" has migration "${dup}" defined more than once.`);
  }
}

function duplicatedId(migrations) {
  const ids = _.groupBy(_.map(migrations, 'id'), _.identity);
  const dup = _.first(_.reject(_.values(ids), arr => arr.length < 2));
  return _.first(dup);
}
