import { DOC_TYPE } from '../consts';

/**
 * Bulk inserts the specified documents, throwing an exception on any failure.
 *
 * @param {ElasticsearchJs} callCluster
 * @param {MigrationLogger} log
 * @param {string} index
 * @param {any[]} docs
 */
export async function bulkInsert(callCluster, log, index, docs) {
  const bulkActions = [];
  docs.forEach((doc) => {
    bulkActions.push({
      index: {
        _index: index,
        _type: doc._type || DOC_TYPE,
        _id: doc._id,
      },
    });
    bulkActions.push(doc._source);
  });

  log.debug(() => `Bulk inserting...`);
  log.debug(() => bulkActions);
  const result = await callCluster('bulk', { body: bulkActions });
  const err = result.items.find(({ index: { error } }) => error && error.type && error.reason);
  if (err) {
    throw err;
  }
  return result;
}
