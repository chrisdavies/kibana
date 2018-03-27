// This file contains the logic that generates migrations for a plugin
// or core Kibana. It is the driver behind various yarn commands:
//
// yarn migration:add-transform {pluginPath} {filename}
// yarn migration:add-seed {pluginPath} {filename}
// yarn migration:add-mapping {pluginPath} {filename}
//
// example:
// yarn migration:add-seed ./src/core_plugins/kibana initial-settings

import path from 'path';
import { writeFile, ensureDir, dropExtension } from './file_helpers';
import { upsertIndexFile } from './upsert_index_file';
import moment from 'moment';

// argv is something like ['node', 'scripts/add-seed.js', '../path/to/plugin', 'migration-file-name']
const PLUGIN_PATH_INDEX = 2;
const FILE_NAME_INDEX = 3;

/**
 * Generates a migration file given a combination of commandline args and
 * function arguments.
 * @param {'seed' | 'transform' | 'mapping'} type
 * @param {(id: string) => string} templateFn
 */
export async function generateMigration(type, templateFn) {
  const fileName = process.argv[FILE_NAME_INDEX];
  const pluginPath = process.argv[PLUGIN_PATH_INDEX];
  const dir = migrationFolder(pluginPath);
  const id = migrationId(type, fileName);
  const migrationFilePath = path.join(dir, migrationFileName(id, fileName));

  console.log(`Generating: "${migrationFilePath}"...`);

  await ensureDir(dir);
  await writeFile(migrationFilePath, templateFn(id));
  const indexPath = await upsertIndexFile(dir, id);

  console.log(`Generated: "${migrationFilePath}"`);
  console.log(`Updated: ${indexPath}`);
}

function migrationId(type, fileName) {
  return `${moment().format('YYYYMMDDHHmmss')}_${type}_${dropExtension(fileName)}`
    .replace('\'', '\\\'');
}

function migrationFolder(pluginPath) {
  return path.resolve(path.join(pluginPath, 'migrations'));
}

function migrationFileName(id, fileName) {
  return id + (path.extname(fileName) || '.js');
}
