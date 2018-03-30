
/**
 * Builds the opts argument to be passed into the migration engine for performing
 * a migration or checking the migration status of the '.kibana' index.
 * @param {KibanaServer} server
 * @param {KoaRequest} [request]
 */
export function migrationOpts(server, request) {
  const index = server.config().get('kibana.index');
  const { callWithRequest, callWithInternalUser } = server.plugins.elasticsearch.getCluster('admin');
  const callWithRequestUser = (...args) => callWithRequest(request, ...args);
  const mappings = server.getKibanaIndexMappingsDsl();
  const log = prefix => msg => server.log(prefix, typeof msg === 'function' ? msg() : msg);
  const plugins = Object.keys(server.plugins)
    .map((id) => ({
      id,
      migrations: server.plugins[id].migrations,
    }));
  return {
    index,
    log,
    plugins,
    mappings,
    callCluster: !!request ? callWithInternalUser : callWithRequestUser,
  };
}
