import { DOC_TYPE } from '../consts';

/**
 * Applies mapping migrations to the specified index.
 * @param {ElasticsearchJs} callCluster
 * @param {string} index
 * @param {MappingDefinition} mappings
 */
export async function applyMappings(callCluster, index, mappings) {
  if (!mappings) {
    return;
  }

  return await callCluster('indices.putMapping', {
    index,
    type: DOC_TYPE,
    body: mappings,
  });
}
