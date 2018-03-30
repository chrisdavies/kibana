import { cloneIndexSettings } from './clone_index_settings';

/**
 * If sourceIndex is not an alias, this will move sourceIndex to destIndex,
 * and create an alias named sourceIndex that points to destIndex.
 *
 * @param {ElasticsearchJs} callCluster The Elasticsearch client function.
 * @param {string} sourceIndex The name of the source index, which will become the name of the alias.
 * @param {string} destIndex The name of the index to which sourceIndex will be cloned.
 * @returns {Promise}
 */
export async function convertIndexToAlias(callCluster, sourceIndex, destIndex) {
  const isAliased = await callCluster('indices.existsAlias', { name: sourceIndex });
  if (isAliased) {
    return;
  }
  await cloneIndexSettings(callCluster, sourceIndex, destIndex);
  await reindex(callCluster, sourceIndex, destIndex);
  await callCluster('indices.delete', { index: sourceIndex });
  await callCluster('indices.putAlias', { index: destIndex, name: sourceIndex });
}

function reindex(callCluster, sourceIndex, destIndex) {
  return callCluster('reindex', {
    waitForCompletion: true,
    waitForActiveShards: 'all',
    refresh: true,
    body: {
      source: {
        index: sourceIndex,
      },
      dest: {
        index: destIndex,
      },
    },
  });
}
