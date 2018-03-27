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
 * @param {ElasticsearchJs} client
 * @param {string} index
 */
export async function fetchMigrationState(client, index) {
  const result = await fetchOrDefault(client.get({
    index,
    id: MIGRATION_DOC_ID,
    type: DOC_TYPE,
  }), () => null);

  return result ? result._source.migration : {
    checksum: '',
    plugins: [],
  };
}

/**
 * Retrieves the migration checksum from the specified index,
 * returns empty string if the index has no migration state.
 *
 * @param {ElasticsearchJs} client
 * @param {string} index
 * @returns {string}
 */
export async function fetchMigrationChecksum(client, index) {
  const result = await fetchOrDefault(client.get({
    index,
    id: MIGRATION_DOC_ID,
    type: DOC_TYPE,
    _source: ['migration.checksum'],
  }), () => null);

  return result ? result._source.migration.checksum : '';
}

/**
 * Saves the migration state (checksum and applied migration ids) to
 * the specified index.
 *
 * @param {ElasticsearchJs} client
 * @param {string} index
 * @param {KibanaMigration[]} migration
 */
export async function saveMigrationState(client, index, migration) {
  await saveMigrationMapping(client, index);
  return await client.update({
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
 * @param {ElasticsearchJs} client
 * @param {string} index
 * @param {KibanaMigration[]} migrations
 */
export async function applyMappings(client, index, migrations) {
  const mappings = migrations.filter(m => m.mapping);
  for (const { mapping } of mappings) {
    await client.indices.putMapping({
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
 * @param {ElasticsearchJs} client
 * @param {MigrationLogger} log
 * @param {string} index
 * @param {KibanaMigration[]} migrations
 */
export async function applySeeds(client, log, index, migrations) {
  const docs = seededDocs(migrations).map((doc) => {
    return (doc._id && doc._source) ? doc : { _source: doc };
  });
  if (docs.length) {
    await bulkInsert(client, log, index, docs);
  }
}

/**
 * Runs all transform migrations on docs in the sourceIndex and persists
 * the resulting docs to destIndex.
 *
 * @param {ElasticsearchJs} client
 * @param {MigrationLogger} log
 * @param {string} sourceIndex
 * @param {string} destIndex
 * @param {KibanaMigration[]} migrations
 */
export async function applyTransforms(client, log, sourceIndex, destIndex, migrations) {
  const migrationFn = migrationPipeline(migrations);
  await eachScroll(client, sourceIndex, async (scroll) => {
    const docs = scroll.hits.hits.map((doc) => {
      return ({ ...doc, _source: migrationFn(doc._source) });
    });
    return bulkInsert(client, log, destIndex, docs);
  });
}

/**
 * Saves the mapping for migration-state to the specified index.
 *
 * @param {ElasticsearchJs} client
 * @param {string} index
 */
export async function saveMigrationMapping(client, index) {
  return await client.indices.putMapping({
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
 * @param {ElasticsearchJs} client
 * @param {MigrationLogger} log
 * @param {string} index
 * @param {any[]} docs
 */
export async function bulkInsert(client, log, index, docs) {
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
  const result = await client.bulk({ body: bulkActions });
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
 * @param {ElasticsearchJs} client The Elasticsearch client.
 * @param {string} sourceIndex The name of the source index, which will become the name of the alias.
 * @param {string} destIndex The name of the index to which sourceIndex will be cloned.
 * @returns {Promise}
 */
export async function convertIndexToAlias(client, sourceIndex, destIndex) {
  const isAliased = await client.indices.existsAlias({ name: sourceIndex });
  if (isAliased) {
    return;
  }
  await cloneIndexSettings(client, sourceIndex, destIndex);
  await reindex(client, sourceIndex, destIndex);
  await client.indices.delete({ index: sourceIndex });
  await client.indices.putAlias({ index: destIndex, name: sourceIndex });
}

/**
 * Creates a new, empty index (sourceIndex) using the settings from (destIndex).
 *
 * @param {ElasticsearchJs} client The Elasticsearch API client.
 * @param {string} sourceIndex The name of the source index.
 * @param {string} destIndex The name of the destination index.
 * @returns {Promise}
 */
export async function cloneIndexSettings(client, sourceIndex, destIndex) {
  const settings = await getIndexSettings(client, sourceIndex);
  const mappings = await getIndexMappings(client, sourceIndex);
  const { index } = settings;
  return client.indices.create({
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
 * @param {ElasticsearchJs} client The Elasticsearch client.
 * @param {string} index The name of the index being converted to/from read-only.
 * @param {boolean} [readOnly=true] If true, index becomes readonly, if false, index becomes writeable.
 * @returns {Promise}
 */
export function setReadonly(client, index, readOnly = true) {
  return client.indices.putSettings({
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
 * @param {ElasticsearchJs} client - The Elasticsearch client.
 * @param {string} alias - The name of the alias
 * @param {string} index - The index to which the alias will point
 */
export async function setAlias(client, alias, index) {
  const currentAlias = await client.indices.getAlias({ name: alias });
  const currentIndices = Object.keys(currentAlias);
  const actions = currentIndices.map(k => ({
    remove: { index: k, alias }
  }));
  // We can't remove a read-only index from the alias, so we need to ensure they are writable
  await Promise.all(currentIndices.map(index => setReadonly(client, index, false)));
  client.indices.updateAliases({
    body: {
      actions: [...actions, { add: { index, alias } }],
    },
  });
}

/**
 * Given the migration context, determines which migrations have not yet been run.
 * @param {MigrationContext} context
 */
export async function fetchUnappliedMigrations({ client, plugins, index }) {
  const state = await fetchMigrationState(client, index)
    .then(s => validatePluginState(plugins, s));

  return unappliedMigrations(plugins, state);
}

/**
 * Scrolls through all docs in the specified index, calling eachFn with the scroll results.
 *
 * @param {ElasticsearchJs} client The Elasticsearch client.
 * @param {string} index The name of the index
 * @param {function} eachFn A function that takes the results of a scroll operation and does something effectful
 * @param {number} [size=100] The number of documents to process at a time
 */
export async function eachScroll(client, index, eachFn, size = 100) {
  const scroll = '1m';
  let result = await client.search({ index, scroll, body: { size } });

  while (result.hits.hits.length) {
    await eachFn(result);
    result = await client.scroll({ scrollId: result._scroll_id, scroll });
  }
}

/**
 * Reindexes the specified source index to the specified dest index.
 *
 * @param {ElasticsearchJs} client The Elasticsearch client.
 * @param {string} sourceIndex The name of the index being reindexed
 * @param {string} destIndex The name of the destination index.
 * @returns {Promise}
 */
function reindex(client, sourceIndex, destIndex) {
  return client.reindex({
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
 * @param {ElasticsearchJs} client The Elasticsearch client
 * @param {string} index The name of the index whose settings are being fetched.
 * @returns {Promise} The a promise that resolves to the index's settings
 */
async function getIndexSettings(client, index) {
  const result = await client.indices.getSettings({ index });
  // Result has an unpredictable shape: {index-name: {settings: ...}}
  // Where index name might be: 'kibana-213423423' so, we just grab the settings
  // from the first value.
  return Object.values(result)[0].settings;
}

/**
 * Fetches the mappings for the specified index.
 *
 * @param {ElasticsearchJs} client The Elasticsearch client
 * @param {string} index The name of the index whose mappings are being fetched.
 * @returns {Promise} The a promise that resolves to the index's mappings
 */
async function getIndexMappings(client, index) {
  const result = await client.indices.getMapping({ index });
  // Result has an unpredictable shape: {index-name: {settings: ...}}
  // Where index name might be: 'kibana-213423423' so, we just grab the mappings
  // from the first value.
  return Object.values(result)[0].mappings;
}

async function fetchOrDefault(promise, defaultValue) {
  try {
    const result = await promise;
    return result;
  } catch (err) {
    if (err.statusCode === 404) {
      return defaultValue();
    }
    throw err;
  }
}
