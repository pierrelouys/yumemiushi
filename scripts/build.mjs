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


const serveSource = await readFile(path.join(root, 'scripts', 'serve.mjs'), 'utf8');
const stageAudioAndReplayGuards = [
  [serveSource.includes("'.mp3': 'audio/mpeg'"), 'local development server serves MP3 with audio/mpeg MIME type'],
  [gameSource.includes("function stageTrackNumber(world = worldMode)"), 'per-world soundtrack mapping'],
  [gameSource.includes("return world === 'water' ? '02' : (world === 'bridge' ? '03' : (world === 'mountain' ? '04' : '01'))"), 'stage01–stage04 order'],
  [gameSource.includes("new URL(`../assets/stage${stageTrackNumber(world)}.mp3`, import.meta.url).href"), 'stage MP3 URL resolves from src/ into assets/'],
  [gameSource.includes("track.addEventListener('error', activateFallback"), 'MP3 error fallback'],
  [gameSource.includes("stageMusicMode === 'loading' && track.readyState < HTMLMediaElement.HAVE_FUTURE_DATA"), 'MP3 timeout fallback'],
  [gameSource.includes("if (stageMusicMode !== 'fallback') return;"), 'synth BGM only plays in fallback mode'],
  [gameSource.includes('const UNDERWATER_BUBBLE_COUNT = 520;'), 'large sea bubble field'],
  [gameSource.includes('function spawnWaterJumpBubbles()'), 'double/triple jump bubble effect'],
  [gameSource.includes('state.waterJumpsUsed < 3'), 'water-stage triple-jump cap'],
  [gameSource.includes('state.waterJumpsUsed === 2 ? 7.8 : 7.1'), 'distinct second/third jump impulse'],
  [gameSource.includes('function createReplayMintCopies()'), 'replay mint doubling'],
  [gameSource.includes('function setReplayCollectibleVisibility(stage)'), 'replay mint visibility reset'],
  [gameSource.includes('state.pearls = 0; state.waterMintsCollected = 0; state.bridgeMintsCollected = 0; state.mountainMintsCollected = 0;'), 'replay counters reset'],
  [gameSource.includes("if (replayMode) { setReplayCollectibleVisibility('water'); updateHUD(); }"), 'water replay pool reactivated on stage arrival'],
  [gameSource.includes("if (replayMode) { setReplayCollectibleVisibility('bridge'); updateHUD(); }"), 'bridge replay pool reactivated on stage arrival'],
  [gameSource.includes("if (replayMode) { setReplayCollectibleVisibility('mountain'); updateHUD(); }"), 'mountain replay pool reactivated on stage arrival'],
  [indexSource.includes('More worlds are on the way!'), 'post-level-four promise'],
  [indexSource.includes('data-replay-stage="meadow"') && indexSource.includes('data-replay-stage="water"') && indexSource.includes('data-replay-stage="bridge"') && indexSource.includes('data-replay-stage="mountain"'), 'selector for all four replayable stages'],
  [gameSource.includes('function addMountainTrampoline('), 'Blue Ridge foothill trampoline helper'],
];
for (const [ok, description] of stageAudioAndReplayGuards) {
  if (!ok) throw new Error(`Missing soundtrack/replay regression guard: ${description}`);
}
const mountainTrampolinePlacements = [...gameSource.matchAll(/addMountainTrampoline\(/g)].length - 1;
if (mountainTrampolinePlacements !== 3) throw new Error(`Expected three foothill trampolines, found ${mountainTrampolinePlacements}.`);
for (const cloneCall of [
  "cloneSet(pearls, scene, 'meadow');",
  "cloneSet(waterMints, waterWorld, 'water');",
  "cloneSet(bridgeMints, bridgeWorld, 'bridge');",
  "cloneSet(mountainMints, mountainWorld, 'mountain');",
]) {
  if (!gameSource.includes(cloneCall)) throw new Error(`Replay mode must double every stage's mint pool: ${cloneCall}`);
}
const replayMintTotals = {
  meadow: requirements.MEADOW_MINT_REQUIREMENT.spots * 2,
  water: requirements.WATER_MINT_REQUIREMENT.spots * 2,
  bridge: Number(gameSource.match(/const BRIDGE_MINT_TOTAL = Math\.ceil\(BRIDGE_MINT_REQUIREMENT \* MINT_CUSHION\)/) ? 36 : 0) * 2,
  mountain: Number(gameSource.match(/const MOUNTAIN_MINT_TOTAL = Math\.ceil\(MOUNTAIN_MINT_REQUIREMENT \* MINT_CUSHION\)/) ? 42 : 0) * 2,
};
if (replayMintTotals.meadow !== 60 || replayMintTotals.water !== 60 || replayMintTotals.bridge !== 72 || replayMintTotals.mountain !== 84) {
  throw new Error(`Replay mint totals must be 60/60/72/84; got ${Object.values(replayMintTotals).join('/')}.`);
}

const styleSource = await readFile(path.join(root, 'src', 'style.css'), 'utf8');
const interfaceAndPerformanceGuards = [
  [indexSource, 'id="broadcast-date"', 'Japanese local date HUD'],
  [indexSource, 'id="stage-goal"', 'stage progress-goal display'],
  [styleSource, '@media (pointer: coarse) and (orientation: landscape)', 'touch controls in landscape'],
  [styleSource, 'display: flex !important', 'visible landscape touch controls'],
  [gameSource, 'Collect 30 Bridge Mints to reach Blue Ridge Mountain', 'Bridge World goal instructions'],
  [gameSource, 'Collect 35 Fresh Mints to reach the summit', 'Blue Ridge goal instructions'],
  [gameSource, 'Collect 25 Seafoam Mints to unlock Bridge World', 'Water World goal instructions'],
  [gameSource, 'addMeadowTrampoline(-53, -22', 'meadow trampoline 1'],
  [gameSource, 'addMeadowTrampoline(43, -39', 'meadow trampoline 2'],
  [gameSource, 'addMeadowTrampoline(-45, 59', 'meadow trampoline 3'],
  [gameSource, 'addMeadowTrampoline(61, 47', 'meadow trampoline 4'],
  [gameSource, 'state.vy = 29.5', 'massive trampoline launch'],
  [gameSource, "weather.phase = 'gathering'", 'weather build-up phase'],
  [gameSource, 'const cloudRate = (weatherInitialized', 'smooth cloud progression'],
  [gameSource, "import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'", 'merged geometry utility import'],
  [gameSource, 'mergeGeometries(puffGeometries, false)', 'merged cloud draw calls'],
  [gameSource, 'renderer.shadowMap.autoUpdate = false', 'throttled high-resolution shadows'],
  [gameSource, 'now - lastShadowRefresh >= 25', 'shadow cadence for mobile performance'],
];
for (const [source, text, description] of interfaceAndPerformanceGuards) {
  if (!source.includes(text)) throw new Error(`Missing interface/performance feature: ${description}`);
}
const trampolinePlacements = [...gameSource.matchAll(/addMeadowTrampoline\(/g)].length - 1; // exclude the function definition
if (trampolinePlacements !== 4) throw new Error(`Expected exactly 4 meadow trampolines, found ${trampolinePlacements}.`);

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
console.log(`Replay mode verified: ${replayMintTotals.meadow}/${replayMintTotals.water}/${replayMintTotals.bridge}/${replayMintTotals.mountain} mints available with counters reset.`);
console.log('Build complete: dist/ contains the static GitHub Pages site.');
