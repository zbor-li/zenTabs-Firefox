import { copyFile, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const [, , target, outputDirectory] = process.argv;
if (!['firefox', 'chrome'].includes(target) || !outputDirectory) {
  throw new Error('Usage: node scripts/prepare-manifest.mjs <firefox|chrome> <output-directory>');
}

const source = resolve(`manifests/${target}.json`);
JSON.parse(await readFile(source, 'utf8'));
await copyFile(source, resolve(outputDirectory, 'manifest.json'));
