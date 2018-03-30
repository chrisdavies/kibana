# `@kbn/migrations` - Functions for managing index migrations

Migrations are a controlled means of upgrading the data in an index to conform to the expectations of your codebase.

## Usage

This package exports a handful of functions, each of which expects a single `opts` parameter, documented below as a `MigrationOpts` TypeScript interface.

```ts
// Opts takes this shape:
interface MigrationOpts {
  // Used for logging info and debug logs
  log: (meta: string[], text: string) => void;

  // A proxy for the Elasticsearch client which is assumed to be
  // properly secured.
  callCluster: (command: string, args: object) => Promise<any>;

  // The name of the index / alias being migrated
  index: string;

  // The array of plugins whose migrations will be run
  plugins: MigrationPlugin[],

  // The index mapping definition, used to create new indices if
  // the index does not exist, and to update an existing index's
  // mappings. Mappings are allowed to introduce breaking changes,
  // as long as there are one or more transforms which bring
  // existing data into conformity with the mapping definition.
  mappings?: MappingDefinition;

  // Optional: The number of documents to process at a time while migrating,
  // defaults to 100.
  scrollSize?: number;
}

interface MigrationPlugin {
  // The id of the plugin that defined this migration
  id: string;

  // The full list of migrations to be applied to the index. This
  // should include *all* migrations for the index, including those
  // which may already have been applied to the index.
  migrations: Migration[];
}

type Migration = Seed | Transform;

interface MigrationFields {
  // The pluginId + migrationId should be a unique combo
  migrationId: string;
}

interface Seed extends MigrationFields {
  // The seed function returns a document which will be inserted
  // into the migrated index.
  seed: () => ElasticDocument;
}

interface Transform extends MigrationFields {
  // If filter returns true, this transform will be applied
  // to the specified document.
  filter: (doc: ElasticDocument) => boolean;

  // Transforms the specified document into a new shape. This
  // should return an ElasticDocument, but is allowe to return
  // a document of any shape. If it does not return an ElasticDocument,
  // the result will be passed into subsequent transforms as
  // doc.attributes.
  transform: (doc: ElasticDocument) => any;
}

// Two additional fields, version and updated_at will automatically be added
// when the document is persisted.
interface ElasticDocument {
  // Should be provided, but if not provided, will be generated
  id?: string;

  // The type of document, plugin-defined, (e.g. 'userSettings')
  type: string,

  // The value of the document, which should comply with your mappings definition
  attributes: any,
}

// Defines all mappings for your plugin, an example mapping definition might look like this:
//   properties: {
//     exampleType: {
//       properties: {
//         todo: { type: 'keyword' },
//         stuff: { type: 'integer' },
//       },
//     },
//     userSettings: {
//       properties: {
//         color: { type: 'keyword' },
//         numPages: { type: 'integer' },
//       },
//     },
//   },
interface MappingDefinition {
  // Somewhat complex... See the docs:
  // https://www.elastic.co/guide/en/elasticsearch/reference/current/mapping.html
}
```
