import { cp, mkdir, readFile, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { calculateMagnetPullStep } from '../src/magnet-physics.js';
import { lunarInfo, lunarLightScale } from '../src/lunar-phase.js';
import { moonDirectionFromAltitude } from '../src/moon-lighting.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });
await cp(path.join(root, 'index.html'), path.join(dist, 'index.html'));
await cp(path.join(root, 'src'), path.join(dist, 'src'), { recursive: true });
await cp(path.join(root, 'public', 'assets'), path.join(dist, 'assets'), { recursive: true });

// Progression collectibles are release invariants: each world must have a 20% mint cushion.
const gameSource = await readFile(path.join(root, 'src', 'main.js'), 'utf8');
const styleSource = await readFile(path.join(root, 'src', 'style.css'), 'utf8');
const htmlSource = await readFile(path.join(root, 'index.html'), 'utf8');

// Astronomical phase model and linear light response are release invariants.
const knownNewMoon = lunarInfo(new Date(Date.UTC(2000, 0, 6, 18, 14)));
const knownFullMoon = lunarInfo(new Date(Date.UTC(2000, 0, 21, 4, 40)));
const currentWaxing = lunarInfo(new Date('2026-10-17T20:00:00Z'));
const currentFirstQuarter = lunarInfo(new Date('2026-10-18T18:00:00Z'));
if (knownNewMoon.illumination !== 0 || knownNewMoon.name !== 'New moon' ||
    knownFullMoon.illumination !== 1 || knownFullMoon.name !== 'Full moon' ||
    currentWaxing.name !== 'Waxing crescent' || currentFirstQuarter.name !== 'First quarter' ||
    Math.abs(currentWaxing.illumination - 0.42) > 0.03 || Math.abs(currentFirstQuarter.illumination - 0.5) > 0.03 ||
    lunarLightScale(0) !== 0 || Math.abs(lunarLightScale(0.4) - 0.4) > 1e-12 || lunarLightScale(1) !== 1 ||
    lunarLightScale(-1) !== 0 || lunarLightScale(2) !== 1) {
  throw new Error('Lunar calculation must match known new/full/quarter phases and preserve the exact illumination percentage in the light output.');
}
console.log(`Lunar phase verified: new moon 0%, full moon 100%, Oct 17 waxing ${Math.round(currentWaxing.illumination * 100)}%, Oct 18 first quarter ${Math.round(currentFirstQuarter.illumination * 100)}%; light scaling is linear.`);
const directionHorizon = moonDirectionFromAltitude(0.7, 0);
const directionMidAltitude = moonDirectionFromAltitude(0, 0.5);
const directionZenith = moonDirectionFromAltitude(1.2, 1);
const directionNorm = (d) => Math.hypot(d.x, d.y, d.z);
if (Math.abs(directionHorizon.y) > 1e-12 || Math.abs(directionMidAltitude.y - 0.5) > 1e-12 ||
    Math.abs(Math.hypot(directionMidAltitude.x, directionMidAltitude.z) - Math.sqrt(0.75)) > 1e-12 ||
    Math.abs(directionZenith.y - 1) > 1e-12 || Math.hypot(directionZenith.x, directionZenith.z) > 1e-12 ||
    Math.abs(directionNorm(directionHorizon) - 1) > 1e-12 ||
    Math.abs(directionNorm(directionMidAltitude) - 1) > 1e-12 ||
    Math.abs(directionNorm(directionZenith) - 1) > 1e-12) {
  throw new Error('Moonlight direction must correctly track horizon, mid-altitude, and zenith instead of capping at a shallow angle.');
}
console.log('Moon direction verified: unit vectors correctly represent horizon, 30-degree altitude, and zenith.');
if (!gameSource.includes("import { lunarInfo, lunarLightScale } from './lunar-phase.js';") ||
    !gameSource.includes("import { moonDirectionFromAltitude } from './moon-lighting.js';") ||
    !gameSource.includes('const FRIEND_NAME_VISIBLE_RANGE = FRIEND_TALK_RANGE * 2;') ||
    !gameSource.includes('friend.nameSprite.visible = near && closeEnoughForName;') ||
    !gameSource.includes('nameDistanceSquared <= FRIEND_NAME_VISIBLE_RANGE * FRIEND_NAME_VISIBLE_RANGE') ||
    !gameSource.includes("const moonAmbientLight = new THREE.AmbientLight('#c5d7ff', 0);") ||
    !gameSource.includes('const MOONLIGHT_FULL_INTENSITY = 6.4;') ||
    !gameSource.includes('const MOON_AMBIENT_FULL_INTENSITY = 2.8;') ||
    !gameSource.includes('moonDirectionFromAltitude(azimuth, sinAltitude)') ||
    !gameSource.includes('const nightHorizonBlend = smooth01(0.005, 0.18, nightWeight);') ||
    !gameSource.includes('const twilightGlow = twilight * (1 - smooth01(0.005, 0.11, nightWeight));') ||
    !gameSource.includes('float alpha = uNight * lit;') ||
    !gameSource.includes('moonLight.intensity = MOONLIGHT_FULL_INTENSITY * phaseNight * waterScale;') ||
    !gameSource.includes('moonAmbientLight.intensity = MOON_AMBIENT_FULL_INTENSITY * phaseNight') ||
    !gameSource.includes('updateMoonlightIntensity(THREE.MathUtils.clamp(sinAltitude, 0, 1));')) {
  throw new Error('Friend nameplates and lunar light must use the expected range, full-scene ambient contribution, correct moon direction, and horizon fade.');
}
if (!gameSource.includes('sprite.visible = false; // The distance LOD enables it only when the player is within nameplate range.')) {
  throw new Error('Friend nameplates must start hidden until the proximity check enables them.');
}
console.log('Friend nameplates verified: 8.8-unit 3D range (2× talk range), with existing body LOD preserved.');
function countLiteralSpots(arrayName) {
  const match = gameSource.match(new RegExp(`const ${arrayName} = \\[([\\s\\S]*?)\\];`));
  if (!match) throw new Error(`Could not find the ${arrayName} collectible list.`);
  return [...match[1].matchAll(/\[[^\[\]]+\]/g)].length;
}
const requirements = {
  MEADOW_MINT_REQUIREMENT: { threshold: 50, spots: countLiteralSpots('basePearlSpots'), expectedSpots: 30 },
  WATER_MINT_REQUIREMENT: { threshold: 50, spots: countLiteralSpots('baseSeaMintSpots'), expectedSpots: 30 },
};
for (const [name, result] of Object.entries(requirements)) {
  const declaration = gameSource.match(new RegExp(`const ${name} = (\\d+);`));
  if (!declaration || Number(declaration[1]) !== result.threshold || result.spots !== result.expectedSpots) {
    throw new Error(`${name} must keep a ${result.threshold} clear goal and ${result.expectedSpots} collectible positions; got ${result.spots}.`);
  }
}
const bridgeSpots = gameSource.match(/bridgeMintSpots\.length !== BRIDGE_MINT_TOTAL/);
if (!/const BRIDGE_MINT_REQUIREMENT = 60;/.test(gameSource) ||
    !/const BRIDGE_MINT_TOTAL = Math\.ceil\(BRIDGE_MINT_REQUIREMENT \* MINT_CUSHION\)/.test(gameSource) ||
    !bridgeSpots ||
    !/bridgeMints\.length !== BRIDGE_MINT_TOTAL/.test(gameSource) ||
    !/state\.bridgeMintsCollected >= mintRequirementFor\('bridge'\)/.test(gameSource) ||
    !/bridgeMintSpots\.length !== BRIDGE_MINT_TOTAL/.test(gameSource)) {
  throw new Error('Bridge World must generate 72 bridge mints while retaining its 60-mint clear goal.');
}
if (!/const MOUNTAIN_MINT_REQUIREMENT = 70;/.test(gameSource) ||
    !/const MOUNTAIN_MINT_TOTAL = Math\.ceil\(MOUNTAIN_MINT_REQUIREMENT \* MINT_CUSHION\)/.test(gameSource) ||
    !/mountainMintSpots\.length!==MOUNTAIN_MINT_TOTAL/.test(gameSource) ||
    !/mountainMints\.length!==MOUNTAIN_MINT_TOTAL/.test(gameSource) ||
    !/state\.mountainMintsCollected >= mintRequirementFor\('mountain'\)/.test(gameSource) ||
    !/function enterMountainWorld\(/.test(gameSource)) {
  throw new Error('Blue Ridge Mountain must generate 84 fresh mints while retaining its 70-mint summit goal.');
}
if (!/const MINT_CUSHION = 1\.2;/.test(gameSource) ||
    !/const MEADOW_TRAMPOLINE_MINTS_PER_PAD = 11;/.test(gameSource) ||
    !/const MEADOW_TRAMPOLINE_MINT_COUNT = 4 \* MEADOW_TRAMPOLINE_MINTS_PER_PAD;/.test(gameSource) ||
    !/You gathered \$\{state\.pearls\} Fizz Mints! Your trampoline trail still sparkles behind you\./.test(gameSource) ||
    !/const MEADOW_AVAILABLE_MINT_TOTAL = MEADOW_MINT_TOTAL \+ MEADOW_TRAMPOLINE_MINT_COUNT;/.test(gameSource) ||
    !/const MEADOW_MINT_TOTAL = Math\.ceil\(MEADOW_MINT_REQUIREMENT \* MINT_CUSHION\)/.test(gameSource) ||
    !/const WATER_MINT_TOTAL = Math\.ceil\(WATER_MINT_REQUIREMENT \* MINT_CUSHION\)/.test(gameSource)) {
  throw new Error('All stages must define a 1.2x collectible cushion.');
}
for (const runtimeGuard of [
  /pearls\.length !== MEADOW_MINT_TOTAL/,
  /trampolineTrailPearls\.length!==MEADOW_TRAMPOLINE_MINT_COUNT/,
  /pearls\.length!==MEADOW_AVAILABLE_MINT_TOTAL/,
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
  /const MOUNTAIN_MINT_REQUIREMENT = 70;/,
  /const UNDERWATER_BUBBLE_COUNT = 4000;/,
  /const mountainJunctions = mountainTrailNodes\.map\(node=>\(\{node,half:7\.0,mesh:null\}\)\);/,
  /function findMountainSurfaceAt\(x,z\)/,
  /Build each switchback connector as a height-matched stone patch/,
  /function isMountainSpawnClear\(x,z\)/,
  /candidateSurface && isMountainSpawnClear\(candidate\.x,candidate\.z\)/,
  /mountainSolidColliders\.push\(\{ kind:'ellipse', x, z, rx:r\*1\.22, rz:r\*0\.76, topY:h-0\.8 \}\)/,
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
  /const exitTurtle = worldMode === 'water' && targetWorld === 'bridge' && state\.ridingTurtle/,
  /state\.finale\.exitDuration = exitTurtle \? 1\.35 : 0/,
  /const hopDuration = 0\.55/,
  /progress = 0\.88 \* smooth\(hopT\)/,
  /state\.x = f\.exitTarget\.x; state\.y = 0; state\.z = f\.exitTarget\.z/,
];
for (const guard of gameplayGuards) {
  if (!guard.test(gameSource)) throw new Error(`Missing gameplay feature regression guard: ${guard}`);
}
// The level-clear CTA must be genuinely clickable: the overlay blocks pointer events during the
// dance, then explicitly enables them when the result action is shown. Check both CSS and JS.
if (!/\.finale-overlay\.is-visible\s*\{[^}]*pointer-events:\s*auto;/.test(styleSource) ||
    !/\.finale-overlay\.is-visible\.has-action\s*\{\s*pointer-events:\s*auto;/.test(styleSource) ||
    !/classList\.add\('is-visible', 'has-action'\)/.test(gameSource) ||
    !/continueButton\.style\.pointerEvents = 'auto'/.test(gameSource) ||
    !/arrivalContinueButton\.style\.pointerEvents = 'auto'/.test(gameSource) ||
    !/stage-continue-button'\)\.addEventListener\('click'/.test(gameSource) ||
    !/state\.clearAwaitingTap = true/.test(gameSource)) {
  throw new Error('Level-clear continue button must receive pointer events once visible and be wired to the stage transition handler.');
}
if (!htmlSource.includes('id="magnet-indicator"') ||
    !/const stageMagnetPickups = \[/.test(gameSource) ||
    !/function resetStageMagnet\(stage = worldMode\)/.test(gameSource) ||
    !/function tryCollectStageMagnet\(now\)/.test(gameSource) ||
    !/function attractMintTowardPlayer\(mint, dt, baselineLocalY/.test(gameSource) ||
    !/function mintDistanceMetrics\(mint, playerCenter\)/.test(gameSource) ||
    !/calculateMagnetPullStep\(/.test(gameSource) ||
    !/state\.magnetActive = true/.test(gameSource) ||
    !/function updateStageMagnetVisuals\(now\)/.test(gameSource) ||
    !/const mintMetrics = mintDistanceMetrics\(pearl, playerCenter\)/.test(gameSource) ||
    !/const mintMetrics = mintDistanceMetrics\(mint, playerCenter\)/.test(gameSource) ||
    !/mint\.group\.updateWorldMatrix\(true, false\)/.test(gameSource) ||
    !/mint\.group\.parent\.worldToLocal\(magnetMintNextLocalPosition\.copy\(magnetMintNextWorldPosition\)\)/.test(gameSource) ||
    !/mint\.magnetYOffset = mint\.group\.position\.y - baselineLocalY/.test(gameSource) ||
    !/resetStageMagnet\('water'\)/.test(gameSource) ||
    !/resetStageMagnet\('bridge'\)/.test(gameSource) ||
    !/resetStageMagnet\('mountain'\)/.test(gameSource) ||
    !/resetStageMagnet\('meadow'\)/.test(gameSource)) {
  throw new Error('All four stages must have a collectible stage-long magnet, working 3D attraction and world-space mint collision, a persistent pull offset, and reset-on-stage-entry behavior.');
}
const magnetStageList = gameSource.match(/const stageMagnetPickups = \[([\s\S]*?)\];/);
const magnetStages = magnetStageList ? [...magnetStageList[1].matchAll(/createStageMagnet\('([a-z]+)'/g)].map(m => m[1]).sort() : [];
const magnetPullCalls = [...gameSource.matchAll(/^\s+const magnetPulling = attractMintTowardPlayer\((?:pearl|mint), dt, bobY\);/gm)].length;
if (magnetStages.join(',') !== 'bridge,meadow,mountain,water' || magnetPullCalls !== 4) {
  throw new Error(`Exactly one off-route magnet and an attraction update are required in each stage; found stages ${magnetStages.join(', ') || 'none'} and ${magnetPullCalls} attraction calls.`);
}
const magnetPlacementBlock = gameSource.match(/const stageMagnetPickups = \[([\s\S]*?)\];/);
if (!magnetPlacementBlock ||
    !magnetPlacementBlock[1].includes("createStageMagnet('meadow',scene, -96,0, 96)") ||
    !magnetPlacementBlock[1].includes("createStageMagnet('water',waterWorld, 99,0,-99)") ||
    !magnetPlacementBlock[1].includes("createStageMagnet('bridge',bridgeWorld, 82,0,-84)") ||
    !magnetPlacementBlock[1].includes("createStageMagnet('mountain',mountainWorld,-72,0.16,88)") ||
    !/const MAGNET_RANGE_SCALE = 0\.6;/.test(gameSource) ||
    !/const MAGNET_LAND_RANGE = 5\.2 \* MAGNET_RANGE_SCALE;/.test(gameSource) ||
    !/const MAGNET_WATER_RANGE = 5\.8 \* MAGNET_RANGE_SCALE;/.test(gameSource) ||
    !/const MAGNET_VERTICAL_RANGE = 2\.8;/.test(gameSource) ||
    !/const MAGNET_COLLECTION_RADIUS = 1\.05;/.test(gameSource) ||
    !/function mintPickupRadius\(normalRadius, magnetPulling\)/.test(gameSource) ||
    !/return magnetPulling \? Math\.min\(normalRadius, MAGNET_COLLECTION_RADIUS\) : normalRadius;/.test(gameSource) ||
    !/mint\.group\.getWorldPosition\(magnetMintWorldPosition\)/.test(gameSource) ||
    !/mint\.group\.parent\.updateWorldMatrix\(true, false\)/.test(gameSource) ||
    !/pickup\.group\.visible = inStage;/.test(gameSource) ||
    !/opacity:0\.17,\s*depthWrite:false/.test(gameSource) ||
    !/group\.scale\.setScalar\(1\.0\)/.test(gameSource) ||
    !/emissiveIntensity:0\.36/.test(gameSource)) {
  throw new Error('Magnets must retain a balanced 60% horizontal reach and full-size/bright visuals while using a functional 3D pull.');
}
// Exercise the exact magnet-physics helper used by runtime: an offset mint moves each step,
// directly-above mints still move vertically, and mint outside the horizontal reach is untouched.
const testMagnetOut = { x:0, y:0, z:0, inRange:false, moved:false, horizontalDistance:0, distance:0 };
const magnetTargetTest = { x:0, y:1, z:0 };
let movingMintTest = { x:1.45, y:2.3, z:0.2 };
const initialMagnetDistance = Math.hypot(movingMintTest.x, movingMintTest.y - magnetTargetTest.y, movingMintTest.z);
for (let step = 0; step < 18; step++) {
  calculateMagnetPullStep(movingMintTest, magnetTargetTest, 1/60, 5.2*0.6, 2.8, testMagnetOut);
  if (!testMagnetOut.inRange) throw new Error('Magnet physics test: nearby mint incorrectly fell outside the field.');
  if (!testMagnetOut.moved) { if (testMagnetOut.distance <= 0.03) break; throw new Error('Magnet physics test: nearby mint failed to move.'); }
  movingMintTest = { x:testMagnetOut.x, y:testMagnetOut.y, z:testMagnetOut.z };
}
const finalMagnetDistance = Math.hypot(movingMintTest.x, movingMintTest.y - magnetTargetTest.y, movingMintTest.z);
if (!(finalMagnetDistance < initialMagnetDistance * 0.30)) throw new Error(`Magnet physics test: mint failed to approach player (distance ${initialMagnetDistance.toFixed(2)} -> ${finalMagnetDistance.toFixed(2)}).`);
calculateMagnetPullStep({x:0.01,y:2.2,z:0.01}, magnetTargetTest, 1/60, 5.2*0.6, 2.8, testMagnetOut);
if (!testMagnetOut.inRange || !testMagnetOut.moved || !(testMagnetOut.y < 2.2)) throw new Error('Magnet physics test: vertically aligned mint does not move toward the player.');
calculateMagnetPullStep({x:5.2*0.6+0.2,y:1,z:0}, magnetTargetTest, 1/60, 5.2*0.6, 2.8, testMagnetOut);
if (testMagnetOut.inRange || testMagnetOut.moved) throw new Error('Magnet physics test: horizontal reach exceeds the tuned range.');
calculateMagnetPullStep({x:2.8,y:1,z:0}, magnetTargetTest, 1/60, 5.2*0.6, 2.8, testMagnetOut);
if (!testMagnetOut.inRange || !testMagnetOut.moved) throw new Error('Magnet physics test: a mint within the newly improved reach is not pulled.');
const effectiveMagnetRanges = { land: 5.2 * 0.6, water: 5.8 * 0.6, vertical: 2.8 };
const magneticCollectionCallCount = [...gameSource.matchAll(/const pickupRadius = mintPickupRadius\(/g)].length;
if (!(effectiveMagnetRanges.land > 1.05 && effectiveMagnetRanges.water > 1.05 && effectiveMagnetRanges.vertical > 1.05) || magneticCollectionCallCount !== 4) {
  throw new Error('All four worlds must perform magnetic attraction and world-space mint collision checks.');
}
console.log(`Magnet movement simulation passed: nearby 3D distance ${initialMagnetDistance.toFixed(2)} -> ${finalMagnetDistance.toFixed(2)}; horizontal range ${effectiveMagnetRanges.land.toFixed(2)} land / ${effectiveMagnetRanges.water.toFixed(2)} water; elevated mint pulls vertically.`);
if (!/new THREE\.CircleGeometry\(1\.5, 36\)/.test(gameSource) ||
    !/color: '#383838', transparent: true, opacity: 0\.22/.test(gameSource) ||
    !/shadow\.material\.color\.set\('#383838'\); shadow\.material\.opacity = 0\.22;/.test(gameSource) ||
    !/shadow\.material\.color\.set\('#383838'\); shadow\.material\.opacity=0\.22;/.test(gameSource)) {
  throw new Error('The player ground shadow must stay compact and neutral rather than rendering as a bright green halo.');
}
if (!/renderer\.shadowMap\.autoUpdate = true;/.test(gameSource) || /shadowRefreshInterval|lastShadowRefresh/.test(gameSource) || !/renderer\.shadowMap\.type = THREE\.PCFSoftShadowMap;/.test(gameSource) || !/sun\.shadow\.camera\.updateProjectionMatrix\(\);/.test(gameSource) || !/scene\.add\(sun\.target\);/.test(gameSource) || !/function updateSunShadowAnchor\(\)/.test(gameSource) || !/sun\.target\.position\.set\(tx, ty, tz\)/.test(gameSource) || !/sun\.position\.set\(tx - 35, ty \+ 65, tz \+ 32\)/.test(gameSource) || !/sun\.shadow\.normalBias = 0\.025;/.test(gameSource) || !/updateSunShadowAnchor\(\);\n  musicTick\(\);/.test(gameSource)) {
  throw new Error('Shadows must use a valid, updated orthographic projection, player-following light target, and normal PCF soft-shadow updates.');
}
if (!/if \(stage === 'mountain' \|\| object\.userData\?\.backgroundMountain \|\| object\.userData\?\.neverDistanceCull\) return object;/.test(gameSource) ||
    !/const mountainBackdropRockMat = new THREE\.MeshStandardMaterial\(\{[^}]*fog: false/.test(gameSource) ||
    !/const mountainBackdropSnowMat = new THREE\.MeshStandardMaterial\(\{[^}]*fog: false/.test(gameSource) ||
    !/new THREE\.Mesh\(new THREE\.ConeGeometry\(r, h, 7, 2\), mountainBackdropRockMat\)/.test(gameSource) ||
    !/new THREE\.Mesh\(new THREE\.ConeGeometry\(r \* 0\.40, h \* 0\.23, 7, 1\), mountainBackdropSnowMat\)/.test(gameSource) ||
    !/backgroundMesh\.visible = true; backgroundMesh\.frustumCulled = false;/.test(gameSource)) {
  throw new Error('All Blue Ridge mountain terrain must bypass distance culling and the skyline must render without fog fade.');
}
if (!/const UNDERWATER_BUBBLE_COUNT = 4000;/.test(gameSource) ||
    !/const UNDERWATER_DETAILED_BUBBLES = touchGpuProfile \? 300 : 760;/.test(gameSource) ||
    !/farBubblePoints/.test(gameSource) ||
    !/now - lastUnderwaterBubbleFieldUpdate < 40/.test(gameSource) ||
    !/function updateSeaTurtle\(dt,now\)/.test(gameSource) ||
    !/state\.ridingTurtle=true/.test(gameSource) ||
    !/state\.waterJumpsUsed < 3/.test(gameSource)) {
  throw new Error('Water World must retain 4,000 bubbles, triple jump, and the rideable mint-following turtle.');
}
if (!/const renderPixelRatioCap = touchGpuProfile \? 1\.28 : 1\.6;/.test(gameSource) ||
    !/averageFrameMs \+= \(rawFrameMs - averageFrameMs\) \* 0\.08/.test(gameSource) ||
    !/activePixelRatio - 0\.08/.test(gameSource) ||
    !/renderer\.shadowMap\.autoUpdate = true;/.test(gameSource) ||
    /shadowRefreshInterval|lastShadowRefresh/.test(gameSource) ||
    !/sun\.shadow\.mapSize\.set\(touchGpuProfile \? 1536 : 2048/.test(gameSource) ||
    !/sun\.shadow\.camera\.left = -38;/.test(gameSource) ||
    !/sun\.shadow\.camera\.right = 38;/.test(gameSource) ||
    !/sun\.shadow\.camera\.top = 38;/.test(gameSource) ||
    !/sun\.shadow\.camera\.bottom = -38;/.test(gameSource) ||
    !/BUBBLE_LOD_SORT_INTERVAL = 240/.test(gameSource) ||
    !/now - lastBubbleLodSort >= BUBBLE_LOD_SORT_INTERVAL/.test(gameSource) ||
    !/averageFrameMs > 24/.test(gameSource) ||
    !/underwaterDetailGroups/.test(gameSource) ||
    !/const detailRange = touchGpuProfile \? 36 : 52;/.test(gameSource) ||
    !/function updateMeadowDetailLOD\(now\)/.test(gameSource) ||
    !/const detailRange = touchGpuProfile \? 34 : 50;/.test(gameSource) ||
    !/const minimumAdaptivePixelRatio = Math\.min\(0\.90, activePixelRatio\)/.test(gameSource)) {
  throw new Error('Mobile GPU savings must retain bubble LOD, world-space static-geometry chunks, and safe distance clipping.');
}
if (!/const mountainJunctions = mountainTrailNodes\.map\(node=>\(\{node,half:7\.0,mesh:null\}\)\)/.test(gameSource) ||
    !/function findMountainSurfaceAt\(x,z\)/.test(gameSource) ||
    !/const proximity=THREE\.MathUtils\.clamp\(1-hit\.cross\/edge,0,1\)/.test(gameSource) ||
    !/const nodeWeight=0\.16\*Math\.pow\(Math\.max\(0,1-edgeDistance\),2\)/.test(gameSource) ||
    !/Build each switchback connector as a height-matched stone patch/.test(gameSource) ||
    !/function isMountainSpawnClear\(x,z\)/.test(gameSource) ||
    !/candidateSurface && isMountainSpawnClear\(candidate\.x,candidate\.z\)/.test(gameSource)) {
  throw new Error('Blue Ridge needs continuous junction plates and collision-safe friend placement.');
}
// Simulate the source support-height calculation across the full walkable ramp width, not just
// its centerline. This catches lateral seam drops at the switchbacks that can strand the player.
const nodeMatch = gameSource.match(/const mountainTrailNodes = \[([\s\S]*?)\];/);
const mountainNodes = nodeMatch ? [...nodeMatch[1].matchAll(/\{ x: ([\d.-]+), z: ([\d.-]+), y: ([\d.-]+) \}/g)].map(m=>({x:+m[1],z:+m[2],y:+m[3]})) : [];
if (mountainNodes.length !== 9) throw new Error(`Blue Ridge needs 9 connected trail nodes; found ${mountainNodes.length}.`);
const mountainMagnet = gameSource.match(/createStageMagnet\('mountain',mountainWorld,([-\d.]+),0\.16,([-\d.]+)\)/);
if (!mountainMagnet) throw new Error('Blue Ridge magnet location must be explicit and verifiable.');
const mountainMagnetPoint = { x: Number(mountainMagnet[1]), z: Number(mountainMagnet[2]) };
function pointSegmentDistance2D(point, a, b) {
  const dx = b.x-a.x, dz = b.z-a.z, len2 = dx*dx+dz*dz || 1;
  const t = Math.max(0,Math.min(1,((point.x-a.x)*dx+(point.z-a.z)*dz)/len2));
  return Math.hypot(point.x-(a.x+dx*t),point.z-(a.z+dz*t));
}
const mountainMagnetTrailGap = Math.min(...mountainNodes.slice(0,-1).map((node,i)=>pointSegmentDistance2D(mountainMagnetPoint,node,mountainNodes[i+1])));
if (mountainMagnetTrailGap < 55) throw new Error(`Blue Ridge magnet must be hidden at least 55 units from the hiking trail; found ${mountainMagnetTrailGap.toFixed(1)}.`);
console.log(`Magnet ranges verified: horizontal ${effectiveMagnetRanges.land.toFixed(2)} land / ${effectiveMagnetRanges.water.toFixed(2)} water, vertical tolerance ${effectiveMagnetRanges.vertical.toFixed(2)}; Blue Ridge magnet is ${mountainMagnetTrailGap.toFixed(1)} units off-trail and pickups remain full-size.`);
const mountainSegments = mountainNodes.slice(0,-1).map((a,i)=>({a,b:mountainNodes[i+1],index:i,width:13.2}));
function simulatedMountainSurface(x,z) {
  const hits=[]; let weightedY=0,weightSum=0,closestHit=null;
  for(const seg of mountainSegments) {
    const dx=seg.b.x-seg.a.x,dz=seg.b.z-seg.a.z,len2=dx*dx+dz*dz,len=Math.sqrt(len2)||1;
    const rawT=((x-seg.a.x)*dx+(z-seg.a.z)*dz)/(len2||1),t=Math.max(0,Math.min(1,rawT));
    if(Math.abs(rawT-t)*len>2.25) continue;
    const px=seg.a.x+dx*t,pz=seg.a.z+dz*t,cross=Math.hypot(x-px,z-pz);
    if(cross>seg.width/2+0.35) continue;
    const hit={y:seg.a.y+(seg.b.y-seg.a.y)*t,t:rawT,cross,seg}; hits.push(hit);
    if(!closestHit||cross<closestHit.cross) closestHit=hit;
    const edge=seg.width/2+0.35,proximity=Math.max(0,Math.min(1,1-cross/edge)),w=proximity*proximity;
    weightedY+=hit.y*w; weightSum+=w;
  }
  const junctionIndex=mountainNodes.findIndex(n=>Math.abs(x-n.x)<=7&&Math.abs(z-n.z)<=7);
  if(junctionIndex>=0) {
    const node=mountainNodes[junctionIndex],edgeDistance=Math.max(Math.abs(x-node.x),Math.abs(z-node.z))/7;
    const w=0.16*Math.pow(Math.max(0,1-edgeDistance),2);
    weightedY+=node.y*w; weightSum+=w;
  }
  if(weightSum>1e-8) return weightedY/weightSum;
  if(junctionIndex>=0) return mountainNodes[junctionIndex].y;
  return null;
}
let maxLateralTrailStep=0;
for(let i=0;i<mountainSegments.length;i++) {
  const seg=mountainSegments[i],dx=seg.b.x-seg.a.x,dz=seg.b.z-seg.a.z,len=Math.hypot(dx,dz)||1;
  for(const offset of [-6.2,-4,0,4,6.2]) {
    let previous=null;
    for(let k=0;k<=200;k++) {
      const t=k/200,x=seg.a.x+dx*t-dz/len*offset,z=seg.a.z+dz*t+dx/len*offset;
      const y=simulatedMountainSurface(x,z);
      if(y===null) throw new Error(`Blue Ridge has an unsupported ramp point on segment ${i+1}, lane ${offset}, t=${t.toFixed(2)}.`);
      if(previous!==null) maxLateralTrailStep=Math.max(maxLateralTrailStep,Math.abs(y-previous));
      previous=y;
    }
  }
}
if(maxLateralTrailStep>0.15) throw new Error(`Blue Ridge ramp surface has a ${maxLateralTrailStep.toFixed(2)}-unit lateral seam step; maximum allowed is 0.15.`);
const ridgeMatch = gameSource.match(/const ridgePeaks = \[([\s\S]*?)\];/);
const ridgeRows = ridgeMatch ? [...ridgeMatch[1].matchAll(/\[([-\d.]+),([-\d.]+),([\d.]+),([\d.]+)\]/g)].map(m=>({x:+m[1],z:+m[2],r:+m[3]})) : [];
if(ridgeRows.length<8 || !/rx:r\*1\.22, rz:r\*0\.76, topY:h-0\.8/.test(gameSource)) throw new Error('Blue Ridge rock collision must cover the visible mountain footprint.');
for (const ridge of ridgeRows) {
  const q = ((mountainMagnetPoint.x-ridge.x)/(ridge.r*1.22))**2 + ((mountainMagnetPoint.z-ridge.z)/(ridge.r*0.76))**2;
  if (q < 1.03) throw new Error('Blue Ridge magnet must be reachable on the ground and outside solid mountain footprints.');
}
for(const seg of mountainSegments) for(let i=0;i<=60;i++) for(const off of [-6.2,0,6.2]) {
  const t=i/60,dx=seg.b.x-seg.a.x,dz=seg.b.z-seg.a.z,len=Math.hypot(dx,dz)||1;
  const x=seg.a.x+dx*t-dz/len*off,z=seg.a.z+dz*t+dx/len*off;
  for(const ridge of ridgeRows) {
    const q=((x-ridge.x)/(ridge.r*1.22))**2+((z-ridge.z)/(ridge.r*0.76))**2;
    if(q<1.03) throw new Error(`Solid mountain ridge blocks walkable trail lane at (${x.toFixed(1)},${z.toFixed(1)}).`);
  }
}
const mountainPads = [...gameSource.matchAll(/addMountainTrampoline\(([-\d.]+),\s*([-\d.]+)/g)].map(m=>({x:+m[1],z:+m[2]}));
if(mountainPads.length!==3 || !gameSource.includes('addMountainTrampoline(6.02, 71.70') || !gameSource.includes('addMountainTrampoline(2.80, 8.00') || !gameSource.includes('addMountainTrampoline(9.00, -83.66')) throw new Error('Blue Ridge must have three separate ground-level trampolines at the start, middle, and end of the trail.');
function segmentDistance(px,pz,seg) { const dx=seg.b.x-seg.a.x,dz=seg.b.z-seg.a.z,l2=dx*dx+dz*dz||1; const t=Math.max(0,Math.min(1,((px-seg.a.x)*dx+(pz-seg.a.z)*dz)/l2)); return Math.hypot(px-(seg.a.x+dx*t),pz-(seg.a.z+dz*t)); }
const padSegmentDistances = mountainPads.map(p=>mountainSegments.map(seg=>segmentDistance(p.x,p.z,seg)));
const padNearest = padSegmentDistances.map(ds=>Math.min(...ds));
const padNearestSegment = padSegmentDistances.map(ds=>ds.indexOf(Math.min(...ds)));
if(padNearest.some(d=>d<6.9 || d>8.5) || !(padNearestSegment[0]<=1 && padNearestSegment[1]>=2 && padNearestSegment[1]<=5 && padNearestSegment[2]>=6)) {
  throw new Error(`Mountain trampolines must be ground-level, just outside the trail edge (6.9–8.5 units away), and distributed start/middle/end; distances ${padNearest.map(x=>x.toFixed(1)).join('/')}, segments ${padNearestSegment.join('/')}.`);
}
if (!/group\.position\.set\(x, 0, z\); mountainWorld\.add\(group\)/.test(gameSource)) throw new Error('Mountain trampolines must be placed at ground level.');
const replayGuards = [
  [gameSource.includes('function createReplayMintCopies()'), 'second-run mint cloning'],
  [gameSource.includes('return standard * (replayMode ? 2 : 1)'), 'second-run completion goals double'],
  [gameSource.includes("cloneSet(pearls, scene, 'meadow');") && gameSource.includes("cloneSet(waterMints, waterWorld, 'water');") && gameSource.includes("cloneSet(bridgeMints, bridgeWorld, 'bridge');") && gameSource.includes("cloneSet(mountainMints, mountainWorld, 'mountain');"), 'all stages double their mint pools'],
];
for (const [ok, description] of replayGuards) if (!ok) throw new Error(`Missing progression regression guard: ${description}`);
const replayAvailable = [((Math.ceil(50*1.2) + 44) * 2), Math.ceil(50*1.2)*2, Math.ceil(60*1.2)*2, Math.ceil(70*1.2)*2];
const replayRequired = [50*2, 50*2, 60*2, 70*2];
if (replayAvailable.join('/') !== '208/120/144/168' || replayRequired.join('/') !== '100/100/120/140') throw new Error('Second-run mint availability and required goals must both double again.');

if (!/function splitInstancedMeshByDistance\(/.test(gameSource) ||
    !/function updateSpatialChunkLOD\(/.test(gameSource) ||
    !/meadowBlades = splitInstancedMeshByDistance/.test(gameSource) ||
    !/stoneInstances = splitInstancedMeshByDistance/.test(gameSource) ||
    !/pebbleInstances = splitInstancedMeshByDistance/.test(gameSource) ||
    !/waterRocks = splitInstancedMeshByDistance/.test(gameSource) ||
    !/function updateFriendDistanceLOD\(/.test(gameSource) ||
    !/const range = touchGpuProfile \? 30 : 42/.test(gameSource) ||
    !/const updateRange = touchGpuProfile \? 26 : 38/.test(gameSource) ||
    !/registerStageObjectCull\(group, 'bridge', 52, 70\)/.test(gameSource) ||
    /registerStageObjectCull\(ramp, 'mountain'/.test(gameSource) ||
    /registerStageObjectCull\(mesh, 'mountain'/.test(gameSource) ||
    /registerStageObjectCull\(ridge, 'mountain'/.test(gameSource) ||
    /registerStageObjectCull\(cap, 'mountain'/.test(gameSource) ||
    !/ridge\.userData\.backgroundMountain = true; ridge\.userData\.neverDistanceCull = true; ridge\.frustumCulled = false/.test(gameSource) ||
    !/cap\.userData\.backgroundMountain = true; cap\.userData\.neverDistanceCull = true; cap\.frustumCulled = false/.test(gameSource) ||
    /registerStageObjectCull\(rock, 'mountain'/.test(gameSource) ||
    !/registerStageObjectCull\(trunk, 'bridge', 36, 52\)/.test(gameSource)) {
  throw new Error('Distant non-target scenery must be spatially clipped while floors and mint collectibles remain available.');
}
if (!gameSource.includes('scene.add(safetyGround);') ||
    /registerStageObjectCull\((?:safetyGround|meadowBase|meadow|pearls|waterMints|bridgeMints|mountainMints)\b/i.test(gameSource) ||
    /(?:pearls|waterMints|bridgeMints|mountainMints)\s*=\s*splitInstancedMeshByDistance/.test(gameSource)) {
  throw new Error('The background floor and all target mint collections must remain available even when distant scenery is clipped.');
}
if (!/clearAwaitingTap: false, pendingClearTarget: null/.test(gameSource) ||
    !/state\.clearAwaitingTap = true; state\.pendingClearTarget = f\.targetWorld/.test(gameSource) ||
    !/if \(state\.clearAwaitingTap\)/.test(gameSource) ||
    !/Choose a world to replay/.test(gameSource) ||
    !/Continue to Water World/.test(gameSource)) {
  throw new Error('A clear-result screen must wait for an explicit tap before moving on.');
}

const indexSource = await readFile(path.join(root, 'index.html'), 'utf8');
if (!indexSource.includes('id="welcome-mint-required">50</span>') || !indexSource.includes('id="welcome-mint-available">104</b>') || !/function updateWelcomeMintGoal\(\)/.test(gameSource) || !/updateWelcomeMintGoal\(\);/.test(gameSource)) throw new Error('Start screen must show the current meadow mint goal and available count.');
if (!indexSource.includes('208 mints available · collect 100 · counter resets') || !indexSource.includes('120 mints available · collect 100 · counter resets') || !indexSource.includes('144 mints available · collect 120 · counter resets') || !indexSource.includes('168 mints available · collect 140 · counter resets')) throw new Error('Replay selector must explain the doubled mint counts and goals.');
if (!/new Float32Array\(560 \* 3\)/.test(gameSource) || /(?<!new )Float32Array\(560 \* 3\)/.test(gameSource)) {
  throw new Error('Underwater particle position buffer must use the Float32Array constructor with new.');
}
if (!indexSource.includes('id=\"fullscreen-toggle\"') || !indexSource.includes('id=\"welcome-fullscreen-toggle\"') || !indexSource.includes('requestFullscreen') || !indexSource.includes('fullscreenchange')) {
  throw new Error('Fullscreen toggle and change-state handling must be present.');
}
if (!indexSource.includes('id=\"stage-continue-button\"') || !gameSource.includes('waiting-for-stage-tap')) {
  throw new Error('New-world arrival must include a working, tappable continue button.');
}

const startClickBlock = indexSource.match(/button\.addEventListener\('click', event => \{([\s\S]*?)\n      \}\);/);
if (!indexSource.includes('class="welcome-fullscreen-callout"') ||
    indexSource.indexOf('welcome-fullscreen-callout') > indexSource.indexOf('id="start-button"') ||
    !/const\s+requestFullscreenFromStartGesture\s*=/.test(indexSource) ||
    !startClickBlock || !/requestFullscreenFromStartGesture\(\)/.test(startClickBlock[1]) ||
    !/app\.classList\.add\('pseudo-fullscreen'\)/.test(indexSource)) {
  throw new Error('Welcome screen must prominently offer fullscreen and request it from the Start click with a fallback.');
}
// Preserve each panel's original opacity. Only the mobile touch-control surfaces use the later
// translucent treatment; panels that were already glass remain glass, while dialogue stays at
// its original 96% cream background.
if (!styleSource.includes('--glass: rgba(252, 255, 249, .9);') ||
    !styleSource.includes('background: rgba(250,255,251,.76)') ||
    !styleSource.includes('background: rgba(250,255,249,.63)') ||
    !styleSource.includes('background: rgba(8,18,28,.46)') ||
    !styleSource.includes('background: rgba(249,255,249,.78)') ||
    !styleSource.includes('background: rgba(242,249,255,.13)') ||
    !styleSource.includes('background: rgba(255,254,247,.96) !important') ||
    !styleSource.includes('background: rgba(255,255,247,.92)') ||
    !styleSource.includes('rgba(13,67,92,.74), rgba(3,33,59,.64)') ||
    !styleSource.includes('rgba(255,255,255,.50), rgba(239,255,248,.23)') ||
    !styleSource.includes('rgba(255,250,248,.70)') ||
    styleSource.includes('/* OPAQUE INFORMATION PANELS') ||
    styleSource.includes('background: #fafffb !important') ||
    styleSource.includes('background: #08121c !important') ||
    styleSource.includes('background: rgba(255,255,247,.62) !important')) {
  throw new Error("UI must preserve each component's pre-change opacity; only mobile control overlays use the requested translucent styling.");
}
if (!/width: clamp\(150px, 40vh, 174px\); height: clamp\(150px, 40vh, 174px\)/.test(await readFile(path.join(root, 'src', 'style.css'), 'utf8')) ||
    !/width: clamp\(140px, 38vh, 166px\); height: clamp\(140px, 38vh, 166px\)/.test(await readFile(path.join(root, 'src', 'style.css'), 'utf8')) ||
    !/inset: auto 36px max\(12px, env\(safe-area-inset-bottom\)\) 36px/.test(await readFile(path.join(root, 'src', 'style.css'), 'utf8'))) {
  throw new Error('Landscape touch controls must be large and inset comfortably from both screen edges.');
}
if (!/desiredX=dx\/dist\*24\.0/.test(gameSource) ||
    !/if\(seaTurtle\.target\?\.collected\) seaTurtle\.target=null/.test(gameSource) ||
    !/seaTurtle\.group\.position\.set\(-5.5,0,2.3\)/.test(gameSource) ||
    !/const exitTurtle = worldMode === 'water' && targetWorld === 'bridge' && state\.ridingTurtle/.test(gameSource) ||
    !/state\.finale\.exitDuration = exitTurtle \? 1\.35 : 0/.test(gameSource) ||
    !/const exitDuration = f\.exitTurtle \? f\.exitDuration : 0/.test(gameSource) ||
    !/const hopDuration = 0\.55/.test(gameSource) ||
    !/state\.ridingTurtle = false/.test(gameSource) ||
    !/const shellPattern = new THREE\.CanvasTexture\(shellCanvas\)/.test(gameSource) ||
    !/if\(state\.ridingTurtle && !state\.finale\.active\)/.test(gameSource)) {
  throw new Error('Water turtle must spawn near the player, follow a locked target quickly, collect mint by shell contact, and use a textured shell.');
}
if (!/const seaMintSpots = \[\.\.\.baseSeaMintSpots, \.\.\.baseSeaMintSpots\.map/.test(gameSource) || !/parallel sweep makes the path vague and exploratory/.test(gameSource)) {
  throw new Error('Water mint layout must remain a sparse, vague diagonal route.');
}
if (!/function addCherry\(root, scale = 1, withFlashlight = false\)/.test(gameSource) ||
    !/if \(withFlashlight\)/.test(gameSource) ||
    !/root\.userData\.cherryFlashlightLensMaterial = lensMaterial/.test(gameSource) ||
    !/playerFlashlightTarget\.position\.set\(0, -0\.08, 7\.4\)/.test(gameSource) ||
    !/const playerFlashlight = new THREE\.SpotLight\('#fff0c1', 0, 14, 0\.50, 0\.68, 1\.25\)/.test(gameSource) ||
    !/playerFlashlight\.intensity = blend \* 72/.test(gameSource) ||
    !/const FLASHLIGHT_BEAM_LENGTH = 6\.2/.test(gameSource) ||
    !/const FLASHLIGHT_BEAM_TILT = 0\.32/.test(gameSource) ||
    !/new THREE\.ConeGeometry\(3\.4, FLASHLIGHT_BEAM_LENGTH, 32, 1, true\)/.test(gameSource) ||
    !/playerFlashlightBeam\.rotation\.x = -Math\.PI \/ 2 \+ FLASHLIGHT_BEAM_TILT/.test(gameSource) ||
    !/playerFlashlightBeamMaterial\.opacity = blend \* 0\.13/.test(gameSource) ||
    !/function updatePlayerFlashlight\(dt, now\)/.test(gameSource) ||
    !/const shouldBeOn = nightWeight > 0/.test(gameSource) ||
    !/updatePlayerFlashlight\(dt, now\)/.test(gameSource) ||
    !/playerFlashlightBeam\.position\.y = 2\.04 - \(FLASHLIGHT_BEAM_LENGTH \* 0\.5 \* Math\.sin\(FLASHLIGHT_BEAM_TILT\) \* blend\)/.test(gameSource) ||
    !/playerFlashlightBeam\.position\.z = 1\.06 \+ \(FLASHLIGHT_BEAM_LENGTH \* 0\.5 \* Math\.cos\(FLASHLIGHT_BEAM_TILT\) \* blend\)/.test(gameSource)) {
  throw new Error('The nighttime cherry flashlight must animate its lens and use a bright, downward-aimed real spotlight and matching forward beam.');
}
// Regression guard for the lighting bug: the axis to the target must angle down far enough
// that the spotlight intersects the floor within its configured range.
const flashlightTargetDrop = 2.04 - (-0.08);
const flashlightTargetRun = 7.4 - 1.06;
const flashlightAimAngle = Math.atan2(flashlightTargetDrop, flashlightTargetRun);
const flashlightBeamAngle = Math.atan2(3.4, 6.2);
if (flashlightAimAngle < 0.25 || flashlightAimAngle > 0.50 ||
    Math.abs(flashlightAimAngle - 0.32) > 0.06 || Math.abs(flashlightBeamAngle - 0.50) > 0.03 ||
    Math.hypot(flashlightTargetDrop, flashlightTargetRun) > 14) {
  throw new Error('Flashlight aim/cone mismatch: the visible beam and real spotlight must reach and illuminate the floor ahead.');
}
console.log('Cherry flashlight verified: dusk activation, downward ground aim, sufficient spotlight intensity, and matching visible cone.');
const turtleStartMatch = gameSource.match(/const group = new THREE\.Group\(\); group\.position\.set\(([-\d.]+), 0, ([-\d.]+)\); waterWorld\.add\(group\);/);
if (!turtleStartMatch) throw new Error('Water World turtle must have an explicit spawn point.');
const turtleStartX = Number(turtleStartMatch[1]), turtleStartZ = Number(turtleStartMatch[2]);
const turtlePlayerSpawnDistance = Math.hypot(turtleStartX, turtleStartZ - 12);
if (turtlePlayerSpawnDistance < 10.5) throw new Error(`Turtle spawn is too close to the player spawn (${turtlePlayerSpawnDistance.toFixed(2)} units apart).`);
const cameraForwardDistance = ((-7.8 * turtleStartX) + (-13.8 * (turtleStartZ - 12))) / Math.hypot(7.8, 13.8);
if (cameraForwardDistance < 10.5) throw new Error(`Turtle must be far enough away and ahead in the actual chase-camera view (${cameraForwardDistance.toFixed(2)} projected units).`);
console.log(`Water World turtle spawn verified: ${turtlePlayerSpawnDistance.toFixed(2)} units from the player, ${cameraForwardDistance.toFixed(2)} units along the camera's forward view.`);
if (!/const exitDirections = \[/.test(gameSource) || !/exitTarget = \{[\s\S]*?turtleX \+ exitDirection\[0\] \* 7\.1/.test(gameSource) || !/walkY = THREE\.MathUtils\.lerp\(f\.exitStart\.y, 0, hopT\) \+ Math\.sin\(hopT \* Math\.PI\) \* 1\.75/.test(gameSource)) {
  throw new Error('Mint-goal dance while riding the turtle must first hop off, walk clear of the shell, and then start the celebration.');
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
console.log('Standard progression verified: Meadow 104 Fizz including 44 trampoline-arc bonuses (goal 50), Water 60 Seafoam Mints (goal 50), Bridge 72 Bridge Mints (goal 60), Blue Ridge 84 Fresh Mints (goal 70).');
console.log(`Final bridge jump verified: ${deckEdgeGap.toFixed(2)}-unit deck-edge gap, ${climbHeight.toFixed(2)}-unit rise; Sora is on the launch deck.`);
console.log(`Blue Ridge navigation verified across 5 lanes and 8 ramps; largest sampled support step ${maxLateralTrailStep.toFixed(3)} units.`);
console.log(`Mountain trampolines are ground-level just off the start/middle/end trail sections (nearest distances ${padNearest.map(x=>x.toFixed(1)).join(', ')} units). Mountain walls use full visible-footprint collision; friend spawns search supported safe points.`);
console.log('Second run verified: 208/120/144/168 mints available, with 100/100/120/140 required and collection counters reset.');
console.log('Build complete: dist/ contains the static GitHub Pages site.');
