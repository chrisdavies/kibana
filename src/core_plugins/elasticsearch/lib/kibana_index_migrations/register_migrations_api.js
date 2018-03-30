// The API endpoint for Kibana index migrations
import { dryRun, migrate, isIndexMigrated } from '@kbn/migrations';
import { migrationOpts } from './migration_opts';

export function registerMigrationsApi(server) {
  const BASE_URL = '/api/elasticsearch/kibana-migration';

  // Checks the migration status for the Kibana index.
  // Returns: {index: string, upToDate: boolean}
  server.route({
    path: `${BASE_URL}/status`,
    method: 'GET',
    handler: handleErrors(async (request, reply) => {
      const opts = migrationOpts(server, request);
      const isMigrated = await isIndexMigrated(opts);
      return reply({ index: opts.index, isMigrated });
    }),
  });

  // Migrates the Kibana index. If the index was already
  // migrated, this returns no destIndex.
  server.route({
    path: BASE_URL,
    method: 'POST',
    handler: handleErrors(async (request, reply) => {
      const result = await migrate(migrationOpts(server, request));
      return reply(result);
    }),
  });

  // Retrieves the ids of all migrations which will be applied
  // if the Kibana index is migrated.
  server.route({
    path: `${BASE_URL}/dryrun`,
    method: 'GET',
    handler: handleErrors(async (request, reply) => {
      const result = await dryRun(migrationOpts(server, request));
      return reply(result);
    }),
  });
}

// Currently, we're passing the error directly through in the reply,
// which may be ill-advised from a securitiy standpoint, so we may
// want to revisit this.
function handleErrors(handler) {
  return async (request, reply) => {
    try {
      await handler(request, reply);
    } catch (err) {
      const statusCode = err && err.statusCode;
      reply(err).code(statusCode || 500);
    }
  };
}
