import _ from 'lodash';
import objectHash from 'object-hash';

/**
 * Computes the checksum for the specified plugins' migrations.
 *
 * @param {MigrationPlugin[]} plugins
 * @param {MappingDefinition} mappings
 * @returns {string}
 */
export function checksumMigrations(plugins, mappings) {
  const migrationIds = _.flatMap(plugins, ({ migrations }) => _.map(migrations, 'id'));
  if (!mappings && !migrationIds.length) {
    return '';
  }
  return objectHash({ mappings, migrationIds });
}
