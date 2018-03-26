// Migration helper functions that are -- as much as possible -- pure.
// Any functions which communicate w/ Elasticsearch should not go here.
import _ from 'lodash';
import moment from 'moment';
import { createHash } from 'crypto';

/**
 * Computes the checksum of a list of strings.
 *
 * @param values - The list of values to turn into a checksum.
 * @returns {string}
 */
export function checksum(values) {
  const md5 = createHash('md5');
  values.forEach((f) => md5.update(f));
  return md5.digest().toString('base64');
}

/**
 * Computes the checksum for the specified plugins' migrations.
 *
 * @param {KibanaPlugin[]} plugins
 * @returns {string}
 */
export function checksumMigrations(plugins) {
  const migrationIds = _.flatten(_.map(plugins, 'migrations')).map(m => m.id);
  return migrationIds.length ? checksum(migrationIds) : '';
}

/**
 * Returns a list of Kibana plugins with an `appliedMigrations` property.
 *
 * @param {KibanaPlugin[]} plugins
 * @param {MigrationState} state
 * @returns {KibanaPlugin & {appliedMigrations: string[]}}
 */
export function pluginsWithAppliedMigrations(plugins, state) {
  const hash = _.indexBy(state.plugins, 'id');
  return plugins.map(p => ({
    ...p,
    appliedMigrations: (hash[p.id] || {}).appliedMigrations || [],
  }));
}

/**
 * Creates a function which migrates a document.
 * @param {Migration[]} migrations
 * @returns {(doc: object) => object}
 */
export function migrationPipeline(migrations) {
  const transforms = migrations.filter(m => m.filter && m.transform);
  return (doc) => transforms.reduce((acc, { filter, transform }) => filter(acc) ? transform(acc) : acc, doc);
}

/**
 * Given a set of migrations, this runs all seeds through the
 * subsequent transform functions and returns the resulting docs.
 * This assumes that seeds will be relatively rare, so we can fit
 * them all into memory.
 *
 * @param {Migration[]} migrations
 * @returns {object[]} An array of objects, presumably to be bulk-inserted
 */
export function seededDocs(migrations) {
  return migrations.map((m, i) => ({ m, i }))
    .filter(({ m }) => !!m.seed)
    .map(({ m, i }) => {
      const transform = migrationPipeline(migrations.slice(i));
      const doc = m.seed();
      if (doc._id && doc._source) {
        return { ...doc, _source: transform(doc._source) };
      }
      return transform(doc);
    });
}

/**
 * Generates the migration state for the specified set of plugins.
 *
 * @param {KibanaPlugin[]} plugins
 * @returns {MigrationState}
 */
export function migrationState(plugins) {
  return {
    checksum: checksumMigrations(plugins),
    plugins: plugins.map(({ id, migrations }) => ({
      id,
      appliedMigrations: migrations.map(({ id }) => id),
    })),
  };
}

/**
 * Takes a list of plugins and the applied migration state
 * and determines which migrations need to be applied.
 *
 * @param {KibanaPlugin[]} plugins A list of Kibana plugins that have defined migrations
 * @param {MigrationState} state The Kibana migration state which is stored in Elastic
 * @returns {Migration[]}
 */
export function unappliedMigrations(plugins, state) {
  const unappliedMigrationsForPlugin = (plugin) => plugin.migrations
    .slice(plugin.appliedMigrations.length)
    .map(m => ({ ...m, pluginId: plugin.id }));
  const migrations = pluginsWithAppliedMigrations(plugins, state)
    .map(unappliedMigrationsForPlugin);
  return _.flatten(migrations);
}

/**
 * Creates the logger functions used by the migration system.
 * @param {KibanaServer} server
 */
export function migrationLogger(server) {
  const logFn = prefix => msg => server.log(prefix, typeof msg === 'function' ? msg() : msg);
  return {
    info: logFn(['info', 'migration']),

    // Temporarily change this to info, to see migration debug logs without
    // all the noise of normal Kibana debug logs.
    debug: logFn(['info', 'migration']),
  };
}

/**
 * Creates an a context object that is used to run migrations.
 * @param {MigrationOpts} opts
 */
export function getMigrationContext({ server, index }) {
  const plugins = Object.keys(server.plugins)
    .map((id) => ({
      id,
      migrations: server.plugins[id].migrations,
    }))
    .filter(({ migrations }) => !!migrations);

  return {
    index,
    plugins,
    destIndex: `${index}-${moment().format('YYYYMMDDHHmmss')}`,
    client: server.plugins.elasticsearch.getCluster('data').getClient(),
    log: migrationLogger(server),
  };
}
