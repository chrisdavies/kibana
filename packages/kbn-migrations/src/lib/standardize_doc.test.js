import { rawToStandard, standardToRaw } from './standardize_doc';

describe('rawToStandard', () => {
  test('converts standard document from raw to storedObjectClient format', () => {
    const rawDoc = {
      _id: 'hello:world',
      _type: 'doc',
      _source: {
        type: 'hello',
        updated_at: new Date().toISOString(),
        hello: {
          name: 'Starbuck',
          age: 39,
        },
      },
    };
    expect(rawToStandard(rawDoc))
      .toEqual({
        id: 'world',
        type: 'hello',
        updated_at: rawDoc._source.updated_at,
        attributes: rawDoc._source.hello,
      });
  });

  test('passes standard docs through unchanged', () => {
    const standardDoc = {
      id: 'world',
      type: 'hello',
      updated_at: new Date().toISOString(),
      attributes: {
        quote: 'Were Niagara but a cataract of sand, would you travel your thousand miles to see it ?',
      },
    };
    expect(rawToStandard(standardDoc))
      .toEqual({
        id: 'world',
        type: 'hello',
        updated_at: standardDoc.updated_at,
        attributes: {
          quote: 'Were Niagara but a cataract of sand, would you travel your thousand miles to see it ?',
        },
      });
  });

  test(`does not convert docs which don't have a standard id`, () => {
    const rawDoc = {
      _id: 'hello',
      _type: 'doc',
      _source: {
        type: 'hello',
        updated_at: new Date().toISOString(),
        hello: {
          name: 'Starbuck',
          age: 39,
        },
      },
    };
    expect(rawToStandard(rawDoc))
      .toEqual({
        _id: 'hello',
        _type: 'doc',
        _source: {
          type: 'hello',
          updated_at: rawDoc._source.updated_at,
          hello: {
            name: 'Starbuck',
            age: 39,
          },
        },
      });
  });

  test(`does not convert docs which don't have a type`, () => {
    const rawDoc = {
      _id: 'hello:world',
      _type: 'doc',
      _source: {
        updated_at: new Date().toISOString(),
        hello: {
          name: 'Starbuck',
          age: 39,
        },
      },
    };
    expect(rawToStandard(rawDoc))
      .toEqual({
        _id: 'hello:world',
        _type: 'doc',
        _source: {
          updated_at: rawDoc._source.updated_at,
          hello: {
            name: 'Starbuck',
            age: 39,
          },
        },
      });
  });

  test(`does not convert docs which don't have a [type] in attributes`, () => {
    const rawDoc = {
      _id: 'hello:world',
      _type: 'doc',
      _source: {
        type: 'hello',
        updated_at: new Date().toISOString(),
        world: {
          name: 'Starbuck',
          age: 39,
        },
      },
    };
    expect(rawToStandard(rawDoc))
      .toEqual({
        _id: 'hello:world',
        _type: 'doc',
        _source: {
          type: 'hello',
          updated_at: new Date().toISOString(),
          world: {
            name: 'Starbuck',
            age: 39,
          },
        },
      });
  });

  test('throws an error if the doc is neither raw nor standard', () => {
    const invalidDoc = { wont: 'werk' };
    assertThrows(() => rawToStandard(invalidDoc), 'Invalid document', invalidDoc);
  });
});

describe('standardToRaw', () => {
  test('converts a standard document into a raw Elastic format', () => {
    const standardDoc = {
      id: 'world',
      type: 'hello',
      updated_at: new Date().toISOString(),
      attributes: { harpoon: 'the whale' },
    };
    expect(standardToRaw(standardDoc))
      .toEqual({
        _id: 'hello:world',
        _type: 'doc',
        _source: {
          type: 'hello',
          updated_at: standardDoc.updated_at,
          hello: { harpoon: 'the whale' },
        },
      });
  });

  test('passes raw documents through unchanged', () => {
    const rawDoc = {
      _id: 'bingo',
      _source: {
        count: 32,
      },
    };
    expect(standardToRaw(rawDoc))
      .toEqual({
        _id: 'bingo',
        _source: {
          count: 32,
        },
      });
  });

  test('throws an error if the doc is neither raw nor standard', () => {
    const invalidDoc = { stuff: 'here' };
    assertThrows(() => standardToRaw(invalidDoc), 'Invalid document', invalidDoc);
  });
});

function assertThrows(fn, expectedMessage, expectedDoc) {
  try {
    fn();
    throw new Error('standardToRaw did not throw as expected.');
  } catch ({ message, doc }) {
    expect(message).toContain(message);
    expect(doc).toEqual(expectedDoc);
  }
}
