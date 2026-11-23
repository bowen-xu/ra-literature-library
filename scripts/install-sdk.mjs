import {cp, mkdir, rm, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = process.argv.slice(2).filter(value => value !== '--')[0];
if (!source) throw new Error('Usage: pnpm sdk:install -- <Workbench SDK artifact directory>');
const sourceRoot = path.resolve(source), destination = path.join(root, '.dependencies/sdk/web');
const packages = ['core', 'data', 'writing', 'workbench-sdk'];
await mkdir(destination, {recursive: true});
for (const name of packages) {
  const from = path.join(sourceRoot, name), to = path.join(destination, name);
  await rm(to, {recursive: true, force: true}); await cp(from, to, {recursive: true});
}
await writeFile(path.join(destination, 'README.md'), Buffer.from('Generated from a Workbench SDK artifact. Do not edit; rerun `pnpm sdk:install`.\n'));
console.log(`Installed ${packages.length} Workbench SDK packages into ${path.relative(root, destination)}`);
