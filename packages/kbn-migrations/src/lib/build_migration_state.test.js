import { buildMigrationState } from './build_migration_state';
import { checksumMigrations } from './checksum';

describe('buildMigrationState', () => {
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

    expect(buildMigrationState(plugins))
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
