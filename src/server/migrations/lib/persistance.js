// Helper functions for communicating w/ Elasticsearch.
import { migrationPipeline, unappliedMigrations, seededDocs } from './migration_helpers';
import { validatePluginState } from './validation';

export const MIGRATION_STATE_ID = 'migration-state';
export const MIGRATION_DOC_ID = `migration:${MIGRATION_STATE_ID}`;
export const DOC_TYPE = 'doc';

/**
 * Fetches the migration state from the specified index, returns
 * an empty migration state object if none is found.
 *
 * @param {ElasticsearchJs} callCluster
 * @param {string} index
 */
export async function fetchMigrationState(callCluster, index) {
  const result = await fetchOrNull(callCluster('get', {
    index,
    id: MIGRATION_DOC_ID,
    type: DOC_TYPE,
  }));

  return result ? result._source.migration : {
    checksum: '',
    plugins: [],
  };
}

/**
 * Retrieves the migration checksum from the specified index,
 * returns empty string if the index has no migration state.
 *
 * @param {ElasticsearchJs} callCluster
 * @param {string} index
 * @returns {string}
 */
export async function fetchMigrationChecksum(callCluster, index) {
  const result = await fetchOrNull(callCluster('get', {
    index,
    id: MIGRATION_DOC_ID,
    type: DOC_TYPE,
    _source: ['migration.checksum'],
  }));

  return result ? result._source.migration.checksum : '';
}

/**
 * Saves the migration state (checksum and applied migration ids) to
 * the specified index.
 *
 * @param {ElasticsearchJs} callCluster
 * @param {string} index
 * @param {KibanaMigration[]} migration
 */
export async function saveMigrationState(callCluster, index, migration) {
  await saveMigrationMapping(callCluster, index);
  return await callCluster('update', {
    index,
    id: MIGRATION_DOC_ID,
    type: DOC_TYPE,
    body: {
      doc: {
        migration,
      },
      doc_as_upsert: true,
    },
  });
}

/**
 * Applies mapping migrations to the specified index.
 * @param {ElasticsearchJs} callCluster
 * @param {string} index
 * @param {KibanaMigration[]} migrations
 */
export async function applyMappings(callCluster, index, migrations) {
  const mappings = migrations.filter(m => m.mapping);
  for (const { mapping } of mappings) {
    await callCluster('indices.putMapping', {
      index,
      type: DOC_TYPE,
      body: mapping(),
    });
  }
  return mappings;
}

/**
 * Applies seed migrations (new document inserts) to the specified index.
 *
 * @param {ElasticsearchJs} callCluster
 * @param {MigrationLogger} log
 * @param {string} index
 * @param {KibanaMigration[]} migrations
 */
export async function applySeeds(callCluster, log, index, migrations) {
  const docs = seededDocs(migrations).map((doc) => {
    return (doc._id && doc._source) ? doc : { _source: doc };
  });
  if (docs.length) {
    await bulkInsert(callCluster, log, index, docs);
  }
}

/**
 * Runs all transform migrations on docs in the sourceIndex and persists
 * the resulting docs to destIndex.
 *
 * @param {ElasticsearchJs} callCluster
 * @param {MigrationLogger} log
 * @param {string} sourceIndex
 * @param {string} destIndex
 * @param {KibanaMigration[]} migrations
 */
export async function applyTransforms(callCluster, log, sourceIndex, destIndex, migrations) {
  const migrationFn = migrationPipeline(migrations);
  await eachScroll(callCluster, sourceIndex, async (scroll) => {
    const docs = scroll.hits.hits.map((doc) => {
      return ({ ...doc, _source: migrationFn(doc._source) });
    });
    return bulkInsert(callCluster, log, destIndex, docs);
  });
}

/**
 * Saves the mapping for migration-state to the specified index.
 *
 * @param {ElasticsearchJs} callCluster
 * @param {string} index
 */
export async function saveMigrationMapping(callCluster, index) {
  return await callCluster('indices.putMapping', {
    index,
    type: DOC_TYPE,
    body: {
      properties: {
        migration: {
          properties: {
            checksum: { type: 'keyword' },
            plugins: {
              type: 'nested',
              properties: {
                id: { type: 'keyword' },
                appliedMigrations: { type: 'keyword' },
              },
            },
          }
        },
      },
    },
  });
}

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

/**
 * Creates a new, empty index (sourceIndex) using the settings from (destIndex).
 *
 * @param {ElasticsearchJs} callCluster The Elasticsearch API client function.
 * @param {string} sourceIndex The name of the source index.
 * @param {string} destIndex The name of the destination index.
 * @returns {Promise}
 */
export async function cloneIndexSettings(callCluster, sourceIndex, destIndex) {
  const settings = await getIndexSettings(callCluster, sourceIndex);
  const mappings = await getIndexMappings(callCluster, sourceIndex);
  const { index } = settings;
  return callCluster('indices.create', {
    index: destIndex,
    body: {
      mappings,
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

/**
 * Given the migration context, determines which migrations have not yet been run.
 * @param {MigrationContext} context
 */
export async function fetchUnappliedMigrations({ callCluster, plugins, index }) {
  const state = await fetchMigrationState(callCluster, index)
    .then(s => validatePluginState(plugins, s));

  return unappliedMigrations(plugins, state);
}

/**
 * Scrolls through all docs in the specified index, calling eachFn with the scroll results.
 *
 * @param {ElasticsearchJs} callCluster The Elasticsearch client function.
 * @param {string} index The name of the index
 * @param {function} eachFn A function that takes the results of a scroll operation and does something effectful
 * @param {number} [size=100] The number of documents to process at a time
 */
export async function eachScroll(callCluster, index, eachFn, size = 100) {
  const scroll = '1m';
  let result = await callCluster('search', { index, scroll, body: { size } });

  while (result.hits.hits.length) {
    await eachFn(result);
    result = await callCluster('scroll', { scrollId: result._scroll_id, scroll });
  }
}

/**
 * Reindexes the specified source index to the specified dest index.
 *
 * @param {ElasticsearchJs} callCluster The Elasticsearch client function.
 * @param {string} sourceIndex The name of the index being reindexed
 * @param {string} destIndex The name of the destination index.
 * @returns {Promise}
 */
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

/**
 * Fetches the settings for a single index.
 *
 * @param {ElasticsearchJs} callCluster The Elasticsearch client
 * @param {string} index The name of the index whose settings are being fetched.
 * @returns {Promise} The a promise that resolves to the index's settings
 */
async function getIndexSettings(callCluster, index) {
  const result = await callCluster('indices.getSettings', { index });
  // Result has an unpredictable shape: {index-name: {settings: ...}}
  // Where index name might be: 'kibana-213423423' so, we just grab the settings
  // from the first value.
  return Object.values(result)[0].settings;
}

/**
 * Fetches the mappings for the specified index.
 *
 * @param {ElasticsearchJs} callCluster The Elasticsearch client
 * @param {string} index The name of the index whose mappings are being fetched.
 * @returns {Promise} The a promise that resolves to the index's mappings
 */
async function getIndexMappings(callCluster, index) {
  const result = await callCluster('indices.getMapping', { index });
  // Result has an unpredictable shape: {index-name: {settings: ...}}
  // Where index name might be: 'kibana-213423423' so, we just grab the mappings
  // from the first value.
  return Object.values(result)[0].mappings;
}

async function fetchOrNull(promise) {
  try {
    const result = await promise;
    return result;
  } catch (err) {
    if (err.statusCode === 404) {
      return null;
    }
    throw err;
  }
}
