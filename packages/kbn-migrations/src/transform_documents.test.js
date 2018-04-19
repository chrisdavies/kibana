const _ = require('lodash');
const { transformDocuments } = require('./transform_documents');
const { MigrationState } = require('./lib');
const { mockCluster } = require('./test');

describe('transformDocuments', () => {
  const index = 'kibana';
  const log = _.noop;
  const elasticVersion = '9.8.7';

  test('rejects docs with plugins we know nothing about', async () => {
    const { data, meta } = clusterData(index, {
      plugins: [{
        id: 'jam',
        mappings: JSON.stringify({ space: { type: 'text' } }),
        mappingsChecksum: '2',
        migrationsChecksum: 'ahoy',
      }],
    });
    const callCluster = mockCluster(data, meta);
    const exportedState = {
      plugins: [{
        id: 'whatisit',
        mappings: JSON.stringify({ dunnoes: { type: 'text' } }),
        migrationIds: ['dang'],
        mappingsChecksum: 'w1',
        migrationsChecksum: 'w2',
      }],
    };
    const plugins = [{
      id: 'jam',
      migrations: [],
    }];
    const doc = {
      _id: 'dunnoes:hrm',
      _source: { type: 'dunnoes', dunnoes: 'This should get rejected, methinks.' },
    };
    expect(transformDocuments({ callCluster, exportedState, plugins, elasticVersion, log, index, docs: [doc] }))
      .rejects.toThrow(/unavailable plugin \"whatisit\"/);
  });

  test('importing a doc w/ no exported migration state runs all transforms', async () => {
    const exportedState = {};
    const { data, meta } = clusterData(index, {
      plugins: [{
        id: 'jam',
        mappings: JSON.stringify({ space: { type: 'text' } }),
        migrationIds: ['a', 'b'],
        mappingsChecksum: '2',
        migrationsChecksum: 'ahoy',
      }],
    });
    const callCluster = mockCluster(data, meta);
    const plugins = [{
      id: 'jam',
      migrations: [{
        id: 'a',
        filter: () => true,
        transform: (doc) => ({ ...doc, attributes: `space ${doc.attributes}` }),
      }, {
        id: 'b',
        filter: () => true,
        transform: (doc) => ({ ...doc, attributes: `${doc.attributes.toUpperCase()}!!!` }),
      }],
    }];
    const docs = [{
      _id: 'space:enterprise',
      _source: { type: 'space', updated_at: 'today', space: 'The final frontier' },
    }];
    const transformed = await transformDocuments({ callCluster, exportedState, plugins, elasticVersion, log, index, docs });

    expect(transformed)
      .toEqual([{
        _id: 'space:enterprise',
        _source: { type: 'space', updated_at: 'today', space: 'SPACE THE FINAL FRONTIER!!!' },
      }]);
  });

  test('Transforms old docs', async () => {
    const { data, meta } = clusterData(index, {
      plugins: [{
        id: 'jam',
        mappings: JSON.stringify({ space: { type: 'text' } }),
        mappingsChecksum: '2',
        migrationsChecksum: 'ahoy',
      }, {
        id: 'maican',
        mappings: JSON.stringify({ book: { type: 'text' } }),
        mappingsChecksum: '3',
        migrationsChecksum: '4',
      }],
    });
    const callCluster = mockCluster(data, meta);
    const exportedState = {
      plugins: [{
        id: 'jam',
        mappings: JSON.stringify({ space: { type: 'text' } }),
        migrationIds: ['a'],
        mappingsChecksum: '1',
        migrationsChecksum: 'ahoy',
      }, {
        id: 'maican',
        mappings: JSON.stringify({ book: { type: 'text' } }),
        migrationIds: ['m1'],
        mappingsChecksum: '3',
        migrationsChecksum: '4',
      }],
    };
    const plugins = [{
      id: 'jam',
      migrations: [{
        id: 'a',
        filter: ({ type }) => type === 'space',
        transform: () => { throw new Error('Should not run!'); },
      }, {
        id: 'b',
        filter: ({ type }) => type === 'space',
        transform: (doc) => ({ ...doc, attributes: `${doc.attributes.toUpperCase()}!!!` }),
      }],
    }, {
      id: 'maican',
      migrations: [{
        id: 'm1',
        filter: ({ type }) => type === 'book',
        transform: () => { throw new Error('Should not run!'); },
      }, {
        id: 'm2',
        filter: ({ type }) => type === 'book',
        transform: (doc) => ({ ...doc, attributes: `Title: ${doc.attributes}` }),
      }],
    }];
    const docs = [{
      _id: 'space:enterprise',
      _source: { type: 'space', updated_at: 'today', space: 'The final frontier' },
    }, {
      _id: 'book:thetwotowers',
      _source: { type: 'book', updated_at: 'today', book: 'The Two Towers' },
    }];
    const transformed = await transformDocuments({ callCluster, exportedState, plugins, elasticVersion, log, index, docs });

    expect(transformed)
      .toEqual([{
        _id: 'space:enterprise',
        _source: { type: 'space', updated_at: 'today', space: 'THE FINAL FRONTIER!!!' },
      }, {
        _id: 'book:thetwotowers',
        _source: { type: 'book', updated_at: 'today', book: 'Title: The Two Towers' },
      }]);
  });

  test('accepts if a disabled plugin is required, but doc is up to date', async () => {
    const { data, meta } = clusterData(index, {
      plugins: [{
        id: 'jam',
        mappings: JSON.stringify({ aha: { type: 'text' } }),
        mappingsChecksum: 'aha',
        migrationsChecksum: 'ahoy',
      }],
    });
    const callCluster = mockCluster(data, meta);
    const exportedState = {
      plugins: [{
        id: 'jam',
        mappings: JSON.stringify({ aha: { type: 'text' } }),
        mappingsChecksum: 'aha',
        migrationsChecksum: 'ahoy',
      }],
    };
    const plugins = [];
    const docs = [{
      _id: 'aha:123',
      _source: { type: 'aha', aha: 'Move along' },
    }];
    const transformed = await transformDocuments({ callCluster, docs, exportedState, plugins, index, log, elasticVersion });
    expect(transformed)
      .toEqual([{
        _id: 'aha:123',
        _source: { type: 'aha', aha: 'Move along' },
      }]);
  });

  test('throws if migration requires a disabled plugin', () => {
    const { data, meta } = clusterData(index, {
      plugins: [{
        id: 'jam',
        mappings: JSON.stringify({ space: { type: 'text' } }),
        mappingsChecksum: 'aha',
        migrationsChecksum: 'ahoy',
      }],
    });
    const callCluster = mockCluster(data, meta);
    const exportedState = {};
    const plugins = [];
    const docs = [{
      _id: 'space:enterprise',
      _source: { type: 'space', space: 'The final frontier' },
    }];
    expect(transformDocuments({ docs, exportedState, plugins, callCluster, elasticVersion, index, log }))
      .rejects.toThrow(/requires unavailable plugin \"jam\"/);
  });

  test('index is required', () => {
    expect(testImportOpts({ index: undefined }))
      .rejects.toThrow(/Got undefined/);
  });

  test('docs are required', () => {
    expect(testImportOpts({ docs: undefined }))
      .rejects.toThrow(/Got undefined/);
  });

  test('docs should be an array', () => {
    expect(testImportOpts({ docs: 'hrm' }))
      .rejects.toThrow(/Got string/);
  });

  test('exportedState is required', () => {
    expect(testImportOpts({ exportedState: undefined }))
      .rejects.toThrow(/Got undefined/);
  });

  test('exportedState should be an object', () => {
    expect(testImportOpts({ exportedState: 'hrm' }))
      .rejects.toThrow(/Got string/);
  });

  test('callCluster is required', () => {
    expect(testImportOpts({ callCluster: undefined }))
      .rejects.toThrow(/Got undefined/);
  });

  test('log is required', () => {
    expect(testImportOpts({ log: undefined }))
      .rejects.toThrow(/Got undefined/);
  });

  test('log must be a function', () => {
    expect(testImportOpts({ log: 'hello' }))
      .rejects.toThrow(/Got string/);
  });

  test('plugins are required', () => {
    expect(testImportOpts({ plugins: undefined }))
      .rejects.toThrow(/Got undefined/);
  });

  test('callCluster must be an object', () => {
    expect(testImportOpts({ callCluster: 'hello' }))
      .rejects.toThrow(/Got string/);
  });

  test('index must be a string', () => {
    expect(testImportOpts({ index: 23 }))
      .rejects.toThrow(/Got number/);
  });

  test('plugins must be an array', () => {
    expect(testImportOpts({ plugins: 'notright' }))
      .rejects.toThrow(/Got string/);
  });
});

function testImportOpts(opts) {
  return transformDocuments({
    callCluster: _.noop,
    log: _.noop,
    index: 'kibana',
    docs: [],
    exportedState: {},
    plugins: [],
    ...opts,
  });
}

function clusterData(index, migrationState) {
  const data = {
    [index]: {
      [MigrationState.ID]: {
        _source: {
          migration: migrationState,
        },
      },
    },
  };
  const meta = {
    mappings: {
      [index]: {
        doc: {
          properties: _.reduce(
            migrationState.plugins,
            (acc, { mappings }) => Object.assign(acc, JSON.parse(mappings)),
            _.cloneDeep(MigrationState.mappings),
          ),
        },
      },
    },
  };
  return { data, meta };
}
