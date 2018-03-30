// Functions that convert raw Elastic documents to/from the storedObjectClient format
import { DOC_TYPE } from './consts';

/**
 * Takes a raw document from Elasticsearch, and makes it conform to the storedObjectClient
 * shape: { _index, _type, _id, _source } -> { id, type, updated_at, version, attributes }
 * @param {object} doc
 */
export function rawToStandard(doc) {
  if (isStandardized(doc)) {
    return doc;
  }

  if (canStandardize(doc)) {
    return convertToStandard(doc);
  }

  if (isRaw(doc)) {
    return doc;
  }

  assertDocInvalid(doc);
}

/**
 * Takes a standardized document and converts it to a raw Elasticsearch doc
 * shape: { id, type, updated_at, version, attributes } -> { _index, _type, _id, _source }
 * @param {object} doc
 */
export function standardToRaw(doc) {
  if (isStandardized(doc)) {
    return convertFromStandard(doc);
  }

  if (isRaw(doc)) {
    return doc;
  }

  assertDocInvalid(doc);
}

function assertDocInvalid(doc) {
  throw {
    doc,
    message: 'Invalid document. Documents should either be raw or standardized.',
  };
}

function isRaw({ _source }) {
  return !!_source;
}

function isStandardized({ type, attributes }) {
  return !!type && !!attributes;
}

function canStandardize(doc) {
  return doc._source &&
    doc._id &&
    doc._source.type &&
    doc._source[doc._source.type] &&
    doc._id.startsWith(doc._source.type + ':');
}

function convertToStandard(doc) {
  // eslint-disable-next-line camelcase
  const { _id, _source: { type, updated_at } } = doc;

  return {
    id: _id.slice(type.length + 1),
    type: type,
    updated_at,
    attributes: doc._source[type],
  };
}

// eslint-disable-next-line camelcase
function convertFromStandard({ type, id, updated_at, attributes }) {
  return {
    _id: `${type}:${id}`,
    _type: DOC_TYPE,
    _source: {
      type,
      updated_at,
      [type]: attributes,
    },
  };
}
