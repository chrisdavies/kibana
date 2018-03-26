import _ from 'lodash';
import { pluginsWithAppliedMigrations } from './migration_helpers';

/**
 * Asserts that the specified plugins and migration state are valid.
 * @param {KibanaPlugin[]} plugins A list of Kibana plugins that have defined migrations
 * @param {MigrationState} state The migration state which is stored in Elastic
 */
export function validatePluginState(plugins, state) {
  pluginsWithAppliedMigrations(plugins, state).forEach(assertValidPlugin);
  return state;
}

function assertValidPlugin(plugin) {
  assertConsistentOrder(plugin);
  assertUniqueMigrationIds(plugin);
}

function assertConsistentOrder({ id, migrations, appliedMigrations }) {
  for (let i = 0; i < appliedMigrations.length; ++i) {
    const actual = migrations[i] && migrations[i].id;
    const expected = appliedMigrations[i];
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
