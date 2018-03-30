import { buildTransformFunction, seededDocs } from './migration_pipeline';

describe('buildTransformFunction', () => {
  test('transforms standardizable raw documents', () => {
    const doc = {
      _id: 'foo:bar',
      _source: {
        type: 'foo',
        foo: {
          name: 'jimbo',
        },
      },
    };

    const migrations = [{
      filter: ({ type }) => type === 'foo',
      transform: (doc) => ({
        ...doc,
        attributes: {
          name: doc.attributes.name.toUpperCase(),
          meaning: 42,
        },
      }),
    }];
    const fn = buildTransformFunction(migrations);
    expect(fn(doc)).toEqual({
      id: 'bar',
      type: 'foo',
      attributes: {
        name: 'JIMBO',
        meaning: 42,
      },
    });
  });

  test('transforms standard documents', () => {
    const doc = {
      id: 'dont',
      type: 'panic',
      attributes: {
        thanks: 'for all the fish',
      },
    };

    const migrations = [{
      filter: ({ type }) => type === 'panic',
      transform: (doc) => ({
        ...doc,
        attributes: {
          ...doc.attributes,
          book: 'hitchhikersguidetothegalaxy',
        },
      }),
    }];
    const fn = buildTransformFunction(migrations);
    expect(fn(doc)).toEqual({
      id: 'dont',
      type: 'panic',
      attributes: {
        thanks: 'for all the fish',
        book: 'hitchhikersguidetothegalaxy',
      },
    });
  });

  test('allows raw documents', () => {
    const doc = {
      _id: '23423423',
      _source: {
        fib: '112358',
      },
    };
    const migrations = [{
      filter: ({ _source }) => !!_source.fib,
      transform: (doc) => ({
        ...doc,
        _id: 'fibonacci',
      }),
    }];
    const fn = buildTransformFunction(migrations);
    expect(fn(doc)).toEqual({
      _id: 'fibonacci',
      _source: { fib: '112358' },
    });
  });

  test('errors if given an invalid document format', () => {
    const doc = { dunnoes: 'nothin' };
    const migrations = [{
      filter: () => true,
      transform: () => ({
        _id: '23',
        _source: { this: 'is valid, but the original isnt' },
      }),
    }];
    const fn = buildTransformFunction(migrations);
    expect(() => fn(doc))
      .toThrow();
  });

  test('errors if yields an invalid document format', () => {
    const doc = {
      _id: '23423423',
      _source: {
        fib: '112358',
      },
    };
    const migrations = [{
      filter: () => true,
      transform: () => ({
        cant: 'touch this',
      }),
    }];
    const fn = buildTransformFunction(migrations);
    expect(() => fn(doc))
      .toThrow();
  });

  test('only applies when filter evaluates to true', () => {
    const docA = {
      id: 'dont',
      type: 'panic',
      attributes: {
        thanks: 'for all the fish',
      },
    };
    const docB = {
      id: 'dont',
      type: 'shniky',
      attributes: {
        thanks: 'for all the fish',
      },
    };
    const migrations = [{
      filter: ({ type }) => type === 'panic',
      transform: (doc) => ({
        ...doc,
        attributes: {
          ...doc.attributes,
          here: true,
        },
      }),
    }];
    const fn = buildTransformFunction(migrations);
    expect(fn(docA).attributes.here).toBeTruthy();
    expect(fn(docB)).toEqual(docB);
  });

  test('only applies transform migrations', () => {
    const doc = {
      id: 'dont',
      type: 'panic',
      attributes: {
        thanks: 'for all the fish',
      },
    };
    const migrations = [{
      filter: ({ type }) => type === 'panic',
      transform: (doc) => ({
        ...doc,
        attributes: {
          ...doc.attributes,
          here: true,
        },
      }),
    }, {
      seed: () => { throw new Error('DOH!'); }
    }, {
      filter: () => true,
      transform: (doc) => ({
        ...doc,
        attributes: {
          ...doc.attributes,
          hereToo: true,
        },
      }),
    }];
    const fn = buildTransformFunction(migrations);
    expect(fn(doc))
      .toEqual({
        id: 'dont',
        type: 'panic',
        attributes: {
          thanks: 'for all the fish',
          here: true,
          hereToo: true,
        },
      });
  });

  test('allows raw docs to be converted to standard', () => {
    const doc = {
      _id: '123',
      _source: {
        stuff: 'here',
      },
    };
    const migrations = [{
      filter: () => true,
      transform: ({ _id, _source }) => ({
        id: _id,
        type: 'stuffy',
        attributes: _source,
      }),
    }];
    const fn = buildTransformFunction(migrations);
    expect(fn(doc)).toEqual({
      id: '123',
      type: 'stuffy',
      attributes: { stuff: 'here' },
    });
  });

  test('allows standard docs to be converted to raw', () => {
    const doc = {
      id: 'plato',
      type: 'philosopher',
      attributes: {
        isCewl: true,
      },
    };
    const migrations = [{
      filter: () => true,
      transform: ({ attributes }) => ({
        _id: 'somenewid',
        _source: attributes,
      }),
    }];
    const fn = buildTransformFunction(migrations);
    expect(fn(doc)).toEqual({
      _id: 'somenewid',
      _source: { isCewl: true },
    });
  });
});

describe('seededDocs', () => {
  test('returns the seeds', () => {
    const migrations = [{
      seed: () => ({
        id: 'hey',
        type: 'you',
        attributes: {
          guys: 'check it out',
        },
      }),
    }, {
      seed: () => ({
        _id: 1112,
        _source: {
          goob: 'pea',
        },
      }),
    }];
    expect(seededDocs(migrations))
      .toEqual([{
        id: 'hey',
        type: 'you',
        attributes: {
          guys: 'check it out',
        },
      }, {
        _id: 1112,
        _source: {
          goob: 'pea',
        },
      }]);
  });

  test('runs seeds through subsequent transforms', () => {
    const migrations = [{
      filter: () => true,
      transform: () => { throw new Error('NOPE'); },
    }, {
      seed: () => ({
        id: 'hey',
        type: 'you',
        attributes: {
          guys: 'check it out',
        },
      }),
    }, {
      filter: () => true,
      transform: (doc) => ({
        ...doc,
        id: 'yoyo',
      }),
    }, {
      seed: () => ({
        _id: 1112,
        _source: {
          goob: 'pea',
        },
      }),
    }, {
      filter: ({ type }) => type === 'you',
      transform: (doc) => ({
        ...doc,
        attributes: {
          ...doc.attributes,
          lastTransform: true,
        },
      }),
    }, {
      filter: ({ _source }) => _source && _source.goob === 'pea',
      transform: (doc) => ({
        ...doc,
        _id: 'shazm',
      }),
    }];
    expect(seededDocs(migrations))
      .toEqual([{
        id: 'yoyo',
        type: 'you',
        attributes: {
          guys: 'check it out',
          lastTransform: true,
        },
      }, {
        _id: 'shazm',
        _source: {
          goob: 'pea',
        },
      }]);
  });
});
