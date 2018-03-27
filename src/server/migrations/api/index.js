// The API endpoint for Kibana index migrations
import { dryRun, migrate, isIndexMigrated } from '../lib';

export function migrationsMixin(kbnServer, server) {
  const index = server.config().get('kibana.index');

  function buildOpts(request) {
    const { callWithRequest } = server.plugins.elasticsearch.getCluster('admin');

    return {
      index,
      server,
      callCluster(...args) {
        return callWithRequest(request, ...args);
      },
    };
  }

  // Checks the migration status for the Kibana index.
  // Returns: {index: string, upToDate: boolean}
  server.route({
    path: '/api/migrations/status',
    method: 'GET',
    handler: async (request, reply) => {
      const opts = buildOpts(request);
      const isMigrated = await isIndexMigrated(opts);
      return reply({ index, isMigrated });
    },
  });

  // Migrates the Kibana index. If the index was already
  // migrated, this returns no destIndex.
  server.route({
    path: '/api/migrations',
    method: 'POST',
    handler: async (request, reply) => {
      const result = await migrate(buildOpts(request));
      return reply(result);
    },
  });

  // Retrieves the ids of all migrations which will be applied
  // if the Kibana index is migrated.
  server.route({
    path: '/api/migrations/dryrun',
    method: 'GET',
    handler: async (request, reply) => {
      const result = await dryRun(buildOpts(request));
      return reply(result);
    },
  });
}
