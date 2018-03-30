import { checksumMigrations } from './checksum';

describe('checksumMigrations', () => {
  test('is blank if no migrations or mappings exist', () => {
    const plugins = [{ migrations: [] }, { migrations: [] }];
    expect(checksumMigrations(plugins)).toEqual('');
  });

  test('is consistent when passed the same mappings', () => {
    const mappingA = { doc: { tynamic: 'strict' } };
    const mappingB = { doc: { tynamic: 'strict', properties: { } } };
    const plugins = [];

    expect(checksumMigrations(plugins, mappingA)).toBeTruthy();
    expect(checksumMigrations(plugins, mappingA)).not.toEqual(checksumMigrations(plugins, mappingB));
    expect(checksumMigrations(plugins, mappingA)).toEqual(checksumMigrations(plugins, mappingA));
    expect(checksumMigrations(plugins, mappingB)).toEqual(checksumMigrations(plugins, mappingB));
  });

  test('is consistent when passed the same migrations', () => {
    const pluginSetA = [{ migrations: [{ id: 'hello' }] }, { migrations: [{ id: 'world', stuff: 'here' }] }];
    const pluginSetB = [{ migrations: [{ id: 'hello' }] }, { migrations: [{ id: 'world', stuff: 'there' }] }];
    const pluginSetC = [{ migrations: [{ id: 'hello' }] }, { migrations: [{ id: 'worlds', stuff: 'here' }] }];

    expect(checksumMigrations(pluginSetA)).toBeTruthy();
    expect(checksumMigrations(pluginSetA)).toEqual(checksumMigrations(pluginSetB));
    expect(checksumMigrations(pluginSetA)).not.toEqual(checksumMigrations(pluginSetC));
  });

});
