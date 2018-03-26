// The API endpoint for migrations
import { dryRun, migrate, isIndexMigrated } from '../lib';

export function migrationsMixin(kbnServer, server) {
  // Checks the migration status for the specified index.
  // Returns: {index: string, upToDate: boolean}
  server.route({
    path: '/api/migrations/{index}/status',
    method: 'GET',
    handler: async (request, reply) => {
      const { index } = request.params;
      const isMigrated = await isIndexMigrated({ server, index });
      return reply({ index, isMigrated });
    },
  });

  // Migrates the specified index. If the index was already
  // migrated, this returns no destIndex.
  server.route({
    path: '/api/migrations/{index}',
    method: 'POST',
    handler: async (request, reply) => {
      const { index } = request.params;
      const result = await migrate({ server, index });
      return reply(result);
    },
  });

  // Retrieves the ids of all migrations which will be applied
  // if the index is migrated.
  server.route({
    path: '/api/migrations/{index}/dryrun',
    method: 'GET',
    handler: async (request, reply) => {
      const { index } = request.params;
      const result = await dryRun({ server, index });
      return reply(result);
    },
  });
}
