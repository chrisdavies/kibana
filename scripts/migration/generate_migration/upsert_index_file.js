// Generates the index.{js|ts} file for a migration
import fs from 'fs';
import path from 'path';
import { promisify } from 'util';
import { dropExtension, writeFile } from './file_helpers';

export async function upsertIndexFile(dir, id) {
  const { fileExists, filePath } = await findIndexFile(dir, id);
  if (fileExists) {
    await updateIndexFile(filePath, id);
  } else {
    await createIndexFile(filePath, id);
  }
  return filePath;
}

async function findIndexFile(dir) {
  const files = await promisify(fs.readdir)(dir);
  const existingFile = files.find((f) => dropExtension(path.basename(f)) === 'index');
  return {
    filePath: path.join(dir, existingFile || 'index.js'),
    fileExists: !!existingFile,
  };
}

// For existing index files, we'll insert a breaking line of code at the
// end so that the user doesn't forget to import their migration and put
// it in the right spot...
async function updateIndexFile(filePath, id) {
  const originalContent = await promisify(fs.readFile)(filePath);
  const updatedContent = `${originalContent}
    TODO... put this in the right place
    ${generateRequireStatement(id)}`;
  await writeFile(filePath, updatedContent);
}

async function createIndexFile(filePath, id) {
  await writeFile(filePath, indexTemplate(id));
}

function generateRequireStatement(id) {
  return `require('${'./' + id}'),`;
}

function indexTemplate(id) {
  return `
// Ordered list of migrations this plugin exports
export const migrations = [
  ${generateRequireStatement(id)}
];
`;
}
