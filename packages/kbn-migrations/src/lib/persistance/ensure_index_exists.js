/**
 * Creates the specified index if it doesn't exist.
 * @param {ElasticsearchJs} callCluster
 * @param {string} index
 */
export async function ensureIndexExists(callCluster, index) {
  const exists = await callCluster('indices.exists', { index });
  if (!exists) {
    await callCluster('indices.create', { index });
  }
}
