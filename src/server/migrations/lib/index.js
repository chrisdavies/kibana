import _ from 'lodash';
import { getMigrationContext, checksumMigrations } from './migration_helpers';
import { fetchMigrationChecksum, fetchUnappliedMigrations } from './persistance';

export { migrate } from './migrate';

/**
 * Checks whether or not the specified index is in need of migrations.
 * @param {MigrationOpts} opts
 * @returns {boolean} - if true: the index is up to date / migrated, false: the index needs to be migrated
 */
export async function isIndexMigrated(opts) {
  const { callCluster, index, plugins } = getMigrationContext(opts);
  const storedChecksum = await fetchMigrationChecksum(callCluster, index);
  const currentChecksum = checksumMigrations(plugins);
  return storedChecksum === currentChecksum;
}

/**
 * Computes the set of migrations which need to be applied, has the
 * side-effect of validating the plugin list.
 *
 * @param {MigrationOpts} opts
 */
export async function dryRun(opts) {
  const context = getMigrationContext(opts);
  const migrations = await fetchUnappliedMigrations(context);
  return _.groupBy(migrations, 'pluginId');
}

/**
 * @typedef {Object} MigrationOpts
 * @property {KibanaServer} server - The Kibana server object used for communication w/ elasticsearch, accessing plugins, and for logging
 * @property {string} index - The name of the Elasticsearch index being migrated
 * @property {function} callCluster - The function used to call elastic. Should conform to the signature of callWithInternalUser (see cluster.js)
 */

/**
 * The interface the migration system expects plugins to satisfy.
 * @typedef {Object} KibanaPlugin
 * @property {string} id - The unique identifier of the plugin
 * @property {KibanaMigration[]} [migrations] - A list of migrations associated with the plugin
 */

/**
 * The various kinds of migrations supported by the migration system.
 * @typedef {KibanaSeed | KibanaTransform | KibanaMapping} KibanaMigration
 */

/**
 * Upserts a document to the destination index during a migration.
 * @typedef {Object} KibanaSeed
 * @property {string} id - The unique (to the plugin) id of the migration
 * @property {() => object} seed - A function which returns a document. It can also specify id and type if
 *   it returns an object of shape {_id, _type, _source}.
 */

/**
 * Transforms an existing document from the previous shape to the new shape.
 * @typedef {Object} KibanaTransform
 * @property {string} id - The unique (to the plugin) id of the migration
 * @property {(doc: object) => boolean} filter - A function which determines whether or not this migration applies to the
 *    specified document
 * @property {(doc: object) => object} transform - A function which transforms the specified document from one shape
 *    to another
 */

/**
 * Modifies the destination index's mappings
 * @typedef {Object} KibanaMapping
 * @property {string} id - The unique (to the plugin) id of the migration
 * @property {() => object} mapping - A function which returns a mapping definition
 * @example
 * {
 *   id: '921f86a3-1c40-4ddc-b213-f975049d4859',
 *   mapping: () => ({
 *     properties: {
 *       hello: {
 *         properties: {
 *           name: { type: 'string' },
 *         },
 *       },
 *     },
 *   }),
 * }
 */
