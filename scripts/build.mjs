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
if (!/const MOUNTAIN_MINT_REQUIREMENT = 35;/.test(gameSource) ||
    !/const MOUNTAIN_MINT_TOTAL = Math\.ceil\(MOUNTAIN_MINT_REQUIREMENT \* MINT_CUSHION\)/.test(gameSource) ||
    !/mountainMintSpots\.length!==MOUNTAIN_MINT_TOTAL/.test(gameSource) ||
    !/mountainMints\.length!==MOUNTAIN_MINT_TOTAL/.test(gameSource) ||
    !/state\.mountainMintsCollected >= MOUNTAIN_MINT_REQUIREMENT/.test(gameSource) ||
    !/function enterMountainWorld\(/.test(gameSource)) {
  throw new Error('Blue Ridge Mountain must generate 42 fresh mints while retaining its 35-mint summit goal.');
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
const bridgeDeckMatch = gameSource.match(/const bridgeSegmentSpecs = \[([\s\S]*?)\];/);
if (!bridgeDeckMatch) throw new Error('Bridge deck layout missing.');
const deckRows = [...bridgeDeckMatch[1].matchAll(/\{ x: ([\d.-]+), z: ([\d.-]+), y: ([\d.-]+), length: ([\d.]+), width: ([\d.]+), rotation: ([\d.-]+) \}/g)].map(m => ({ x: Number(m[1]), z: Number(m[2]), y: Number(m[3]), length: Number(m[4]), width: Number(m[5]), rotation: Number(m[6]) }));
if (deckRows.length !== 9) throw new Error(`Expected 9 bridge decks, found ${deckRows.length}.`);
const soraDeck = deckRows[7], summitDeck = deckRows[8];
const gapX = Math.max(0, Math.abs(summitDeck.x - soraDeck.x) - (soraDeck.length + summitDeck.length) / 2);
const gapZ = Math.max(0, Math.abs(summitDeck.z - soraDeck.z) - (soraDeck.width + summitDeck.width) / 2);
const deckEdgeGap = Math.hypot(gapX, gapZ);
const climbHeight = summitDeck.y - soraDeck.y;
if (deckEdgeGap > 0.3 || climbHeight > 1.0 || climbHeight <= 0 || summitDeck.z >= soraDeck.z) {
  throw new Error(`The final bridge jump must be a short forward hop: edge gap ${deckEdgeGap.toFixed(2)}, height ${climbHeight.toFixed(2)}.`);
}
const bridgePlacementsMatch = gameSource.match(/const bridgePlacements = \[([\s\S]*?)\];/);
if (!bridgePlacementsMatch || !/\{ platform: 7, lx: 2, lz: 0 \}/.test(bridgePlacementsMatch[1])) {
  throw new Error('Sora must remain on the second-highest deck beside the final jump.');
}

const gameplayGuards = [
  /function claimSavedMintGift\(/,
  /friend\.savedMintGift/,
  /function resolveMovablePropCollisions\(/,
  /function constrainToBridgeRails\(/,
  /function updateAmbientCreatures\(/,
  /function makeScallopShellTexture\(/,
  /Boing blocks are inert and fixed until the player collides with them/,
  /obstacles\.push\(\{type:'bar',group,baseX:x,x,z/,
  /Small hinge nub only; there is deliberately no large round central disc\./,
  /const MOUNTAIN_MINT_REQUIREMENT = 35;/,
  /function enterMountainWorld\(/,
  /function collectMountainMint\(/,
  /critter\.group\.rotation\.y = critter\.heading/,
  /function updateGlobalFoam\(/,
  /function resolveFriendCollisions\(/,
  /function resolveWaterShellCollision\(/,
  /const seaShellCollider =/,
  /const GLOBAL_FOAM_COUNT = 170/,
  /const MINT_CUSHION = 1\.2/,
  /child\.userData\?\.gaitLeg/,
  /const FRIEND_TALK_RANGE = 4\.4/,
  /state\.knockbackUntil = now \+ 650/,
  /state\.knockbackUntil = now \+ 600/,
  /for \(const pearl of pearls\) \{ pearl\.collected = true; pearl\.group\.visible = false; \}/,
  /seaCurrentFoamStreaks/,
  /function spawnSandPuff\(/,
  /wander: 8\.5/,
  /x: 1\.7, z: 13\.8, y: 25\.85, length: 28, width: 5\.0, rotation: 0\.0/,
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
console.log('Progression verified: Meadow 30 Fizz (goal 25), Water 30 Seafoam Mints (goal 25), Bridge 36 Bridge Mints (goal 30), Blue Ridge 42 Fresh Mints (goal 35).');
console.log(`Final bridge jump verified: ${deckEdgeGap.toFixed(2)}-unit deck-edge gap, ${climbHeight.toFixed(2)}-unit rise; Sora is on the launch deck.`);
console.log('Build complete: dist/ contains the static GitHub Pages site.');
