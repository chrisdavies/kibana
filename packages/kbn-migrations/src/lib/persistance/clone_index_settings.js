/**
 * Copies the index settings from sourceIndex to destIndex.
 * @param {ElasticsearchJs} callCluster
 * @param {string} sourceIndex
 * @param {string} destIndex
 */
export async function cloneIndexSettings(callCluster, sourceIndex, destIndex) {
  const settings = await getIndexSettings(callCluster, sourceIndex);
  const { index } = settings;
  return callCluster('indices.create', {
    index: destIndex,
    body: {
      settings: {
        index: {
          number_of_shards: index.number_of_shards,
          number_of_replicas: index.number_of_replicas,
        },
        provided_name: settings.provided_name,
      },
    },
  });
}

async function getIndexSettings(callCluster, index) {
  const result = await callCluster('indices.getSettings', { index });
  // Result has an unpredictable shape: {index-name: {settings: ...}}
  // Where index name might be: 'kibana-213423423' so, we just grab the settings
  // from the first value.
  return Object.values(result)[0].settings;
}
