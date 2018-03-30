import { migrationContext } from './lib';

/**
 * Computes the set of migrations which need to be applied.
 *
 * @param {MigrationOpts} opts
 * @returns {Promise<Array<{pluginId: string, migrationIds: string[]}>>}
 */
export async function dryRun(opts) {
  const { plugins } = await migrationContext(opts);
  return plugins.map(({ id, migrations }) => ({
    pluginId: id,
    migrationIds: migrations.map(({ id }) => id),
  }));
}
