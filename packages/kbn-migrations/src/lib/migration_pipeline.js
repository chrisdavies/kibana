import { rawToStandard } from './standardize_doc';

/**
 * Given a set of migrations, this creates a function which takes a document
 * and transforms it to a new / up-to-date shape.
 *
 * @param {Migration[]} migrations
 * @returns {(doc: object) => object}
 */
export function buildTransformFunction(migrations) {
  const transforms = migrations.filter(m => m.filter && m.transform);
  const transformDoc = (doc, { filter, transform }) => {
    return rawToStandard(filter(doc) ? transform(doc) : doc, doc);
  };
  return (doc) => transforms.reduce(transformDoc, rawToStandard(doc));
}

/**
 * Given a set of migrations, this runs all seeds through the
 * subsequent transform functions and returns the resulting docs.
 * This assumes that seeds will be relatively rare, so we can fit
 * them all into memory.
 *
 * @param {Migration[]} migrations
 * @returns {object[]} An array of objects, presumably to be bulk-inserted
 */
export function seededDocs(migrations) {
  return migrations.map((m, i) => ({ m, i }))
    .filter(({ m }) => !!m.seed)
    .map(({ m, i }) => {
      const transform = buildTransformFunction(migrations.slice(i));
      return transform(m.seed());
    });
}
