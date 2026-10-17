import { cp, mkdir, readFile, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });
await cp(path.join(root, 'index.html'), path.join(dist, 'index.html'));
await cp(path.join(root, 'src'), path.join(dist, 'src'), { recursive: true });
await cp(path.join(root, 'public', 'assets'), path.join(dist, 'assets'), { recursive: true });

// Progression collectibles are release invariants: build must fail if a stage is short.
const gameSource = await readFile(path.join(root, 'src', 'main.js'), 'utf8');
function countLiteralSpots(arrayName) {
  const match = gameSource.match(new RegExp(`const ${arrayName} = \\[([\\s\\S]*?)\\];`));
  if (!match) throw new Error(`Could not find the ${arrayName} collectible list.`);
  return [...match[1].matchAll(/\[[^\[\]]+\]/g)].length;
}
const requirements = {
  MEADOW_MINT_REQUIREMENT: { count: countLiteralSpots('pearlSpots'), expected: 25 },
  WATER_MINT_REQUIREMENT: { count: countLiteralSpots('seaMintSpots'), expected: 25 },
};
for (const [name, result] of Object.entries(requirements)) {
  const declaration = gameSource.match(new RegExp(`const ${name} = (\\d+);`));
  if (!declaration || Number(declaration[1]) !== result.expected || result.count !== result.expected) {
    throw new Error(`${name} must have exactly ${result.expected} matching collectibles; got ${result.count}.`);
  }
}
if (!/const BRIDGE_MINT_REQUIREMENT = 30;/.test(gameSource) ||
    !/bridgeMintSpots\.length !== BRIDGE_MINT_REQUIREMENT/.test(gameSource) ||
    !/bridgeMints\.length !== BRIDGE_MINT_REQUIREMENT/.test(gameSource) ||
    !/state\.bridgeMintsCollected >= BRIDGE_MINT_REQUIREMENT/.test(gameSource)) {
  throw new Error('Bridge World must assert and require all 30 generated bridge mints.');
}
for (const runtimeGuard of [
  /pearls\.length !== MEADOW_MINT_REQUIREMENT/,
  /waterMints\.length !== WATER_MINT_REQUIREMENT/,
  /bridgePowerups\.length !== bridgePlatforms\.length \+ 1/,
]) {
  if (!runtimeGuard.test(gameSource)) throw new Error(`Missing generated-object invariant: ${runtimeGuard}`);
}

for (const relative of [
  'index.html', 'src/main.js', 'src/style.css',
  'assets/cream-soda-umisea-reference.png',
  'assets/reference-character.png', 'assets/references.png', 'assets/reference-plushies.png',
  'assets/fabric-mint.png', 'assets/fabric-mint-bump.png',
  'assets/fabric-ivory.png', 'assets/fabric-ivory-bump.png',
  'assets/fabric-cherry.png', 'assets/fabric-cherry-bump.png',
  'assets/platform-mint.png', 'assets/platform-mint-bump.png',
  'assets/meadow-grass.png', 'assets/meadow-grass-bump.png',
  'assets/bark-texture.png', 'assets/bark-bump.png',
  'assets/stone-texture.png', 'assets/stone-bump.png',
  'assets/moon-surface.png',
  'assets/wood-end-grain.png', 'assets/wood-end-bump.png',
]) {
  const item = await stat(path.join(dist, relative));
  if (!item.isFile() || item.size === 0) throw new Error(`Missing or empty build output: ${relative}`);
}
console.log('Progression verified: Meadow 25/25 Fizz, Water 25/25 Seafoam Mints, Bridge 30/30 Bridge Mints; runtime object counts are guarded.');
console.log('Build complete: dist/ contains the static GitHub Pages site.');
