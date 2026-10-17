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

// Progression collectibles are release invariants: each world must have a 20% mint cushion.
const gameSource = await readFile(path.join(root, 'src', 'main.js'), 'utf8');
function countLiteralSpots(arrayName) {
  const match = gameSource.match(new RegExp(`const ${arrayName} = \\[([\\s\\S]*?)\\];`));
  if (!match) throw new Error(`Could not find the ${arrayName} collectible list.`);
  return [...match[1].matchAll(/\[[^\[\]]+\]/g)].length;
}
const requirements = {
  MEADOW_MINT_REQUIREMENT: { threshold: 25, spots: countLiteralSpots('pearlSpots'), expectedSpots: 30 },
  WATER_MINT_REQUIREMENT: { threshold: 25, spots: countLiteralSpots('seaMintSpots'), expectedSpots: 30 },
};
for (const [name, result] of Object.entries(requirements)) {
  const declaration = gameSource.match(new RegExp(`const ${name} = (\\d+);`));
  if (!declaration || Number(declaration[1]) !== result.threshold || result.spots !== result.expectedSpots) {
    throw new Error(`${name} must keep a ${result.threshold} clear goal and ${result.expectedSpots} collectible positions; got ${result.spots}.`);
  }
}
const bridgeSpots = gameSource.match(/bridgeMintSpots\.length !== BRIDGE_MINT_TOTAL/);
if (!/const BRIDGE_MINT_REQUIREMENT = 30;/.test(gameSource) ||
    !/const BRIDGE_MINT_TOTAL = Math\.ceil\(BRIDGE_MINT_REQUIREMENT \* MINT_CUSHION\)/.test(gameSource) ||
    !bridgeSpots ||
    !/bridgeMints\.length !== BRIDGE_MINT_TOTAL/.test(gameSource) ||
    !/state\.bridgeMintsCollected >= BRIDGE_MINT_REQUIREMENT/.test(gameSource) ||
    !/bridgeMintSpots\.length !== BRIDGE_MINT_TOTAL/.test(gameSource)) {
  throw new Error('Bridge World must generate 36 bridge mints while retaining its 30-mint clear goal.');
}
if (!/const MINT_CUSHION = 1\.2;/.test(gameSource) ||
    !/const MEADOW_MINT_TOTAL = Math\.ceil\(MEADOW_MINT_REQUIREMENT \* MINT_CUSHION\)/.test(gameSource) ||
    !/const WATER_MINT_TOTAL = Math\.ceil\(WATER_MINT_REQUIREMENT \* MINT_CUSHION\)/.test(gameSource)) {
  throw new Error('All stages must define a 1.2x collectible cushion.');
}
for (const runtimeGuard of [
  /pearls\.length !== MEADOW_MINT_TOTAL/,
  /waterMints\.length !== WATER_MINT_TOTAL/,
  /bridgePowerups\.length !== bridgePlatforms\.length \+ 1/,
]) {
  if (!runtimeGuard.test(gameSource)) throw new Error(`Missing generated-object invariant: ${runtimeGuard}`);
}
const gameplayGuards = [
  /function claimSavedMintGift\(/,
  /friend\.savedMintGift/,
  /function resolveMovablePropCollisions\(/,
  /function constrainToBridgeRails\(/,
  /function updateAmbientCreatures\(/,
  /function updateGlobalFoam\(/,
  /function resolveFriendCollisions\(/,
  /function resolveWaterShellCollision\(/,
  /const seaShellCollider =/,
  /const GLOBAL_FOAM_COUNT = 170/,
  /const MINT_CUSHION = 1\.2/,
  /child\.userData\?\.gaitLeg/,
  /const FRIEND_TALK_RANGE = 4\.4/,
  /state\.knockbackUntil = now \+ 460/,
  /state\.knockbackUntil = now \+ 420/,
  /for \(const pearl of pearls\) \{ pearl\.collected = true; pearl\.group\.visible = false; \}/,
  /seaCurrentFoamStreaks/,
  /function spawnSandPuff\(/,
  /wander: 8\.5/,
  /x: 7, z: 12, y: 25\.85/,
  /state\.stageAwaitingTap/,
  /player\.rotation\.y = state\.yaw/,
];
for (const guard of gameplayGuards) {
  if (!guard.test(gameSource)) throw new Error(`Missing gameplay feature regression guard: ${guard}`);
}
const indexSource = await readFile(path.join(root, 'index.html'), 'utf8');
if (!/new Float32Array\(560 \* 3\)/.test(gameSource) || /(?<!new )Float32Array\(560 \* 3\)/.test(gameSource)) {
  throw new Error('Underwater particle position buffer must use the Float32Array constructor with new.');
}
if (!indexSource.includes('id=\"fullscreen-toggle\"') || !indexSource.includes('id=\"welcome-fullscreen-toggle\"') || !indexSource.includes('requestFullscreen') || !indexSource.includes('fullscreenchange')) {
  throw new Error('Fullscreen toggle and change-state handling must be present.');
}
if (!indexSource.includes('id=\"stage-continue-button\"') || !gameSource.includes('waiting-for-stage-tap')) {
  throw new Error('New-world arrival must include a working, tappable continue button.');
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
console.log('Progression verified: Meadow 30 Fizz (goal 25), Water 30 Seafoam Mints (goal 25), Bridge 36 Bridge Mints (goal 30); all collectible and collision systems are guarded.');
console.log('Build complete: dist/ contains the static GitHub Pages site.');
