import {
  checksum,
  checksumMigrations,
  unappliedMigrations,
  migrationPipeline,
  seededDocs,
  migrationState
} from './migration_helpers';

describe('checksum', () => {
  test('Is reproducible', () => {
    expect(checksum(['a', 'q', 'b'])).toEqual(checksum(['a', 'q', 'b']));
    expect(checksum(['a', 'q', 'b'])).not.toEqual(checksum(['c', 'q', 'b']));
  });
});

describe('checksumMigrations', () => {
  test('Computes the checksum based on migration ids', () => {
    const plugins = [{
      migrations: [{ id: 'a' }, { id: 'q' }],
    }, {
      migrations: [{ id: 'b' }],
    }];
    expect(checksum(['a', 'q', 'b'])).toEqual(checksumMigrations(plugins));
  });
});

describe('unappliedMigrations', () => {
  test('returns only those migrations which have not been run', () => {
    const plugins = [
      { id: 'x-pack', migrations: [{ id: 'foo' }, { id: 'bar' }, { id: 'baz' }] },
      { id: 'mana', migrations: [{ id: 'mushboom' }, { id: 'rabbite' }] }
    ];
    const state = {
      plugins: [{ id: 'x-pack', appliedMigrations: ['foo', 'bar'] }],
    };
    expect(unappliedMigrations(plugins, state))
      .toEqual([{
        id: 'baz',
        pluginId: 'x-pack',
      }, {
        id: 'mushboom',
        pluginId: 'mana',
      }, {
        id: 'rabbite',
        pluginId: 'mana',
      }]);
  });
});

describe('migrationPipeline', () => {
  test('filters what migrations should be applied', () => {
    const migrations = [{
      id: 'a',
      filter: ({ count }) => count === 1,
      transform: (doc) => ({ ...doc, name: 'ahoy!' }),
    }, {
      id: 'b',
      filter: ({ name }) => name === 'ahoy!',
      transform: (doc) => ({ ...doc, name: 'shazm' }),
    }, {
      id: 'c',
      filter: ({ count }) => !!count,
      transform: (doc) => ({ ...doc, count: doc.count + 1 }),
    }];
    const fn = migrationPipeline(migrations);
    expect(fn({ count: 1 })).toEqual({ count: 2, name: 'shazm' });
    expect(fn({ name: 'ahoy!' })).toEqual({ name: 'shazm' });
    expect(fn({ hello: 'world' })).toEqual({ hello: 'world' });
  });

  test('ignores non-transform migrations', () => {
    const migrations = [{
      id: 'a',
      filter: ({ count }) => !!count,
      transform: (doc) => ({ ...doc, name: 'hello' }),
    }, {
      id: 'b',
      mapping: () => ({ shazm: { blazm: { type: 'text' } } }),
    }, {
      id: 'c',
      filter: ({ count }) => !!count,
      transform: (doc) => ({ ...doc, age: 98 }),
    }];
    const fn = migrationPipeline(migrations);
    expect(fn({ count: 1 })).toEqual({ count: 1, name: 'hello', age: 98 });
  });
});

describe('seededDocs', () => {
  test('runs seeds through subsequent transform functions', () => {
    const migrations = [{
      id: '1',
      filter: () => true,
      transform: () => ({ should: 'Not run' }),
    }, {
      id: '2',
      seed: () => ({ type: 'android', name: 'Sally' }),
    }, {
      id: 'a32',
      seed: () => ({ type: 'human', name: 'Buzz' }),
    }, {
      id: '3',
      filter: ({ type }) => type === 'human',
      transform: (doc) => ({ ...doc, hasEmotions: true }),
    }, {
      id: '4',
      filter: ({ type }) => type === 'android',
      transform: (doc) => ({ ...doc, isLogical: true }),
    }, {
      id: '5',
      seed: () => ({ type: 'human', name: 'Alice' }),
    }, {
      id: '6',
      filter: ({ type }) => type === 'human',
      transform: (doc) => ({ ...doc, isLogical: false }),
    }];

    expect(seededDocs(migrations))
      .toEqual([{
        type: 'android',
        name: 'Sally',
        isLogical: true,
      }, {
        type: 'human',
        name: 'Buzz',
        hasEmotions: true,
        isLogical: false,
      }, {
        type: 'human',
        name: 'Alice',
        isLogical: false,
      }]);
  });
});

describe('migrationState', () => {
  test('generates state based on plugins', () => {
    const plugins = [{
      id: 'a', migrations: [{
        id: '1',
        seed: () => ({}),
      }, {
        id: '2',
        seed: () => ({}),
      }]
    }, {
      id: 'b', migrations: [{
        id: 'z',
        seed: () => ({}),
      }, {
        id: 'q',
        seed: () => ({}),
      }]
    }];

    expect(migrationState(plugins))
      .toEqual({
        checksum: checksumMigrations(plugins),
        plugins: [{
          id: 'a', appliedMigrations: ['1', '2'],
        }, {
          id: 'b', appliedMigrations: ['z', 'q'],
        }],
      });
  });
});
