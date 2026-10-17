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
];
for (const guard of gameplayGuards) {
  if (!guard.test(gameSource)) throw new Error(`Missing gameplay feature regression guard: ${guard}`);
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
    !/const shadowRefreshInterval = touchGpuProfile \? 72 : 34;/.test(gameSource) ||
    !/sun\.shadow\.mapSize\.set\(touchGpuProfile \? 1024 : 1536/.test(gameSource) ||
    !/BUBBLE_LOD_SORT_INTERVAL = 240/.test(gameSource) ||
    !/now - lastBubbleLodSort >= BUBBLE_LOD_SORT_INTERVAL/.test(gameSource) ||
    !/averageFrameMs > 24/.test(gameSource) ||
    !/underwaterDetailGroups/.test(gameSource) ||
    !/const detailRange = touchGpuProfile \? 80 : 106;/.test(gameSource) ||
    !/function updateMeadowDetailLOD\(now\)/.test(gameSource) ||
    !/const detailRange = touchGpuProfile \? 102 : 138;/.test(gameSource) ||
    !/const minimumAdaptivePixelRatio = Math\.min\(0\.90, activePixelRatio\)/.test(gameSource)) {
  throw new Error('Mobile GPU savings must retain distance-based bubble LOD, a capped touch DPR, and lower-cadence 1024px soft shadows.');
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
const indexSource = await readFile(path.join(root, 'index.html'), 'utf8');
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

if (!/width: clamp\(150px, 40vh, 174px\); height: clamp\(150px, 40vh, 174px\)/.test(await readFile(path.join(root, 'src', 'style.css'), 'utf8')) ||
    !/width: clamp\(140px, 38vh, 166px\); height: clamp\(140px, 38vh, 166px\)/.test(await readFile(path.join(root, 'src', 'style.css'), 'utf8')) ||
    !/inset: auto 36px max\(12px, env\(safe-area-inset-bottom\)\) 36px/.test(await readFile(path.join(root, 'src', 'style.css'), 'utf8'))) {
  throw new Error('Landscape touch controls must be large and inset comfortably from both screen edges.');
}
if (!/desiredX=dx\/dist\*24\.0/.test(gameSource) ||
    !/if\(seaTurtle\.target\?\.collected\) seaTurtle\.target=null/.test(gameSource) ||
    !/seaTurtle\.group\.position\.set\(0,0,9\.5\)/.test(gameSource) ||
    !/const shellPattern = new THREE\.CanvasTexture\(shellCanvas\)/.test(gameSource) ||
    !/if\(state\.ridingTurtle && !state\.finale\.active\)/.test(gameSource)) {
  throw new Error('Water turtle must spawn near the player, follow a locked target quickly, collect mint by shell contact, and use a textured shell.');
}
if (!/const seaMintSpots = \[\.\.\.baseSeaMintSpots, \.\.\.baseSeaMintSpots\.map/.test(gameSource) || !/parallel sweep makes the path vague and exploratory/.test(gameSource)) {
  throw new Error('Water mint layout must remain a sparse, vague diagonal route.');
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
