import { migrationContext } from './migration_context';

describe('migrationContext', () => {
  function buildOpts(opts) {
    return {
      plugins: opts.plugins || [],
      log() { },
      callCluster(path) {
        expect(path).toEqual('get');
        return Promise.resolve(opts.savedState);
      },
      ...opts,
    };
  }

  test('ensures that migrations are not undefined', async () => {
    const plugins = [
      { id: 'a', migrations: [{ id: 'shazm' }] },
      { id: 'b' },
    ];
    const actual = await migrationContext(buildOpts({ plugins }));
    expect(actual.plugins.length).toEqual(1);
    expect(actual.plugins[0].migrations).toEqual([{ id: 'shazm' }]);
  });

  test('creates destIndex name', async () => {
    const actual = await migrationContext(buildOpts({ index: 'dang' }));
    const year = new Date().getFullYear().toString();
    const regexp = new RegExp(`^dang-${year}`);
    expect(actual.destIndex)
      .toEqual(expect.stringMatching(regexp));
  });

  test('creates a logger that logs info', async () => {
    const logs = [];
    const actual = await migrationContext(buildOpts({ log: (...args) => logs.push(args) }));
    actual.log.info('Wat up?');
    actual.log.info('Logging, sucka!');
    expect(logs)
      .toEqual([
        [['info', 'migration'], 'Wat up?'],
        [['info', 'migration'], 'Logging, sucka!'],
      ]);
  });

  test('creates a logger that logs debug', async () => {
    const logs = [];
    const actual = await migrationContext(buildOpts({ log: (...args) => logs.push(args) }));
    actual.log.debug('I need coffee');
    actual.log.debug('Lots o coffee');
    expect(logs)
      .toEqual([
        [['debug', 'migration'], 'I need coffee'],
        [['debug', 'migration'], 'Lots o coffee'],
      ]);
  });

  test('passes unknown values through', async () => {
    const actual = await migrationContext(buildOpts({ caffeine: 'yes, please!' }));
    expect(actual.caffeine).toEqual('yes, please!');
  });

  test('accurately computes applied and unapplied migrations', async () => {
    const rawPlugins = [
      { id: 'x-pack', migrations: [{ id: 'foo' }, { id: 'bar' }, { id: 'baz' }] },
      { id: 'baz' },
      { id: 'mana', migrations: [{ id: 'mushboom' }, { id: 'rabbite' }] }
    ];
    const savedState = {
      _source: {
        migration: {
          plugins: [
            { id: 'x-pack', appliedMigrations: ['foo'] },
            { id: 'mana', appliedMigrations: ['mushboom'] },
          ],
        },
      },
    };
    const { plugins, unappliedMigrations } = await migrationContext(buildOpts({ plugins: rawPlugins, savedState }));

    expect(plugins.length).toEqual(2);

    expect(plugins[0].appliedMigrationIds).toEqual(['foo']);
    expect(plugins[0].unappliedMigrations.map(m => m.id)).toEqual(['bar', 'baz']);

    expect(plugins[1].appliedMigrationIds).toEqual(['mushboom']);
    expect(plugins[1].unappliedMigrations.map(m => m.id)).toEqual(['rabbite']);

    expect(unappliedMigrations)
      .toEqual([
        { pluginId: 'x-pack', id: 'bar' },
        { pluginId: 'x-pack', id: 'baz' },
        { pluginId: 'mana', id: 'rabbite' },
      ]);
  });

  test('errors if migration order has changed', () => {
    const plugins = [
      { id: 'x-pack', migrations: [{ id: 'foo' }, { id: 'bar' }, { id: 'baz' }] },
    ];
    const savedState = {
      _source: {
        migration: {
          plugins: [{ id: 'x-pack', appliedMigrations: ['foo', 'baz', 'bar'] }],
        },
      },
    };
    return expect(migrationContext(buildOpts({ plugins, savedState })))
      .rejects.toThrowError(/Expected migration "baz", but found "bar"/);
  });

  test('errors if migrations are defined more than once', () => {
    const plugins = [{
      id: 'x-pack',
      migrations: [{ id: 'foo' }, { id: 'bar' }, { id: 'foo' }],
    }];
    expect(migrationContext(buildOpts({ plugins })))
      .rejects.toThrowError(/has migration "foo" defined more than once/);
  });
});
