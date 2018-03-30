/**
 * Sets the index to read only.
 *
 * @param {ElasticsearchJs} callCluster The Elasticsearch client function.
 * @param {string} index The name of the index being converted to/from read-only.
 * @param {boolean} [readOnly=true] If true, index becomes readonly, if false, index becomes writeable.
 * @returns {Promise}
 */
export function setReadonly(callCluster, index, readOnly = true) {
  return callCluster('indices.putSettings', {
    index,
    body: {
      index: {
        'blocks.read_only': readOnly,
      },
    },
  });
}
