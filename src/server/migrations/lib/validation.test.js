import { validatePluginState } from './validation';

describe('validatePluginState', () => {
  test('errors if migration order has changed', () => {
    const plugins = [{
      id: 'x-pack',
      migrations: [{ id: 'foo' }, { id: 'bar' }],
    }];
    const state = {
      plugins: [{ id: 'x-pack', appliedMigrations: ['foo', 'baz', 'bar'] }],
    };
    expect(() => validatePluginState(plugins, state))
      .toThrowError(/Expected migration "baz", but found "bar"/);
  });

  test('errors if migrations are defined more than once', () => {
    const plugins = [{
      id: 'x-pack',
      migrations: [{ id: 'foo' }, { id: 'bar' }, { id: 'foo' }],
    }];
    const state = {
      plugins: [],
    };
    expect(() => validatePluginState(plugins, state))
      .toThrowError(/has migration "foo" defined more than once/);
  });

  test('returns the state that it was passed', () => {
    const plugins = [
      { id: 'x-pack', migrations: [{ id: 'foo' }, { id: 'bar' }, { id: 'baz' }] },
      { id: 'mana', migrations: [{ id: 'mushboom' }, { id: 'rabbite' }] }
    ];
    const state = {
      plugins: [{ id: 'x-pack', appliedMigrations: ['foo', 'bar'] }],
    };
    expect(validatePluginState(plugins, state)).toEqual(state);
  });
});
