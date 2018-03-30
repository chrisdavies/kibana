import { setReadonly } from './set_readonly';

/**
 * Points the specified alias to the specified index and removes
 * any other indices from the alias.
 * @param {ElasticsearchJs} callCluster - The Elasticsearch client function.
 * @param {string} alias - The name of the alias
 * @param {string} index - The index to which the alias will point
 */
export async function setAlias(callCluster, alias, index) {
  const currentAlias = await callCluster('indices.getAlias', { name: alias });
  const currentIndices = Object.keys(currentAlias);
  const actions = currentIndices.map(k => ({
    remove: { index: k, alias }
  }));
  // We can't remove a read-only index from the alias, so we need to ensure they are writable
  await Promise.all(currentIndices.map(index => setReadonly(callCluster, index, false)));
  callCluster('indices.updateAliases', {
    body: {
      actions: [...actions, { add: { index, alias } }],
    },
  });
}
