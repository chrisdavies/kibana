import { checksumMigrations } from './checksum';

/**
 * Generates the migration state for the specified set of plugins.
 *
 * @param {MigrationPlugin[]} plugins
 * @param {MappingDefinition} mappings
 * @returns {MigrationState}
 */
export function buildMigrationState(plugins, mappings) {
  return {
    checksum: checksumMigrations(plugins, mappings),
    plugins: plugins.map(({ id, migrations }) => ({
      id,
      appliedMigrations: migrations.map(({ id }) => id),
    })),
  };
}
