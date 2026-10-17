import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// クリームソーダうみうし — a free-roaming 3D plush friendship meadow.
// Movement is player-driven on X/Z; Y follows gravity and the shared jump action.
const $ = (selector) => document.querySelector(selector);
const canvas = $('#game-canvas');
const touchGpuProfile = matchMedia('(pointer: coarse)').matches || matchMedia('(hover: none)').matches;
const renderPixelRatioCap = touchGpuProfile ? 1.28 : 1.6;
const shadowRefreshInterval = touchGpuProfile ? 72 : 34;
let activePixelRatio = Math.min(window.devicePixelRatio || 1, renderPixelRatioCap);
const minimumAdaptivePixelRatio = Math.min(0.90, activePixelRatio);
let averageFrameMs = 16.7;
let lastAdaptiveResolutionChange = 0;
const scene = new THREE.Scene();
let worldMode = 'meadow';
const MEADOW_MINT_REQUIREMENT = 50;
const WATER_MINT_REQUIREMENT = 50;
const BRIDGE_MINT_REQUIREMENT = 60;
const MOUNTAIN_MINT_REQUIREMENT = 70;
const MINT_CUSHION = 1.2;
const MEADOW_MINT_TOTAL = Math.ceil(MEADOW_MINT_REQUIREMENT * MINT_CUSHION);
const MEADOW_TRAMPOLINE_MINTS_PER_PAD = 11;
const MEADOW_TRAMPOLINE_MINT_COUNT = 4 * MEADOW_TRAMPOLINE_MINTS_PER_PAD;
const MEADOW_AVAILABLE_MINT_TOTAL = MEADOW_MINT_TOTAL + MEADOW_TRAMPOLINE_MINT_COUNT;
const WATER_MINT_TOTAL = Math.ceil(WATER_MINT_REQUIREMENT * MINT_CUSHION);
const BRIDGE_MINT_TOTAL = Math.ceil(BRIDGE_MINT_REQUIREMENT * MINT_CUSHION);
const MOUNTAIN_MINT_TOTAL = Math.ceil(MOUNTAIN_MINT_REQUIREMENT * MINT_CUSHION);
scene.background = new THREE.Color('#d5f8f1');
scene.fog = new THREE.Fog('#d5f8f1', 82, 178);

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(activePixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight, false);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.13;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
// Keep detailed, soft shadows. Refresh at about 14 Hz on touch devices and 29 Hz on desktop;
// the retained shadow-map resolution keeps edges soft while avoiding a full shadow render per frame.
renderer.shadowMap.autoUpdate = false;
renderer.shadowMap.needsUpdate = true;
let lastShadowRefresh = 0;

const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 360);
const hemi = new THREE.HemisphereLight('#f8fffc', '#69a99c', 2.0);
scene.add(hemi);
const sun = new THREE.DirectionalLight('#fff5e8', 3.0);
sun.position.set(-35, 65, 32);
sun.castShadow = true;
sun.shadow.mapSize.set(touchGpuProfile ? 1024 : 1536, touchGpuProfile ? 1024 : 1536);
sun.shadow.camera.left = -90;
sun.shadow.camera.right = 90;
sun.shadow.camera.top = 90;
sun.shadow.camera.bottom = -90;
sun.shadow.camera.near = 1;
sun.shadow.camera.far = 220;
sun.shadow.bias = -0.0002;
scene.add(sun);
const fillLight = new THREE.DirectionalLight('#bafff3', 1.2);
fillLight.position.set(25, 22, -45);
scene.add(fillLight);
// The moon has its own phase-dependent light; it becomes the dominant light source at night.
const moonTarget = new THREE.Object3D();
scene.add(moonTarget);
const moonLight = new THREE.DirectionalLight('#c8dcff', 0);
moonLight.target = moonTarget;
moonLight.castShadow = false;
scene.add(moonLight);
let moonMesh = null, moonMaterial = null;
let lunarPhase = 0, moonIllumination = 0, nightWeight = 0;
let currentLocalHour = new Date().getHours() + new Date().getMinutes() / 60;
const skyBaseColor = new THREE.Color('#65bff1');
const skyBaseFogColor = new THREE.Color('#c3e7f2');
const skyBaseLowerColor = new THREE.Color('#a5d8e4');
let baseSunIntensity = 2.55;
let nextCloudVisualUpdate = 0;
let lastWeatherAudioUpdate = 0;

// A canvas-textured sky dome gives a real equirectangular gradient on every mobile GPU.
// The previous shader path could collapse to a flat fallback on some devices, so the
// entire colour ramp and cloud field are now rasterised into a small local texture.
const skyGeometry = new THREE.SphereGeometry(340, 64, 40);
const skyUniforms = {
  uTop: { value: new THREE.Color('#65bff1') },
  uHorizon: { value: new THREE.Color('#c3e7f2') },
  uLower: { value: new THREE.Color('#a5d8e4') },
  uCloudiness: { value: 0.28 },
  uTime: { value: 0 },
  uNight: { value: 0 },
};
const skyCanvas = document.createElement('canvas');
skyCanvas.width = 1536; skyCanvas.height = 768;
const skyContext = skyCanvas.getContext('2d', { alpha: false });
if (!skyContext) throw new Error('Could not create the sky texture canvas.');
const skyTexture = new THREE.CanvasTexture(skyCanvas);
skyTexture.colorSpace = THREE.SRGBColorSpace;
skyTexture.wrapS = THREE.RepeatWrapping;
skyTexture.wrapT = THREE.ClampToEdgeWrapping;
skyTexture.generateMipmaps = true;
skyTexture.minFilter = THREE.LinearMipmapLinearFilter;
skyTexture.magFilter = THREE.LinearFilter;
let skyPaintSeed = 739391;
function updateSkyGradient(topColor, horizonColor, lowerColor) {
  const width = skyCanvas.width, height = skyCanvas.height;
  const css = (color) => `#${color.getHexString(THREE.SRGBColorSpace)}`;
  const gradient = skyContext.createLinearGradient(0, 0, 0, height);
  const horizonMid = horizonColor.clone().lerp(lowerColor, 0.28);
  const lowerBand = horizonColor.clone().lerp(lowerColor, 0.62);
  gradient.addColorStop(0, css(topColor));
  gradient.addColorStop(0.16, css(topColor.clone().lerp(horizonColor, 0.08)));
  gradient.addColorStop(0.31, css(topColor.clone().lerp(horizonColor, 0.24)));
  gradient.addColorStop(0.43, css(topColor.clone().lerp(horizonColor, 0.48)));
  gradient.addColorStop(0.51, css(horizonColor));
  gradient.addColorStop(0.60, css(horizonMid));
  gradient.addColorStop(0.72, css(lowerBand));
  gradient.addColorStop(1, css(lowerColor));
  skyContext.globalAlpha = 1;
  skyContext.globalCompositeOperation = 'source-over';
  skyContext.fillStyle = gradient;
  skyContext.fillRect(0, 0, width, height);

  // Soft sunrise/sunset glow is static between local-clock updates; cloud density and
  // sun visibility are handled by cheap material/lighting updates, not canvas uploads.
  const hour = currentLocalHour;
  const dawn = 1 - smooth01(5.0, 8.4, hour);
  const dusk = smooth01(16.4, 19.8, hour);
  const twilight = Math.max(dawn * smooth01(4.0, 5.4, hour), dusk);
  if (nightWeight < 0.55 && twilight > 0.08) {
    const glow = skyContext.createRadialGradient(width * 0.50, height * 0.52, 1, width * 0.50, height * 0.52, height * 0.34);
    glow.addColorStop(0, `rgba(255,${Math.round(180 + twilight * 38)},${Math.round(136 + twilight * 38)},${0.24 * twilight})`);
    glow.addColorStop(0.4, `rgba(255,176,150,${0.10 * twilight})`);
    glow.addColorStop(1, 'rgba(255,176,150,0)');
    skyContext.fillStyle = glow;
    skyContext.fillRect(0, 0, width, height);
  }
  skyTexture.needsUpdate = true;
}
const skyMaterial = new THREE.MeshBasicMaterial({
  map: skyTexture, side: THREE.BackSide, depthWrite: false, depthTest: false,
  fog: false, toneMapped: false,
});
const skyDome = new THREE.Mesh(skyGeometry, skyMaterial);
skyDome.frustumCulled = false; skyDome.renderOrder = -100; scene.add(skyDome);
// A low-cost star field sits just inside the sky shell and fades in after dusk.
const starPositions = new Float32Array(620 * 3);
let starSeed = 92751;
const starRandom = () => { starSeed = (starSeed * 1664525 + 1013904223) >>> 0; return starSeed / 4294967296; };
for (let i = 0; i < 620; i++) {
  const u = starRandom() * 2 - 1, a = starRandom() * Math.PI * 2, r = 333;
  const flat = Math.sqrt(Math.max(0, 1 - u * u));
  starPositions[i * 3] = r * flat * Math.cos(a);
  starPositions[i * 3 + 1] = r * u;
  starPositions[i * 3 + 2] = r * flat * Math.sin(a);
}
const starGeometry = new THREE.BufferGeometry();
starGeometry.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
const starMaterial = new THREE.PointsMaterial({ color: '#e6eeff', size: 1.45, sizeAttenuation: false, transparent: true, opacity: 0, depthWrite: false, depthTest: true, fog: false });
const starPoints = new THREE.Points(starGeometry, starMaterial);
starPoints.frustumCulled = false; starPoints.renderOrder = -90; skyDome.add(starPoints);

// Visible celestial props live on the camera-centred sky shell. Low cloud banks
// change density over time, so clear midday can show the sun while overcast days feel soft.
let sunDiscMesh = null, sunGlowMesh = null;
let underwaterRayMaterial = null;
const cloudClusters = [];
let skyCloudiness = 0.12;
let targetSkyCloudiness = 0.12;
let skyMoodName = 'scattered clouds';
let weatherInitialized = false;
let nextSkyMoodAt = performance.now() + 48000 + Math.random() * 42000;
const sunDiscMaterial = new THREE.MeshBasicMaterial({ color: '#fff6cc', transparent: true, opacity: 1, depthWrite: false, toneMapped: false, fog: false });
const sunGlowMaterial = new THREE.MeshBasicMaterial({ color: '#ffd58c', transparent: true, opacity: 0.26, depthWrite: false, toneMapped: false, fog: false, blending: THREE.AdditiveBlending });
sunGlowMesh = new THREE.Mesh(new THREE.SphereGeometry(9.0, 24, 16), sunGlowMaterial);
sunDiscMesh = new THREE.Mesh(new THREE.SphereGeometry(4.1, 32, 24), sunDiscMaterial);
sunGlowMesh.frustumCulled = false; sunDiscMesh.frustumCulled = false;
sunGlowMesh.renderOrder = -95; sunDiscMesh.renderOrder = -94;
skyDome.add(sunGlowMesh, sunDiscMesh);
const cloudBlobGeometry = new THREE.SphereGeometry(1, 16, 10);
const cloudMats = ['#fbfdff', '#f4f8ff', '#ffffff'].map(color => new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.88, depthWrite: false, fog: false, side: THREE.DoubleSide, toneMapped: false }));
const cloudDayColor = new THREE.Color('#f5fbff');
const cloudNightColor = new THREE.Color('#39455d');
const cloudOvercastColor = new THREE.Color('#a8b5c5');
const cloudShadeColor = new THREE.Color('#72849d');
const skyDirectionScratch = new THREE.Vector3();
const overcastSkyLand = new THREE.Color('#abb9c8');
const overcastFogLand = new THREE.Color('#c5d1dc');
const overcastSkyWater = new THREE.Color('#668b9c');
const overcastFogWater = new THREE.Color('#6da8b4');
const overcastSkyMountain = new THREE.Color('#9aafbd');
const overcastFogMountain = new THREE.Color('#bccbd5');
let skyCloudSeed = 62491;
function skyRand() { skyCloudSeed = (skyCloudSeed * 1664525 + 1013904223) >>> 0; return skyCloudSeed / 4294967296; }
for (let i = 0; i < 26; i++) {
  const cluster = new THREE.Group();
  const clusterMaterial = cloudMats[Math.floor(skyRand() * cloudMats.length)].clone();
  clusterMaterial.opacity = 0;
  const puffCount = 4 + Math.floor(skyRand() * 4);
  const puffGeometries = [];
  for (let j = 0; j < puffCount; j++) {
    const puffGeometry = cloudBlobGeometry.clone();
    const puffPosition = new THREE.Vector3((skyRand() - 0.5) * 13, (skyRand() - 0.5) * 2.8, (skyRand() - 0.5) * 3.2);
    const puffScale = new THREE.Vector3(4.0 + skyRand() * 6.5, 1.7 + skyRand() * 1.45, 2.4 + skyRand() * 3.2);
    puffGeometry.applyMatrix4(new THREE.Matrix4().compose(puffPosition, new THREE.Quaternion(), puffScale));
    puffGeometries.push(puffGeometry);
  }
  // Merge all puffs into one draw call per cloud cluster. This keeps the same
  // rounded silhouette and smooth material fading while helping mobile GPUs.
  const mergedCloudGeometry = mergeGeometries(puffGeometries, false);
  for (const geometry of puffGeometries) geometry.dispose();
  mergedCloudGeometry.computeBoundingSphere();
  cluster.add(new THREE.Mesh(mergedCloudGeometry, clusterMaterial));
  const angle = skyRand() * Math.PI * 2;
  const radius = 143 + skyRand() * 47;
  cluster.position.set(Math.cos(angle) * radius, 23 + skyRand() * 42, Math.sin(angle) * radius);
  cluster.userData = { roll: (skyRand() - 0.5) * 0.035, sway: skyRand() * Math.PI * 2, homeX: cluster.position.x, threshold: skyRand(), material: clusterMaterial, baseOpacity: 0.78 };
  cluster.visible = false;
  skyDome.add(cluster); cloudClusters.push(cluster);
}
cloudBlobGeometry.dispose();
function chooseSkyMood(now = performance.now()) {
  const isWeatherTransition = weatherInitialized && weather && (weather.phase === 'gathering' || weather.phase === 'active' || weather.phase === 'clearing');
  if (isWeatherTransition && weather.phase === 'gathering') {
    targetSkyCloudiness = weather.pendingKind === 'rain' ? 0.90 : (weather.windCloudTarget ?? 0.42);
    skyMoodName = weather.pendingKind === 'rain' ? 'clouds gathering before a shower' : 'wind-blown clouds gathering';
  } else if (isWeatherTransition && weather.phase === 'active' && weather.kind === 'rain') {
    targetSkyCloudiness = 0.93 + Math.random() * 0.05; skyMoodName = 'rain clouds';
  } else if (isWeatherTransition && weather.phase === 'active' && weather.kind === 'wind') {
    targetSkyCloudiness = weather.windCloudTarget ?? 0.4; skyMoodName = 'wind-blown clouds';
  } else if (isWeatherTransition && weather.phase === 'clearing') {
    targetSkyCloudiness = 0.035 + Math.random() * 0.11; skyMoodName = 'clouds clearing';
  } else {
    const r = Math.random();
    if (r < 0.34) { skyMoodName = 'clear skies'; targetSkyCloudiness = 0.025 + Math.random() * 0.12; }
    else if (r < 0.78) { skyMoodName = 'scattered clouds'; targetSkyCloudiness = 0.30 + Math.random() * 0.24; }
    else { skyMoodName = 'overcast'; targetSkyCloudiness = 0.68 + Math.random() * 0.19; }
  }
  nextSkyMoodAt = now + 68000 + Math.random() * 62000;
  if (weatherInitialized) updateWeatherReadout();
}
function updateSkyActors(now = performance.now()) {
  if (now >= nextSkyMoodAt) chooseSkyMood(now);
  const daylight = 1 - nightWeight;
  // Keep the sun in the visible band of the camera-centred sky dome.
  const arc = THREE.MathUtils.clamp((currentLocalHour - 6) / 12, 0, 1) * Math.PI;
  const altitude = Math.sin(arc) * 0.19 + 0.035;
  const direction = skyDirectionScratch.set(-Math.cos(arc) * 0.88, altitude, -Math.sin(arc) * 0.88).normalize();
  sunDiscMesh.position.copy(direction).multiplyScalar(257);
  sunGlowMesh.position.copy(direction).multiplyScalar(251);
  const sunVisibility = daylight * (1 - smooth01(0.58, 0.96, skyCloudiness));
  sunDiscMesh.visible = daylight > 0.035 && skyCloudiness < 0.97 && worldMode !== 'water';
  sunDiscMaterial.opacity = sunVisibility;
  sunGlowMesh.visible = daylight > 0.02 && skyCloudiness < 0.99 && worldMode !== 'water';
  if (underwaterRayMaterial) {
    const rayDay = THREE.MathUtils.clamp(daylight, 0, 1) * (0.35 + 0.65 * Math.max(0, altitude));
    underwaterRayMaterial.opacity = worldMode === 'water' ? 0.74 * rayDay * (1 - THREE.MathUtils.smoothstep(skyCloudiness, 0.42, 0.9)) : 0;
  }
  skyUniforms.uTime.value = now;
  skyUniforms.uNight.value = nightWeight;
  sunGlowMaterial.opacity = (0.12 + altitude * 0.21) * (1 - skyCloudiness * 0.54);

  // Cloud clusters are positioned every frame, but their material work is throttled.
  // Unique per-cluster materials let opacity interpolate smoothly as coverage changes.
  if (now >= nextCloudVisualUpdate) {
    const cloudColor = nightWeight > 0.45 ? cloudNightColor : (skyCloudiness > 0.65 ? cloudOvercastColor : cloudDayColor);
    for (const cloud of cloudClusters) {
      const coverage = smooth01(cloud.userData.threshold - 0.15, cloud.userData.threshold + 0.22, skyCloudiness);
      cloud.visible = worldMode !== 'water' && coverage > 0.006;
      cloud.userData.material.color.copy(cloudColor).lerp(cloudShadeColor, Math.max(0, skyCloudiness - 0.62) * 0.48);
      cloud.userData.material.opacity = cloud.userData.baseOpacity * coverage * (nightWeight > 0.45 ? 0.48 : 0.82 + skyCloudiness * 0.12);
    }
    nextCloudVisualUpdate = now + 180;
  }
  for (const cloud of cloudClusters) {
    cloud.position.x = cloud.userData.homeX + Math.sin(now * 0.000035 + cloud.userData.sway) * 3.8;
    cloud.rotation.z = Math.sin(now * 0.00012 + cloud.userData.sway) * 0.018 + cloud.userData.roll;
  }
}
function updateDynamicSky(dt, now) {
  const cloudRate = (weatherInitialized && (weather.phase === 'gathering' || weather.phase === 'clearing')) ? 0.062 : 0.026;
  skyCloudiness += (targetSkyCloudiness - skyCloudiness) * (1 - Math.exp(-cloudRate * dt));
  skyCloudiness = THREE.MathUtils.clamp(skyCloudiness, 0, 1);
  const overcastSky = worldMode === 'water' ? overcastSkyWater : (worldMode === 'mountain' ? overcastSkyMountain : overcastSkyLand);
  const overcastFog = worldMode === 'water' ? overcastFogWater : (worldMode === 'mountain' ? overcastFogMountain : overcastFogLand);
  scene.background.copy(skyBaseColor).lerp(overcastSky, skyCloudiness * 0.34);
  scene.fog.color.copy(skyBaseFogColor).lerp(overcastFog, skyCloudiness * 0.28);
  const tint = skyCloudiness;
  skyMaterial.color.setRGB(1 - tint * 0.17, 1 - tint * 0.12, 1 - tint * 0.055);
  sun.intensity = baseSunIntensity * (1 - skyCloudiness * 0.58);
}
// The sky and lighting follow the player's real local clock (not an accelerated game clock).
const daylightKeys = [
  { h: 0, sky: '#030714', fog: '#09111e', hemi: '#29344c', ground: '#101a19', sun: '#839bcf', sunI: 0.0, hemiI: 0.12, fillI: 0.025 },
  { h: 4.5, sky: '#10182d', fog: '#171f2d', hemi: '#635d7d', ground: '#1b241f', sun: '#a4a2d1', sunI: 0.025, hemiI: 0.18, fillI: 0.055 },
  { h: 6.5, sky: '#dcaeb7', fog: '#d9c3c4', hemi: '#f4d8d7', ground: '#617c6a', sun: '#ffc09d', sunI: 0.92, hemiI: 1.0, fillI: 0.35 },
  { h: 9, sky: '#65bff1', fog: '#c3e7f2', hemi: '#f1fbff', ground: '#60965a', sun: '#fff4df', sunI: 2.25, hemiI: 1.6, fillI: 0.7 },
  { h: 13, sky: '#54b8f0', fog: '#c9ecf8', hemi: '#f5fcff', ground: '#5a9253', sun: '#fff6e7', sunI: 2.55, hemiI: 1.7, fillI: 0.8 },
  { h: 16.5, sky: '#7dc8e8', fog: '#d0e8e8', hemi: '#fff3e3', ground: '#66945e', sun: '#ffe4c4', sunI: 1.8, hemiI: 1.45, fillI: 0.62 },
  { h: 18.5, sky: '#d58b98', fog: '#b47e86', hemi: '#d9b7c5', ground: '#354c3e', sun: '#ffad87', sunI: 0.7, hemiI: 0.72, fillI: 0.22 },
  { h: 20.5, sky: '#0a1028', fog: '#111a2a', hemi: '#454e75', ground: '#17201e', sun: '#929dcc', sunI: 0.012, hemiI: 0.15, fillI: 0.035 },
  { h: 24, sky: '#030714', fog: '#09111e', hemi: '#29344c', ground: '#101a19', sun: '#839bcf', sunI: 0.0, hemiI: 0.12, fillI: 0.025 },
];
const waterSkyValues = [
  ['#020a20','#08182e','#071927'], ['#122642','#284c66','#153448'], ['#b7cfe8','#b7d9e4','#2b6a75'],
  ['#42aeda','#8be4ec','#105f70'], ['#37addc','#82dfe9','#0e596c'], ['#69c7df','#a6dfe6','#145768'],
  ['#d7839f','#c59ab9','#153f52'], ['#142341','#27445d','#0a2a40'], ['#020a20','#08182e','#071927'],
];
const waterDaylightKeys = daylightKeys.map((key, i) => ({
  ...key, sky: waterSkyValues[i][0], fog: waterSkyValues[i][1], ground: waterSkyValues[i][2],
  hemi: i < 2 || i === 7 || i === 8 ? '#233b5a' : '#b3f0f2',
  sunI: key.sunI * 0.55, hemiI: key.hemiI * 0.72, fillI: key.fillI * 0.72,
}));
const bridgeDaylightKeys = daylightKeys.map((key, i) => ({
  ...key,
  ground: ['#09150f','#14251d','#3e6e51','#4b8358','#4f8652','#526e48','#303c2e','#101d16','#09150f'][i],
  hemi: ['#1b2a27','#5b716a','#e3d8d3','#e4f3e2','#e3f5dd','#e8e2cf','#c7adb0','#384d43','#1b2a27'][i],
}));
const mountainDaylightKeys = daylightKeys.map((key, i) => ({
  ...key,
  sky: ['#030917','#111d31','#b6cbd9','#7eb0d8','#78add9','#8aaec9','#d79d91','#101b31','#030917'][i],
  fog: ['#0a1421','#203244','#d2d9db','#b2c9d9','#b4cddd','#c6d0d2','#c79b98','#19283a','#0a1421'][i],
  ground: ['#182b31','#2b414b','#688b85','#547d82','#4f7680','#607c7c','#424c50','#24353d','#182b31'][i],
  hemi: ['#1f2b3e','#73818e','#e6e7e3','#d6e5ee','#dcebf1','#ede0d8','#cdb3af','#394859','#1f2b3e'][i],
}));
const SYNODIC_MONTH_DAYS = 29.530588853;
const KNOWN_NEW_MOON_UTC = Date.UTC(2000, 0, 6, 18, 14);
function lunarInfo(now = new Date()) {
  const ageDays = ((now.getTime() - KNOWN_NEW_MOON_UTC) / 86400000 % SYNODIC_MONTH_DAYS + SYNODIC_MONTH_DAYS) % SYNODIC_MONTH_DAYS;
  const phase = ageDays / SYNODIC_MONTH_DAYS;
  const illumination = (1 - Math.cos(phase * Math.PI * 2)) * 0.5;
  let name;
  if (phase < 0.035 || phase >= 0.965) name = 'New moon';
  else if (phase < 0.22) name = 'Waxing crescent';
  else if (phase < 0.28) name = 'First quarter';
  else if (phase < 0.47) name = 'Waxing gibbous';
  else if (phase < 0.53) name = 'Full moon';
  else if (phase < 0.72) name = 'Waning gibbous';
  else if (phase < 0.78) name = 'Last quarter';
  else name = 'Waning crescent';
  return { phase, illumination, name };
}
function smooth01(edge0, edge1, value) {
  const x = THREE.MathUtils.clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return x * x * (3 - 2 * x);
}
function localNightAmount(hour) {
  if (hour < 5.15) return 1;
  if (hour < 7.0) return 1 - smooth01(5.15, 7.0, hour);
  if (hour < 18.35) return 0;
  if (hour < 20.6) return smooth01(18.35, 20.6, hour);
  return 1;
}
function applyLocalTime() {
  const now = new Date();
  const hour = now.getHours() + now.getMinutes() / 60 + now.getSeconds() / 3600;
  currentLocalHour = hour;
  const lunar = lunarInfo(now);
  lunarPhase = lunar.phase;
  moonIllumination = lunar.illumination;
  nightWeight = localNightAmount(hour);
  const clockText = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
  $('#broadcast-time').textContent = clockText;
  const dateNode = $('#broadcast-date');
  if (dateNode) dateNode.textContent = `${now.getMonth() + 1}月${now.getDate()}日`;
  const moonIcon = lunarPhase < 0.04 || lunarPhase > 0.96 ? '●' : (lunarPhase < 0.5 ? '☽' : '☾');
  $('#moon-readout').textContent = `${moonIcon} ${lunar.name} · ${Math.round(moonIllumination * 100)}%`;
  if (weatherInitialized) updateWeatherReadout();
  const keys = worldMode === 'water' ? waterDaylightKeys : (worldMode === 'bridge' ? bridgeDaylightKeys : (worldMode === 'mountain' ? mountainDaylightKeys : daylightKeys));
  let left = keys[0], right = keys[keys.length - 1];
  for (let i = 0; i < keys.length - 1; i++) {
    if (hour >= keys[i].h && hour < keys[i + 1].h) { left = keys[i]; right = keys[i + 1]; break; }
  }
  const t = THREE.MathUtils.clamp((hour - left.h) / Math.max(0.001, right.h - left.h), 0, 1);
  const mixColor = (a, b) => new THREE.Color(a).lerp(new THREE.Color(b), t);
  const skyColor = mixColor(left.sky, right.sky);
  const fogColor = mixColor(left.fog, right.fog);
  const lowerColor = mixColor(left.ground, right.ground);
  skyBaseColor.copy(skyColor);
  skyBaseFogColor.copy(fogColor);
  scene.background.copy(skyBaseColor);
  scene.fog.color.copy(skyBaseFogColor);
  const dawnWeight = smooth01(4.6, 6.8, hour) * (1 - smooth01(7.0, 8.8, hour));
  const duskWeight = smooth01(16.1, 18.3, hour) * (1 - smooth01(19.0, 21.0, hour));
  const twilightWeight = Math.max(dawnWeight, duskWeight);
  let lowerAtmosphere;
  if (nightWeight > 0.55) {
    lowerAtmosphere = new THREE.Color(worldMode === 'water' ? '#102b46' : (worldMode === 'bridge' ? '#17251f' : (worldMode === 'mountain' ? '#111c2d' : '#11182e')));
  } else if (twilightWeight > 0.04) {
    const warmDawn = new THREE.Color('#f3bdc5');
    const warmDusk = new THREE.Color('#ef9a91');
    lowerAtmosphere = warmDawn.lerp(warmDusk, duskWeight / Math.max(0.001, dawnWeight + duskWeight));
    if (worldMode === 'water') lowerAtmosphere.lerp(new THREE.Color('#8acbd9'), 0.28);
    if (worldMode === 'bridge') lowerAtmosphere.lerp(new THREE.Color('#c8aa9b'), 0.22);
    if (worldMode === 'mountain') lowerAtmosphere.lerp(new THREE.Color('#a2bed0'), 0.16);
  } else {
    lowerAtmosphere = new THREE.Color(worldMode === 'water' ? '#b4f0f1' : (worldMode === 'bridge' ? '#f0e7d8' : (worldMode === 'mountain' ? '#d4e4ee' : '#f3f7ff')));
  }
  skyBaseLowerColor.copy(lowerAtmosphere);
  updateSkyGradient(skyBaseColor.clone().multiplyScalar(nightWeight > 0.55 ? 0.74 : 0.86), skyBaseFogColor, skyBaseLowerColor);
  updateSkyActors(performance.now());
  hemi.color.copy(mixColor(left.hemi, right.hemi));
  hemi.groundColor.copy(lowerColor);
  sun.color.copy(mixColor(left.sun, right.sun));
  baseSunIntensity = THREE.MathUtils.lerp(left.sunI, right.sunI, t);
  sun.intensity = baseSunIntensity * (1 - skyCloudiness * 0.58);
  hemi.intensity = THREE.MathUtils.lerp(left.hemiI, right.hemiI, t);
  fillLight.intensity = THREE.MathUtils.lerp(left.fillI, right.fillI, t) * (1 - nightWeight * 0.55);
  const daylightAngle = ((hour - 6) / 12) * Math.PI;
  sun.position.set(Math.cos(daylightAngle) * 65, Math.max(7, Math.sin(daylightAngle) * 72), Math.sin(daylightAngle) * 60);
  moonLight.intensity = (worldMode === 'water' ? 0.16 : 0.48) * moonIllumination * nightWeight;
  starMaterial.opacity = 0.92 * nightWeight;
  if (moonMaterial) {
    moonMaterial.uniforms.uPhase.value = lunarPhase;
    moonMaterial.uniforms.uNight.value = nightWeight;
  }
}
applyLocalTime();
let nextLocalTimeCheck = performance.now() + (60 - new Date().getSeconds()) * 1000;
function updateCelestialBodies() {
  if (!moonMesh) return;
  if (worldMode === 'water') { moonMesh.visible = false; return; }
  // Approximate lunar transit from phase: new moon near solar transit, full moon about
  // twelve hours later. The phase is astronomical (UTC-date based), while clock/sky use local time.
  const transit = (12 + lunarPhase * 24) % 24;
  const hourOffset = ((currentLocalHour - transit + 36) % 24) - 12;
  const absOffset = Math.abs(hourOffset);
  const sinAltitude = absOffset <= 6
    ? Math.cos(absOffset / 6 * Math.PI / 2)
    : -Math.sin((absOffset - 6) / 6 * Math.PI / 2);
  const azimuth = (currentLocalHour / 24) * Math.PI * 2 - Math.PI / 2;
  const moonElevation = sinAltitude * 0.12 + 0.01;
  const direction = new THREE.Vector3(Math.cos(azimuth), moonElevation, Math.sin(azimuth)).normalize();
  moonMesh.position.copy(camera.position).addScaledVector(direction, 205);
  const towardCamera = camera.position.clone().sub(moonMesh.position).normalize();
  moonMesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), towardCamera);
  moonMesh.visible = nightWeight > 0.025 && moonIllumination > 0.006 && sinAltitude > -0.015;
  moonTarget.position.set(state.x, 0, state.z);
  moonLight.position.set(state.x + direction.x * 90, 2 + direction.y * 90, state.z + direction.z * 90);
}

const colors = {
  mint: '#52ddd5', mintShadow: '#3dbeb7', mintLight: '#a5fff5',
  ivory: '#fff8ef', red: '#ed4144', cherryDark: '#91252c',
  thread: '#153a2b', grass: '#82d9c3', ground: '#a2e9d8',
};
let seed = 27351;
function rand() { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; }
function choice(a) { return a[Math.floor(rand() * a.length)]; }

const textureLoader = new THREE.TextureLoader();
const anisotropy = Math.min(renderer.capabilities.getMaxAnisotropy(), 6);
function loadTexture(file, repeatX = 1, repeatY = 1, color = true) {
  const texture = textureLoader.load(`./assets/${file}`, undefined, undefined, (err) => console.warn(`Texture unavailable: ${file}`, err));
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeatX, repeatY);
  texture.anisotropy = anisotropy;
  if (color) texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
const mintFabric = loadTexture('fabric-mint.png', 2.3, 1.65);
const mintBump = loadTexture('fabric-mint-bump.png', 2.3, 1.65, false);
const ivoryFabric = loadTexture('fabric-ivory.png', 1.2, 1.5);
const ivoryBump = loadTexture('fabric-ivory-bump.png', 1.2, 1.5, false);
const cherryFabric = loadTexture('fabric-cherry.png', 1.6, 1.4);
const cherryBump = loadTexture('fabric-cherry-bump.png', 1.6, 1.4, false);
const platformMintTexture = loadTexture('platform-mint.png', 1.6, 1.6);
const platformMintBump = loadTexture('platform-mint-bump.png', 1.6, 1.6, false);
const meadowGrassTexture = loadTexture('meadow-grass.png', 44, 44);
const meadowGrassBump = loadTexture('meadow-grass-bump.png', 44, 44, false);
const barkTexture = loadTexture('bark-texture.png', 1.25, 2.1);
const barkBumpTexture = loadTexture('bark-bump.png', 1.25, 2.1, false);
const stoneTexture = loadTexture('stone-texture.png', 1.15, 1.15);
const stoneBumpTexture = loadTexture('stone-bump.png', 1.15, 1.15, false);
const woodEndTexture = loadTexture('wood-end-grain.png', 1, 1);
const woodEndBumpTexture = loadTexture('wood-end-bump.png', 1, 1, false);
const moonSurfaceTexture = loadTexture('moon-surface.png', 1, 1);
moonMaterial = new THREE.ShaderMaterial({
  transparent: true, depthWrite: false, side: THREE.FrontSide,
  uniforms: { uPhase: { value: lunarPhase }, uNight: { value: nightWeight }, uSurface: { value: moonSurfaceTexture } },
  vertexShader: `
    varying vec3 vNormalLocal;
    varying vec2 vUvMoon;
    void main() {
      vNormalLocal = normalize(normal);
      vUvMoon = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform float uPhase;
    uniform float uNight;
    uniform sampler2D uSurface;
    varying vec3 vNormalLocal;
    varying vec2 vUvMoon;
    void main() {
      vec3 n = normalize(vNormalLocal);
      float angle = uPhase * 6.28318530718;
      vec3 lightDir = normalize(vec3(sin(angle), 0.0, -cos(angle)));
      float terminator = dot(n, lightDir);
      float lit = smoothstep(-0.025, 0.035, terminator);
      vec3 surface = texture2D(uSurface, vUvMoon).rgb;
      float limbShade = 0.72 + 0.28 * max(0.0, n.z);
      vec3 colour = surface * (0.035 + 0.98 * lit) * limbShade;
      float alpha = uNight * (0.06 + 0.94 * lit);
      gl_FragColor = vec4(colour, alpha);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }
  `,
});
moonMesh = new THREE.Mesh(new THREE.SphereGeometry(2.4, 48, 32), moonMaterial);
moonMesh.frustumCulled = false; moonMesh.renderOrder = -80; moonMesh.visible = false; scene.add(moonMesh);
applyLocalTime();

const mintPlush = new THREE.MeshStandardMaterial({ map: mintFabric, bumpMap: mintBump, bumpScale: 0.095, roughness: 1, metalness: 0 });
const ivoryPlush = new THREE.MeshStandardMaterial({ map: ivoryFabric, bumpMap: ivoryBump, bumpScale: 0.075, roughness: 1 });
const cherryPlush = new THREE.MeshStandardMaterial({ map: cherryFabric, bumpMap: cherryBump, bumpScale: 0.085, roughness: 0.98 });
const eyeThread = new THREE.MeshStandardMaterial({ color: colors.thread, roughness: 1, side: THREE.DoubleSide });
const groundMat = new THREE.MeshStandardMaterial({ map: meadowGrassTexture, bumpMap: meadowGrassBump, bumpScale: 0.14, roughness: 1, metalness: 0 });

// One enormous uninterrupted floor: there are no gaps, pits, rails, death zones, or auto-forward forces.
const meadowBase = new THREE.Mesh(new RoundedBoxGeometry(224, 0.78, 224, 4, 0.35), new THREE.MeshStandardMaterial({ color: '#8fdbc9', roughness: 0.98 }));
meadowBase.position.y = -0.39;
meadowBase.receiveShadow = true;
scene.add(meadowBase);
const meadow = new THREE.Mesh(new THREE.PlaneGeometry(223.7, 223.7), groundMat);
meadow.rotation.x = -Math.PI / 2;
meadow.position.y = 0.008;
meadow.receiveShadow = true;
scene.add(meadow);

// A meadow should feel layered, not like a bare mint-coloured plane. The ground is
// covered with low tufts, mossy patches, tiny wildflowers, and texturally varied stones.
// Instancing keeps these details to a handful of draw calls on mobile GPUs.
const meadowBladeGeometry = new THREE.ConeGeometry(0.065, 0.38, 4, 1);
const meadowBladeMaterial = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 1, metalness: 0, side: THREE.DoubleSide });
const meadowBladeCapacity = 9800;
const meadowBlades = new THREE.InstancedMesh(meadowBladeGeometry, meadowBladeMaterial, meadowBladeCapacity);
meadowBlades.frustumCulled = false; meadowBlades.castShadow = false; meadowBlades.receiveShadow = false;
const vegetationPalette = ['#3f8747', '#579d50', '#72b65c', '#8cc96d', '#4b9e75', '#367d50', '#a1c96d'];
const vegetationDummy = new THREE.Object3D();
let meadowBladeIndex = 0;
for (let c = 0; c < 720 && meadowBladeIndex < meadowBladeCapacity; c++) {
  let cx = (rand() * 2 - 1) * 98, cz = (rand() * 2 - 1) * 98;
  if (Math.hypot(cx, cz - 12) < 11) { cx += cx < 0 ? -12 : 12; cz -= 5; }
  const bladesInClump = 10 + Math.floor(rand() * 5);
  for (let j = 0; j < bladesInClump && meadowBladeIndex < meadowBladeCapacity; j++) {
    const x = cx + (rand() - 0.5) * 2.4, z = cz + (rand() - 0.5) * 2.4;
    const sy = 0.40 + rand() * 0.8;
    vegetationDummy.position.set(x, 0.19 * sy + 0.012, z);
    vegetationDummy.scale.set(0.58 + rand() * 0.82, sy, 0.62 + rand() * 0.7);
    vegetationDummy.rotation.set((rand() - 0.5) * 0.5, rand() * Math.PI * 2, (rand() - 0.5) * 0.48);
    vegetationDummy.updateMatrix(); meadowBlades.setMatrixAt(meadowBladeIndex, vegetationDummy.matrix);
    meadowBlades.setColorAt(meadowBladeIndex, new THREE.Color(choice(vegetationPalette)));
    meadowBladeIndex++;
  }
}
meadowBlades.count = meadowBladeIndex; meadowBlades.instanceMatrix.needsUpdate = true;
if (meadowBlades.instanceColor) meadowBlades.instanceColor.needsUpdate = true;
scene.add(meadowBlades);

const mossMaterial = new THREE.MeshStandardMaterial({ color: '#659b55', roughness: 1, bumpMap: meadowGrassBump, bumpScale: 0.025 });
const mossGeometry = new THREE.SphereGeometry(0.5, 10, 8);
const mossPatches = new THREE.InstancedMesh(mossGeometry, mossMaterial, 230);
mossPatches.castShadow = false; mossPatches.receiveShadow = false;
for (let i = 0; i < mossPatches.count; i++) {
  let x = (rand() * 2 - 1) * 99, z = (rand() * 2 - 1) * 99;
  if (Math.hypot(x, z - 12) < 10) x += x < 0 ? -10 : 10;
  const mossY = 0.08 + rand() * 0.08;
  vegetationDummy.scale.set(0.5 + rand() * 1.0, mossY, 0.55 + rand() * 1.1);
  vegetationDummy.position.set(x, 0.008 + mossY * 0.5, z);
  vegetationDummy.rotation.y = rand() * Math.PI; vegetationDummy.updateMatrix(); mossPatches.setMatrixAt(i, vegetationDummy.matrix);
  mossPatches.setColorAt(i, new THREE.Color(choice(['#4a8951', '#5b9b53', '#6eaa5c', '#36794d', '#7bab61'])));
}
mossPatches.instanceMatrix.needsUpdate = true; if (mossPatches.instanceColor) mossPatches.instanceColor.needsUpdate = true; scene.add(mossPatches);

// Rounded, mottled stones with a mineral bump map: larger stones plus pebble clusters.
const stoneMaterial = new THREE.MeshStandardMaterial({ map: stoneTexture, bumpMap: stoneBumpTexture, bumpScale: 0.11, roughness: 1, metalness: 0 });
const stoneGeometry = new THREE.DodecahedronGeometry(0.5, 1);
const stoneCount = 370;
const stoneInstances = new THREE.InstancedMesh(stoneGeometry, stoneMaterial, stoneCount);
stoneInstances.castShadow = false; stoneInstances.receiveShadow = true; stoneInstances.frustumCulled = false;
const stoneAnchors = [];
const stoneTints = ['#c0c0b1', '#9fa99f', '#b5a998', '#879995', '#d0c6b2', '#a4a79f'];
for (let i = 0; i < stoneCount; i++) {
  let x, z;
  do { x = (rand() * 2 - 1) * 99; z = (rand() * 2 - 1) * 99; } while (Math.hypot(x, z - 12) < 11);
  const sx = 0.30 + rand() * 0.43, sy = 0.19 + rand() * 0.27, sz = 0.30 + rand() * 0.43;
  vegetationDummy.position.set(x, sy * 0.47 + 0.012, z);
  vegetationDummy.scale.set(sx, sy, sz);
  vegetationDummy.rotation.set(rand() * 0.24, rand() * Math.PI * 2, rand() * 0.22);
  vegetationDummy.updateMatrix(); stoneInstances.setMatrixAt(i, vegetationDummy.matrix);
  stoneInstances.setColorAt(i, new THREE.Color(choice(stoneTints)));
  stoneAnchors.push({ x, z });
}
stoneInstances.instanceMatrix.needsUpdate = true; if (stoneInstances.instanceColor) stoneInstances.instanceColor.needsUpdate = true; scene.add(stoneInstances);
const pebbleCount = 790;
const pebbleInstances = new THREE.InstancedMesh(stoneGeometry, stoneMaterial, pebbleCount);
pebbleInstances.castShadow = false; pebbleInstances.receiveShadow = true; pebbleInstances.frustumCulled = false;
for (let i = 0; i < pebbleCount; i++) {
  const anchor = stoneAnchors[Math.floor(rand() * stoneAnchors.length)];
  const a = rand() * Math.PI * 2, r = 0.5 + rand() * 2.1;
  const x = THREE.MathUtils.clamp(anchor.x + Math.cos(a) * r, -99, 99), z = THREE.MathUtils.clamp(anchor.z + Math.sin(a) * r, -99, 99);
  const sx = 0.16 + rand() * 0.34, sy = 0.14 + rand() * 0.22, sz = 0.16 + rand() * 0.36;
  vegetationDummy.position.set(x, sy * 0.47 + 0.012, z); vegetationDummy.scale.set(sx, sy, sz);
  vegetationDummy.rotation.set(rand(), rand() * Math.PI * 2, rand()); vegetationDummy.updateMatrix(); pebbleInstances.setMatrixAt(i, vegetationDummy.matrix);
  pebbleInstances.setColorAt(i, new THREE.Color(choice(stoneTints)));
}
pebbleInstances.instanceMatrix.needsUpdate = true; if (pebbleInstances.instanceColor) pebbleInstances.instanceColor.needsUpdate = true; scene.add(pebbleInstances);

// Small pastel wildflowers are instanced by part, making them plentiful without hundreds of groups.
const tinyFlowerCount = 235;
const petalMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(0.085, 8, 6), new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.96, side: THREE.DoubleSide }), tinyFlowerCount * 5);
const flowerCenterMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(0.044, 8, 6), new THREE.MeshStandardMaterial({ color: '#ffe3a4', roughness: 0.9 }), tinyFlowerCount);
const flowerStemMesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.012, 0.018, 0.32, 5), new THREE.MeshStandardMaterial({ color: '#4a9960', roughness: 1 }), tinyFlowerCount);
const flowerPalette = ['#fff7e8', '#f6cadb', '#e7d8ff', '#ffdda3', '#d3f1cf', '#f3f4fa'];
let petalIndex = 0;
for (let i = 0; i < tinyFlowerCount; i++) {
  let x = (rand() * 2 - 1) * 98, z = (rand() * 2 - 1) * 98;
  if (Math.hypot(x, z - 12) < 10) x += x < 0 ? -10 : 10;
  const height = 0.24 + rand() * 0.13;
  vegetationDummy.position.set(x, 0.16, z); vegetationDummy.scale.set(1, 0.9 + rand() * 0.4, 1); vegetationDummy.rotation.y = rand() * Math.PI * 2; vegetationDummy.updateMatrix(); flowerStemMesh.setMatrixAt(i, vegetationDummy.matrix);
  for (let j = 0; j < 5; j++) {
    const a = j * Math.PI * 2 / 5;
    vegetationDummy.position.set(x + Math.cos(a) * 0.105, height, z + Math.sin(a) * 0.105);
    vegetationDummy.scale.set(0.9 + rand() * 0.25, 0.48 + rand() * 0.2, 0.85 + rand() * 0.2);
    vegetationDummy.rotation.set((rand() - 0.5) * 0.3, -a, (rand() - 0.5) * 0.3); vegetationDummy.updateMatrix(); petalMesh.setMatrixAt(petalIndex, vegetationDummy.matrix);
    petalMesh.setColorAt(petalIndex, new THREE.Color(choice(flowerPalette))); petalIndex++;
  }
  vegetationDummy.position.set(x, height + 0.015, z); vegetationDummy.scale.setScalar(0.8 + rand() * 0.3); vegetationDummy.rotation.set(0, 0, 0); vegetationDummy.updateMatrix(); flowerCenterMesh.setMatrixAt(i, vegetationDummy.matrix);
}
petalMesh.count = petalIndex; petalMesh.instanceMatrix.needsUpdate = true; if (petalMesh.instanceColor) petalMesh.instanceColor.needsUpdate = true;
flowerCenterMesh.instanceMatrix.needsUpdate = true; flowerStemMesh.instanceMatrix.needsUpdate = true;
scene.add(flowerStemMesh, petalMesh, flowerCenterMesh);

// Past the visible meadow edge is still ground, making accidental edge wandering safe too.
const safetyGround = new THREE.Mesh(new THREE.PlaneGeometry(900, 900), new THREE.MeshStandardMaterial({ color: '#c4f0e4', roughness: 1 }));
safetyGround.rotation.x = -Math.PI / 2;
safetyGround.position.y = -0.83;
scene.add(safetyGround);

// A soft natural boundary: overlapping fallen logs, grass tufts, and small mossy clumps.
// The ground remains continuous behind it, so the edge is visible without any pit or fall.
const landDecorationObjects = [];
const landBoundaryObjects = [];
const landLodDecorations = [];
let lastLandDetailCull = 0;
const movableProps = [];
const barkMat = new THREE.MeshStandardMaterial({ map: barkTexture, bumpMap: barkBumpTexture, bumpScale: 0.13, roughness: 1, color: '#fff7ee' });
const barkLightMat = new THREE.MeshStandardMaterial({ map: barkTexture, bumpMap: barkBumpTexture, bumpScale: 0.10, roughness: 1, color: '#d7b28a' });
const cutWoodMat = new THREE.MeshStandardMaterial({ map: woodEndTexture, bumpMap: woodEndBumpTexture, bumpScale: 0.075, roughness: 1 });
const edgeGrassMats = ['#4f9e72', '#71b77f', '#8bc88b', '#3b8766'].map(color => new THREE.MeshStandardMaterial({ color, roughness: 1 }));
function addBoundaryLog(x, z, length, alongX) {
  const radius = 0.36 + rand() * 0.12;
  const cylinder = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.94, radius, length, 11, 1), [barkMat, cutWoodMat]);
  cylinder.rotation.z = alongX ? Math.PI / 2 : 0;
  if (!alongX) cylinder.rotation.x = Math.PI / 2;
  cylinder.position.set(x, radius + 0.08, z);
  cylinder.castShadow = false; cylinder.receiveShadow = false; scene.add(cylinder); landBoundaryObjects.push(cylinder); landLodDecorations.push(cylinder);
}
const GRASS_BLADE_CAPACITY = 2200;
const grassBladeGeo = new THREE.ConeGeometry(0.105, 0.5, 5);
const grassBladeMat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 1 });
const grassBlades = new THREE.InstancedMesh(grassBladeGeo, grassBladeMat, GRASS_BLADE_CAPACITY);
grassBlades.instanceMatrix.setUsage(THREE.StaticDrawUsage);
grassBlades.frustumCulled = false; grassBlades.castShadow = false; grassBlades.receiveShadow = false;
const grassDummy = new THREE.Object3D();
let grassBladeCount = 0;
function addEdgeGrass(x, z, scale = 1) {
  // All perimeter blades are instanced in one draw call for mobile performance.
  for (let i = 0; i < 5 && grassBladeCount < GRASS_BLADE_CAPACITY; i++) {
    const a = i * Math.PI * 2 / 5 + rand() * 0.25;
    grassDummy.position.set(x + Math.cos(a) * 0.16 * scale, (0.18 + rand() * 0.05) * scale, z + Math.sin(a) * 0.16 * scale);
    grassDummy.scale.set(0.75 + rand() * 0.2, (0.72 + rand() * 0.65) * scale, 0.75 + rand() * 0.2);
    grassDummy.rotation.set(Math.sin(a) * 0.28, rand() * Math.PI, Math.cos(a) * 0.34);
    grassDummy.updateMatrix(); grassBlades.setMatrixAt(grassBladeCount, grassDummy.matrix);
    grassBlades.setColorAt(grassBladeCount, new THREE.Color(choice(edgeGrassMats).color));
    grassBladeCount++;
  }
}
const windSwayObjects = [];
for (const alongX of [true, false]) {
  for (const sign of [-1, 1]) {
    let t = -105;
    while (t < 105) {
      const length = 6.0 + rand() * 2.8;
      const center = t + length / 2;
      if (alongX) addBoundaryLog(center, sign * 106.5, length + 0.35, true);
      else addBoundaryLog(sign * 106.5, center, length + 0.35, false);
      t += length - 0.38;
    }
    for (let tGrass = -104; tGrass <= 104; tGrass += 2.1) {
      const offset = sign * (102.8 + rand() * 1.4);
      const jitter = (rand() - 0.5) * 1.25;
      if (alongX) addEdgeGrass(tGrass + jitter, offset, 0.7 + rand() * 0.65);
      else addEdgeGrass(offset, tGrass + jitter, 0.7 + rand() * 0.65);
    }
  }
}
grassBlades.count = grassBladeCount; grassBlades.instanceMatrix.needsUpdate = true;
if (grassBlades.instanceColor) grassBlades.instanceColor.needsUpdate = true;
scene.add(grassBlades);

// --- Plush character construction -------------------------------------------------------------
function spow(v, p) { return Math.sign(v) * Math.pow(Math.abs(v), p); }
function superPoint(rx, ry, rz, phi, theta, exp) {
  const c = spow(Math.cos(phi), exp);
  return new THREE.Vector3(rx * c * spow(Math.cos(theta), exp), ry * spow(Math.sin(phi), exp), rz * c * spow(Math.sin(theta), exp));
}
function plushGeometry(rx, ry, rz, exp = 0.56, width = 76, height = 54) {
  const vertices = [], uv = [], indices = [];
  for (let iy = 0; iy <= height; iy++) {
    const phi = -Math.PI / 2 + Math.PI * iy / height;
    for (let ix = 0; ix <= width; ix++) {
      const theta = Math.PI * 2 * ix / width;
      const p = superPoint(rx, ry, rz, phi, theta, exp);
      vertices.push(p.x, p.y, p.z);
      uv.push(ix / width, iy / height);
    }
  }
  for (let iy = 0; iy < height; iy++) for (let ix = 0; ix < width; ix++) {
    const a = iy * (width + 1) + ix, b = a + 1, c = a + width + 1, d = c + 1;
    indices.push(a, c, b, b, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(indices);
  g.computeVertexNormals();
  return g;
}
const SLUG_DIMS = Object.freeze({ rx: 0.94, ry: 0.78, rz: 1.41, cy: 0.80, exp: 0.58 }); // body length is 1.5× body width
function bodyFrontZ(x, yRel, rx = SLUG_DIMS.rx, ry = SLUG_DIMS.ry, rz = SLUG_DIMS.rz, exp = SLUG_DIMS.exp) {
  const nx = THREE.MathUtils.clamp(Math.abs(x / rx), 0, 0.999);
  const ny = THREE.MathUtils.clamp(Math.abs(yRel / ry), 0, 0.999);
  const horiz = Math.pow(Math.max(0, 1 - Math.pow(ny, 2 / exp)), exp / 2);
  const cosTheta = Math.pow(THREE.MathUtils.clamp(nx / Math.max(horiz, 0.001), 0, 0.999), 1 / exp);
  return rz * horiz * Math.pow(Math.max(0, 1 - cosTheta * cosTheta), exp / 2);
}
function makeStarGeometry(outer = 0.16, inner = 0.073, seedAngle = -Math.PI / 2) {
  const s = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const a = seedAngle + i * Math.PI / 5;
    const r = i % 2 === 0 ? outer : inner;
    const x = Math.cos(a) * r * (i % 3 === 0 ? 1.04 : 1);
    const y = Math.sin(a) * r;
    if (i === 0) s.moveTo(x, y); else s.lineTo(x, y);
  }
  s.closePath();
  return new THREE.ShapeGeometry(s, 2);
}
const eyeGeometry = makeStarGeometry();
const miniEyeGeometry = makeStarGeometry(0.12, 0.052);

function addFur(root, { rx, ry, rz, centerY, exp = 0.56, count = 5200, palette = ['#c5fff0', '#97e7d9', '#e1fff7'] }) {
  // Fine instanced fibers catch edge light without turning the plush into a spiky hedgehog.
  const fiberGeo = new THREE.CylinderGeometry(0.0017, 0.0034, 0.022, 3, 1, true);
  const fiberMat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 1, metalness: 0 });
  const fur = new THREE.InstancedMesh(fiberGeo, fiberMat, count);
  fur.frustumCulled = false;
  fur.castShadow = false;
  const dummy = new THREE.Object3D();
  const up = new THREE.Vector3(0, 1, 0);
  for (let i = 0; i < count; i++) {
    const phi = -Math.PI / 2 + rand() * Math.PI;
    const theta = rand() * Math.PI * 2;
    const p = superPoint(rx, ry, rz, phi, theta, exp);
    const normal = new THREE.Vector3(p.x / (rx * rx), p.y / (ry * ry), p.z / (rz * rz)).normalize();
    dummy.position.set(p.x, p.y + centerY, p.z).addScaledVector(normal, 0.009);
    dummy.quaternion.setFromUnitVectors(up, normal);
    dummy.rotateY(rand() * Math.PI * 2);
    dummy.scale.set(0.72 + rand() * 0.65, 0.7 + rand() * 0.8, 0.72 + rand() * 0.65);
    dummy.updateMatrix();
    fur.setMatrixAt(i, dummy.matrix);
    fur.setColorAt(i, new THREE.Color(choice(palette)));
  }
  fur.instanceMatrix.needsUpdate = true;
  if (fur.instanceColor) fur.instanceColor.needsUpdate = true;
  root.add(fur);
}

function makeEye(root, x, cy, color = colors.thread, scale = 1, dims = SLUG_DIMS) {
  const material = color === colors.thread ? eyeThread : new THREE.MeshStandardMaterial({ color, roughness: 0.92 });
  const eye = new THREE.Mesh(scale < 0.9 ? miniEyeGeometry : eyeGeometry, material);
  const yRel = -0.12;
  const front = bodyFrontZ(x, yRel, dims.rx, dims.ry, dims.rz, dims.exp);
  eye.position.set(x, cy + yRel, front + 0.045);
  eye.scale.setScalar(scale);
  eye.castShadow = false;
  root.add(eye);
  for (const [dx, dy, r] of [[-0.035, -0.022, -0.38], [0.025, 0.018, 0.42]]) {
    const stitch = new THREE.Mesh(new THREE.CapsuleGeometry(0.008, 0.045, 2, 4), material);
    stitch.position.set(x + dx * scale, cy + yRel + dy * scale, front + 0.052);
    stitch.rotation.z = r;
    root.add(stitch);
  }
}

function makeFeeler(side, root, bodyColor = colors.mint, playerOwned = false) {
  // A single gently tapered plush paddle avoids the round, segmented/tubular look.
  // Vertex tint blends the body colour through the lower half into an ivory upper half.
  const baseRotZ = -side * 0.52;
  const paddleShape = new THREE.SphereGeometry(1, 32, 24);
  const positions = paddleShape.attributes.position;
  const tints = new Float32Array(positions.count * 3);
  const bodyTint = new THREE.Color(bodyColor);
  const ivoryTint = new THREE.Color('#fff8ef');
  const tint = new THREE.Color();
  for (let i = 0; i < positions.count; i++) {
    const y = positions.getY(i);
    const ivoryAmount = THREE.MathUtils.smoothstep(y, -0.08, 0.16);
    tint.copy(bodyTint).lerp(ivoryTint, ivoryAmount);
    tints[i * 3] = tint.r; tints[i * 3 + 1] = tint.g; tints[i * 3 + 2] = tint.b;
  }
  paddleShape.setAttribute('color', new THREE.Float32BufferAttribute(tints, 3));
  const paddleMaterial = new THREE.MeshStandardMaterial({
    map: ivoryFabric, bumpMap: ivoryBump, bumpScale: 0.075,
    roughness: 1, metalness: 0, vertexColors: true,
  });
  const mesh = new THREE.Mesh(paddleShape, paddleMaterial);
  // Slightly shorter/narrower than the previous version, still splayed out from the head.
  mesh.position.set(side * 0.77, 1.57, 0.38);
  mesh.scale.set(0.31, 0.64, 0.145);
  mesh.rotation.z = baseRotZ;
  mesh.rotation.x = side * -0.055;
  mesh.castShadow = true; mesh.receiveShadow = true; root.add(mesh);
  return { mesh, tip: mesh, side, baseRotZ };
}

function addCherry(root, scale = 1) {
  // Plump red felt cherry, seated between the feelers toward the face end.
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.70, 40, 30), cherryPlush.clone());
  ball.position.set(0, 2.03, 0.42);
  ball.scale.set(1.02 * scale, 0.92 * scale, 0.92 * scale);
  ball.castShadow = true; ball.receiveShadow = true; root.add(ball);
  root.userData.cherryMesh = ball;
  root.userData.cherryBaseColor = ball.material.color.clone();
  const inset = new THREE.Mesh(new THREE.SphereGeometry(0.105, 16, 12), new THREE.MeshStandardMaterial({ color: '#a72e33', roughness: 1 }));
  inset.position.set(-0.05, 2.66, 0.39); inset.scale.set(1.1, 0.32, 0.85); root.add(inset);
  const stemCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-0.05, 2.65, 0.39), new THREE.Vector3(-0.12, 2.88, 0.38),
    new THREE.Vector3(-0.17, 3.12, 0.40), new THREE.Vector3(-0.10, 3.34, 0.44),
    new THREE.Vector3(0.06, 3.47, 0.48),
  ]);
  const stem = new THREE.Mesh(new THREE.TubeGeometry(stemCurve, 30, 0.055, 10, false), new THREE.MeshStandardMaterial({ color: '#9f2930', roughness: 0.95 }));
  stem.castShadow = true; root.add(stem);
}
function addFrill(root, material = ivoryPlush) {
  // White scalloped ruffle follows the long oval underside of the sea-slug plush.
  const lobes = 26, geometry = new THREE.SphereGeometry(0.29, 14, 10);
  const skirt = new THREE.InstancedMesh(geometry, material, lobes);
  const dummy = new THREE.Object3D();
  for (let i = 0; i < lobes; i++) {
    const a = i * Math.PI * 2 / lobes;
    dummy.position.set(Math.cos(a) * 0.72, 0.13 + 0.022 * Math.cos(i * 2.6), Math.sin(a) * 1.18);
    dummy.scale.set(0.88, 0.55, 0.82);
    dummy.rotation.set(0, -a, 0);
    dummy.updateMatrix(); skirt.setMatrixAt(i, dummy.matrix);
  }
  skirt.instanceMatrix.needsUpdate = true; skirt.castShadow = true; root.add(skirt);
}
function addTail(root, tailColor = '#fff1d9') {
  const tailMat = tailColor === '#fff1d9' ? new THREE.MeshStandardMaterial({ map: ivoryFabric, bumpMap: ivoryBump, bumpScale: 0.075, color: '#fff0d5', roughness: 1 }) : new THREE.MeshStandardMaterial({ color: tailColor, bumpMap: mintBump, bumpScale: 0.05, roughness: 1 });
  const tail = new THREE.Mesh(new THREE.SphereGeometry(0.52, 24, 20), tailMat);
  // The cream tail is at the back end of the long body, not on its side.
  tail.position.set(0, 0.66, -1.19);
  tail.scale.set(0.62, 0.66, 0.76);
  tail.rotation.z = -0.12;
  tail.castShadow = true; root.add(tail);
}
function addSideStitches(root) {
  const satin = new THREE.MeshStandardMaterial({ color: '#dffff7', roughness: 0.38, metalness: 0.02, emissive: '#94dccc', emissiveIntensity: 0.08 });
  for (const [x, y, z, sx, sy, sz, rot] of [
    [-0.96, 1.00, 0.45, 0.035, 0.16, 0.045, -0.15],
    [-1.00, 0.78, 0.00, 0.035, 0.13, 0.045, 0.18],
    [-0.95, 0.57, -0.47, 0.035, 0.14, 0.045, -0.12],
  ]) {
    const stitch = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 10), satin);
    stitch.position.set(x, y, z); stitch.scale.set(sx, sy, sz); stitch.rotation.z = rot; root.add(stitch);
  }
}
function addTopAccessory(root, kind, bodyColor) {
  if (!kind || kind === 'none' || kind === 'cherry') return;
  if (kind === 'strawberry') {
    const fruitMat = new THREE.MeshStandardMaterial({ color: '#d9364c', roughness: 0.94, bumpMap: cherryBump, bumpScale: 0.05 });
    const berry = new THREE.Mesh(new THREE.SphereGeometry(0.3, 20, 16), fruitMat);
    berry.position.set(0.42, 1.94, 0.3); berry.scale.set(0.82, 1.08, 0.7); root.add(berry);
    const green = new THREE.MeshStandardMaterial({ color: '#66b978', roughness: 1 });
    for (let i = 0; i < 4; i++) { const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 8), green); const a = i * Math.PI / 2; leaf.position.set(0.42 + Math.cos(a) * 0.12, 2.19, 0.3 + Math.sin(a) * 0.1); leaf.scale.set(1, 0.32, 0.6); root.add(leaf); }
  } else if (kind === 'bow') {
    const ribbon = new THREE.MeshStandardMaterial({ color: '#9e87dc', roughness: 0.85 });
    for (const side of [-1, 1]) { const loop = new THREE.Mesh(new THREE.SphereGeometry(0.26, 16, 12), ribbon); loop.position.set(side * 0.24, 1.96, 0.36); loop.scale.set(1.05, 0.5, 0.28); loop.rotation.z = side * -0.25; root.add(loop); }
    const knot = new THREE.Mesh(new THREE.SphereGeometry(0.13, 14, 10), ribbon); knot.position.set(0, 1.96, 0.43); root.add(knot);
  } else if (kind === 'flower') {
    const petals = new THREE.MeshStandardMaterial({ color: '#f7c5e5', roughness: 0.92 });
    for (let i = 0; i < 5; i++) { const a = i * Math.PI * 2 / 5; const p = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 10), petals); p.position.set(Math.cos(a) * 0.19, 2.0, 0.25 + Math.sin(a) * 0.12); p.scale.y = 0.7; root.add(p); }
    const c = new THREE.Mesh(new THREE.SphereGeometry(0.12, 12, 10), new THREE.MeshStandardMaterial({ color: '#ffe3a0', roughness: 0.9 })); c.position.set(0, 2.02, 0.35); root.add(c);
  } else if (kind === 'cloud') {
    const cloudMat = new THREE.MeshStandardMaterial({ map: ivoryFabric, bumpMap: ivoryBump, bumpScale: 0.06, color: '#fff4e4', roughness: 1 });
    for (const [x, y, s] of [[-0.22, 1.96, 0.20], [0, 2.05, 0.26], [0.23, 1.96, 0.19]]) {
      const puff = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), cloudMat);
      puff.position.set(x, y, 0.36); puff.scale.set(s * 1.15, s * 0.82, s * 0.7); root.add(puff);
    }
  } else if (kind === 'candy' || kind === 'wrappedCandy') {
    const sweetColor = kind === 'candy' ? '#b8a2ef' : '#f2a6b6';
    const sweetMat = new THREE.MeshStandardMaterial({ color: sweetColor, map: cherryFabric, bumpMap: cherryBump, bumpScale: 0.05, roughness: 0.88 });
    const twistMat = new THREE.MeshStandardMaterial({ color: kind === 'candy' ? '#f5deff' : '#fff1c8', map: ivoryFabric, bumpMap: ivoryBump, bumpScale: 0.035, roughness: 0.95 });
    const center = new THREE.Mesh(new THREE.SphereGeometry(0.25, 20, 16), sweetMat);
    center.position.set(0, 1.99, 0.34); center.scale.set(1.20, 0.68, 0.76); root.add(center);
    for (const side of [-1, 1]) {
      const twist = new THREE.Mesh(new THREE.ConeGeometry(0.15, 0.28, 5), twistMat);
      twist.position.set(side * 0.34, 1.99, 0.34); twist.rotation.z = side * Math.PI / 2; twist.scale.set(0.76, 1.05, 0.8); root.add(twist);
      const tie = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.022, 5, 12), sweetMat);
      tie.position.set(side * 0.28, 1.99, 0.34); tie.rotation.y = Math.PI / 2; root.add(tie);
    }
  }
}
function buildSlug({ player = false, bodyColor = colors.mint, eyeColor = colors.thread, tailColor = '#fff1d9', cherry = false, accessory = 'none', furCount = 2400, size = 1 } = {}) {
  const root = new THREE.Group();
  const { rx, ry, rz, cy, exp } = SLUG_DIMS;
  const bodyMaterial = player ? mintPlush : new THREE.MeshStandardMaterial({ color: bodyColor, map: ivoryFabric, bumpMap: ivoryBump, bumpScale: 0.085, roughness: 1, metalness: 0 });
  const body = new THREE.Mesh(plushGeometry(rx, ry, rz, exp), bodyMaterial);
  body.position.y = cy; body.castShadow = true; body.receiveShadow = true; root.add(body);
  const furPalette = player ? ['#cefff9', '#a4f9f0', '#5bded6', '#e7fffb'] : [bodyColor, bodyColor, '#fff5ef', bodyColor];
  addFur(root, { rx, ry, rz, centerY: cy, exp, count: furCount, palette: furPalette });
  addFrill(root);
  addTail(root, tailColor);
  const feelers = [];
  for (const side of [-1, 1]) feelers.push(makeFeeler(side, root, player ? colors.mint : bodyColor, player));
  // Two small dark stitched stars sit low on the narrow front, like the photographed plush.
  makeEye(root, -0.32, cy, eyeColor, player ? 1.0 : 0.88);
  makeEye(root, 0.32, cy, eyeColor, player ? 1.0 : 0.88);
  if (player) addSideStitches(root);
  if (cherry) addCherry(root, 1);
  addTopAccessory(root, accessory, bodyColor);
  root.scale.setScalar(size);
  root.userData.feelers = feelers;
  root.userData.bodyMaterial = bodyMaterial;
  root.userData.kind = player ? 'player' : 'friend';
  return root;
}

const player = buildSlug({ player: true, cherry: true, furCount: 8500 });
player.position.set(0, 0, 12);
player.rotation.y = Math.PI; // Face looks ahead, away from the rear camera; its stitched stars are on the front.
scene.add(player);
const shadow = new THREE.Mesh(new THREE.CircleGeometry(1.8, 36), new THREE.MeshBasicMaterial({ color: '#3f9b8d', transparent: true, opacity: 0.23, depthWrite: false }));
shadow.rotation.x = -Math.PI / 2;
shadow.position.y = 0.025;
shadow.scale.set(1.22, 0.9, 1);
scene.add(shadow);

// --- Meadow decorations: broad, open, continuously walkable space --------------------------------
function addFlower(x, z, scale = 1, petalColor = '#fff7ee') {
  const group = new THREE.Group();
  const stemMat = new THREE.MeshStandardMaterial({ color: '#53b79f', roughness: 1 });
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.06, 0.55, 7), stemMat); stem.position.y = 0.27; group.add(stem);
  const petalMat = new THREE.MeshStandardMaterial({ color: petalColor, roughness: 0.96, bumpMap: ivoryBump, bumpScale: 0.025 });
  const centerMat = new THREE.MeshStandardMaterial({ color: '#ffe1a0', roughness: 0.9 });
  for (let j = 0; j < 6; j++) { const a = j * Math.PI / 3; const p = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 9), petalMat); p.position.set(Math.cos(a) * 0.25, 0.61 + Math.sin(a) * 0.03, Math.sin(a) * 0.25); p.scale.set(1, 0.75, 0.85); group.add(p); }
  const center = new THREE.Mesh(new THREE.SphereGeometry(0.14, 12, 10), centerMat); center.position.y = 0.62; group.add(center);
  group.position.set(x, 0, z); group.scale.setScalar(scale); group.traverse(o => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; } }); scene.add(group); landDecorationObjects.push(group); landLodDecorations.push(group); windSwayObjects.push(group);
}
function addSodaMushroom(x, z, scale, capColor) {
  const group = new THREE.Group();
  const stem = new THREE.Mesh(new THREE.CapsuleGeometry(0.42, 1.1, 5, 10), new THREE.MeshStandardMaterial({ color: '#f7eee0', roughness: 0.98, bumpMap: ivoryBump, bumpScale: 0.04 })); stem.position.y = 0.85; stem.castShadow = true; group.add(stem);
  const cap = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16), new THREE.MeshStandardMaterial({ color: capColor, roughness: 0.8, bumpMap: mintBump, bumpScale: 0.05 })); cap.position.y = 1.65; cap.scale.set(1.22, 0.67, 1.18); cap.castShadow = true; group.add(cap);
  const dotMat = new THREE.MeshStandardMaterial({ color: '#fff8ed', roughness: 0.78 });
  for (let i = 0; i < 5; i++) { const a = i * Math.PI * 0.4; const dot = new THREE.Mesh(new THREE.SphereGeometry(0.095, 10, 8), dotMat); dot.position.set(Math.cos(a) * 0.67, 2.05 + (i % 2) * 0.12, Math.sin(a) * 0.65); group.add(dot); }
  group.position.set(x, 0, z); group.scale.setScalar(scale); group.traverse(o => { if (o.isMesh) o.castShadow = false; }); scene.add(group); landDecorationObjects.push(group); landLodDecorations.push(group); windSwayObjects.push(group);
  movableProps.push({ type: 'mushroom', group, baseX: x, baseZ: z, offsetX: 0, offsetZ: 0, vx: 0, vz: 0, radius: 0.94 * scale, scale, homeY: 0 });
}
function addPushableRock(x, z, scale = 1, tint = '#b5b4a4') {
  const group = new THREE.Group();
  const rockMaterial = stoneMaterial.clone(); rockMaterial.color.set(tint);
  const main = new THREE.Mesh(stoneGeometry, rockMaterial);
  main.position.set(0, 0.40 * scale, 0); main.scale.set(1.25 * scale, 0.88 * scale, 1.14 * scale); main.castShadow = true; main.receiveShadow = true; group.add(main);
  const side = new THREE.Mesh(stoneGeometry, rockMaterial);
  side.position.set(0.42 * scale, 0.24 * scale, -0.35 * scale); side.scale.set(0.56 * scale, 0.48 * scale, 0.62 * scale); side.castShadow = true; side.receiveShadow = true; group.add(side);
  group.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  group.position.set(x, 0, z); group.scale.setScalar(1); scene.add(group); landDecorationObjects.push(group); landLodDecorations.push(group);
  movableProps.push({ type: 'rock', group, baseX: x, baseZ: z, offsetX: 0, offsetZ: 0, vx: 0, vz: 0, radius: 0.86 * scale, scale, mass: 1.8 + scale * 0.9, tint });
}
function addBubbleCluster(x, y, z, scale = 1) {
  const group = new THREE.Group();
  const mat = new THREE.MeshPhysicalMaterial({ color: '#f4fffa', roughness: 0.12, metalness: 0, transparent: true, opacity: 0.48, clearcoat: 1, clearcoatRoughness: 0.08 });
  for (const [px, py, pz, r] of [[0, 0, 0, 0.42], [0.48, 0.52, -0.08, 0.27], [-0.33, 0.46, 0.1, 0.22], [0.22, 0.95, -0.05, 0.14]]) { const b = new THREE.Mesh(new THREE.SphereGeometry(r, 18, 14), mat); b.position.set(px, py, pz); group.add(b); }
  group.position.set(x, y, z); group.scale.setScalar(scale); group.visible = false; scene.add(group); return { group, y, phase: rand() * 6.28 };
}
const decorBubbles = [];
for (let i = 0; i < 48; i++) {
  const angle = rand() * Math.PI * 2;
  const radius = 13 + rand() * 90;
  const x = Math.cos(angle) * radius, z = Math.sin(angle) * radius;
  if (rand() < 0.54) addFlower(x, z, 0.55 + rand() * 0.9, choice(['#fff7ed', '#fbd1dc', '#f1e8ff', '#ffe7ad', '#ddfff4']));
  else if (radius > 31) addSodaMushroom(x, z, 0.65 + rand() * 1.4, choice(['#f6aeb9', '#a1dfd4', '#e7d5ff', '#ffdca3']));
}
for (let i = 0; i < 18; i++) {
  const a = rand() * Math.PI * 2, r = 18 + rand() * 82;
  decorBubbles.push(addBubbleCluster(Math.cos(a) * r, 1.6 + rand() * 7, Math.sin(a) * r, 0.45 + rand() * 1.1));
}
// A dozen prominent boulders are real pushable props, unlike the tiny decorative pebbles.
[
  [-16, 7, 1.00], [21, 17, 1.14], [36, -25, 1.08], [-41, -33, 1.18],
  [61, 8, 0.98], [-59, 42, 1.12], [20, 67, 1.05], [-75, -43, 1.15],
  [73, 46, 1.06], [2, -62, 1.1], [-25, -67, 0.96], [58, -57, 1.13],
].forEach(([x, z, scale], i) => addPushableRock(x, z, scale, stoneTints[i % stoneTints.length]));

// --- Water World: the secret biome unlocked by collecting every fizzy pearl -----------------------
// Canvas-generated sand keeps this world self-contained and works on GitHub Pages without extra downloads.
let waterSeed = 618209;
function waterRand() { waterSeed = (waterSeed * 1664525 + 1013904223) >>> 0; return waterSeed / 4294967296; }
function waterChoice(values) { return values[Math.floor(waterRand() * values.length)]; }
function makeUnderwaterSandTexture() {
  const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 512;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#155b70'; ctx.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 170; i++) {
    const x = waterRand() * 512, y = waterRand() * 512, r = 14 + waterRand() * 68;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    const c = waterChoice(['#287b86', '#357d83', '#0e526c', '#398b8d', '#1a6479']);
    g.addColorStop(0, `${c}88`); g.addColorStop(1, `${c}00`);
    ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  for (let i = 0; i < 6600; i++) {
    const x = waterRand() * 512, y = waterRand() * 512;
    ctx.fillStyle = waterChoice(['rgba(143,211,190,.13)', 'rgba(3,42,62,.18)', 'rgba(194,222,195,.12)', 'rgba(21,92,105,.18)']);
    ctx.fillRect(x, y, 1 + waterRand() * 2.2, 1 + waterRand() * 1.7);
  }
  ctx.lineWidth = 1.1;
  for (let row = 0; row < 22; row++) {
    const y = row * 24 + waterRand() * 12;
    ctx.strokeStyle = `rgba(150,216,202,${0.035 + waterRand() * 0.055})`;
    ctx.beginPath();
    for (let x = 0; x <= 512; x += 8) {
      const yy = y + Math.sin(x * 0.026 + row) * 2.4 + Math.sin(x * 0.01 + row * 3) * 1.8;
      if (x === 0) ctx.moveTo(x, yy); else ctx.lineTo(x, yy);
    }
    ctx.stroke();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping; texture.repeat.set(18, 18);
  texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = anisotropy;
  const bump = texture.clone(); bump.colorSpace = THREE.NoColorSpace; bump.needsUpdate = true;
  return { texture, bump };
}
const waterWorld = new THREE.Group(); waterWorld.visible = false; scene.add(waterWorld);
const waterSand = makeUnderwaterSandTexture();
const waterFloor = new THREE.Mesh(new THREE.PlaneGeometry(223.7, 223.7), new THREE.MeshStandardMaterial({ map: waterSand.texture, bumpMap: waterSand.bump, bumpScale: 0.18, color: '#9bd0d1', roughness: 1, metalness: 0 }));
waterFloor.rotation.x = -Math.PI / 2; waterFloor.position.y = 0.004; waterFloor.receiveShadow = true; waterWorld.add(waterFloor);
const waterSurface = new THREE.Mesh(new THREE.PlaneGeometry(223.7, 223.7), new THREE.MeshBasicMaterial({ color: '#48d6ed', transparent: true, opacity: 0.10, side: THREE.DoubleSide, depthWrite: false }));
waterSurface.rotation.x = -Math.PI / 2; waterSurface.position.y = 34; waterWorld.add(waterSurface);
const waterRippleMat = new THREE.MeshBasicMaterial({ color: '#a7f8ff', transparent: true, opacity: 0.095, depthWrite: false, side: THREE.DoubleSide });
const waterSurfaceRipples = [];
for (let i = 0; i < 72; i++) {
  const ripple = new THREE.Mesh(new THREE.RingGeometry(0.7 + waterRand() * 0.8, 0.76 + waterRand() * 0.8, 32), waterRippleMat);
  const x = (waterRand() * 2 - 1) * 101, z = (waterRand() * 2 - 1) * 101, baseScale = 1.8 + waterRand() * 4.5, phase = waterRand() * Math.PI * 2;
  ripple.rotation.x = -Math.PI / 2; ripple.position.set(x, 33.94, z); ripple.scale.setScalar(baseScale); waterWorld.add(ripple);
  waterSurfaceRipples.push({ mesh: ripple, x, z, baseScale, phase });
}
// Soft shafts of surface light are textured planes with feathered alpha rather than harsh opaque bars.
const rayCanvas = document.createElement('canvas'); rayCanvas.width = 128; rayCanvas.height = 512;
const rayCtx = rayCanvas.getContext('2d');
const rayX = rayCtx.createLinearGradient(0, 0, 128, 0);
rayX.addColorStop(0, 'rgba(177,250,255,0)'); rayX.addColorStop(0.3, 'rgba(177,250,255,.12)'); rayX.addColorStop(0.5, 'rgba(205,255,255,.42)'); rayX.addColorStop(0.7, 'rgba(177,250,255,.12)'); rayX.addColorStop(1, 'rgba(177,250,255,0)');
rayCtx.fillStyle = rayX; rayCtx.fillRect(0, 0, 128, 512);
rayCtx.globalCompositeOperation = 'destination-in';
const rayY = rayCtx.createLinearGradient(0, 0, 0, 512); rayY.addColorStop(0, 'rgba(255,255,255,.92)'); rayY.addColorStop(0.35, 'rgba(255,255,255,.54)'); rayY.addColorStop(1, 'rgba(255,255,255,0)');
rayCtx.fillStyle = rayY; rayCtx.fillRect(0, 0, 128, 512); rayCtx.globalCompositeOperation = 'source-over';
const rayTexture = new THREE.CanvasTexture(rayCanvas); rayTexture.colorSpace = THREE.SRGBColorSpace;
const rayMaterial = new THREE.MeshBasicMaterial({ map: rayTexture, color: '#9af4ff', transparent: true, opacity: 0.52, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
underwaterRayMaterial = rayMaterial;
for (let i = 0; i < 7; i++) {
  const ray = new THREE.Mesh(new THREE.PlaneGeometry(10 + waterRand() * 10, 43 + waterRand() * 13), rayMaterial);
  ray.position.set((waterRand() * 2 - 1) * 72, 17 + waterRand() * 5, (waterRand() * 2 - 1) * 72); ray.rotation.y = waterRand() * Math.PI; waterWorld.add(ray);
}
// A broad, naturally fanned scallop shell reclining on the seabed (not an upright wheel).
function makeScallopShellTexture() {
  const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 512;
  const ctx = canvas.getContext('2d');
  const bg = ctx.createLinearGradient(0, 0, 0, 512);
  bg.addColorStop(0, '#ffe6dd'); bg.addColorStop(0.38, '#f4bfc5'); bg.addColorStop(0.72, '#df969f'); bg.addColorStop(1, '#f8d9c9');
  ctx.fillStyle = bg; ctx.fillRect(0, 0, 512, 512);
  // Fine, irregular nacre lines radiate from the hinge like a real scallop shell.
  for (let i = -8; i <= 8; i++) {
    const endX = 256 + i * 27;
    ctx.beginPath(); ctx.moveTo(256 + i * 2, 506);
    ctx.bezierCurveTo(256 + i * 5, 390, 256 + i * 17, 150, endX, 25 + Math.abs(i) * 1.8);
    ctx.strokeStyle = i % 2 ? 'rgba(255,244,224,0.35)' : 'rgba(165,91,111,0.13)';
    ctx.lineWidth = i % 3 === 0 ? 3.0 : 1.5; ctx.stroke();
  }
  for (let i = 0; i < 800; i++) {
    const x = Math.random() * 512, y = Math.random() * 512;
    ctx.fillStyle = i % 2 ? 'rgba(255,255,255,0.09)' : 'rgba(123,66,81,0.035)';
    ctx.fillRect(x, y, 1 + Math.random() * 2, 1 + Math.random() * 1.6);
  }
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = anisotropy;
  // ShapeGeometry uses its local x/y as UVs, so map the -2.5..2.5 / 0..2 canvas footprint to 0..1.
  texture.repeat.set(0.2, 0.5); texture.offset.set(0.5, 0); texture.needsUpdate = true;
  const bump = texture.clone(); bump.colorSpace = THREE.NoColorSpace; bump.needsUpdate = true;
  return { texture, bump };
}
const shellTextures = makeScallopShellTexture();
const seaShell = new THREE.Group();
const shellOuter = new THREE.MeshStandardMaterial({ color: '#fff1e9', roughness: 0.62, metalness: 0.015, side: THREE.DoubleSide, map: shellTextures.texture, bumpMap: shellTextures.bump, bumpScale: 0.025 });
const shellInner = new THREE.MeshStandardMaterial({ color: '#fff0e3', roughness: 0.31, metalness: 0.02, side: THREE.DoubleSide, map: shellTextures.texture, bumpMap: shellTextures.bump, bumpScale: 0.012, emissive: '#643b45', emissiveIntensity: 0.025 });
const shellRim = new THREE.MeshStandardMaterial({ color: '#ffe8d7', roughness: 0.38, metalness: 0.02 });
function makeFanShellShape(scale = 1) {
  const shape = new THREE.Shape(); shape.moveTo(0, 0.08);
  // Broad scalloped fan edge with six soft lobes, tapering cleanly to a narrow hinge.
  for (let i = 0; i <= 96; i++) {
    const a = Math.PI * i / 96;
    const scallop = 0.90 + 0.10 * Math.cos(a * 12);
    shape.lineTo(Math.cos(a) * 2.3 * scallop * scale, 0.10 + Math.sin(a) * 1.85 * scallop * scale);
  }
  shape.lineTo(0, 0.08); return shape;
}
const shellBacking = new THREE.Mesh(new THREE.ExtrudeGeometry(makeFanShellShape(), { depth: 0.16, bevelEnabled: true, bevelSegments: 3, steps: 1, bevelSize: 0.035, bevelThickness: 0.035 }), shellOuter);
shellBacking.position.z = -0.10; shellBacking.castShadow = true; shellBacking.receiveShadow = true; seaShell.add(shellBacking);
const shellInside = new THREE.Mesh(new THREE.ShapeGeometry(makeFanShellShape(0.84), 2), shellInner);
shellInside.position.set(0, 0.025, 0.078); seaShell.add(shellInside);
// Delicate fluting follows the shell's natural fan rather than forming a wheel's spokes.
for (let i = 0; i < 9; i++) {
  const a = (i + 0.5) / 9 * Math.PI;
  const scallop = 0.90 + 0.10 * Math.cos(a * 12);
  const endX = Math.cos(a) * 2.12 * scallop;
  const endY = 0.10 + Math.sin(a) * 1.67 * scallop;
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-0.035 + i * 0.009, 0.13, 0.125),
    new THREE.Vector3(Math.cos(a) * 0.52, 0.22 + Math.sin(a) * 0.40, 0.143),
    new THREE.Vector3(endX * 0.70, 0.12 + (endY - 0.10) * 0.72, 0.13),
    new THREE.Vector3(endX, endY, 0.105),
  ]);
  seaShell.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 24, 0.014, 5, false), shellRim));
}
const shellLipCurve = new THREE.CatmullRomCurve3(Array.from({ length: 97 }, (_, i) => {
  const a = Math.PI * i / 96, scallop = 0.90 + 0.10 * Math.cos(a * 12);
  return new THREE.Vector3(Math.cos(a) * 2.3 * scallop, 0.10 + Math.sin(a) * 1.85 * scallop, 0.10);
}));
seaShell.add(new THREE.Mesh(new THREE.TubeGeometry(shellLipCurve, 96, 0.042, 7, false), shellRim));
// Small hinge nub only; there is deliberately no large round central disc.
const shellHinge = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 9), shellRim);
shellHinge.position.set(0, 0.12, 0.09); shellHinge.scale.set(0.34, 0.095, 0.09); seaShell.add(shellHinge);
// It rests open on the sand, face tilted up to catch the underwater light.
seaShell.position.set(38, 0.16, -40.85); seaShell.rotation.set(-1.24, -0.20, 0); seaShell.scale.set(1.02, 0.96, 0.82);
seaShell.castShadow = true; seaShell.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } }); waterWorld.add(seaShell);
const seaShellCollider = { x: seaShell.position.x, z: seaShell.position.z - 1.15, radius: 2.5, height: 1.65 };
// A mottled stone bed and gently bending kelp make the ocean feel inhabited, not like a blue room.
const waterRockMaterial = new THREE.MeshStandardMaterial({ map: stoneTexture, bumpMap: stoneBumpTexture, bumpScale: 0.15, color: '#8ccbd0', roughness: 1 });
const waterRockCount = 250;
const waterRocks = new THREE.InstancedMesh(stoneGeometry, waterRockMaterial, waterRockCount);
waterRocks.frustumCulled = false; waterRocks.receiveShadow = true;
for (let i = 0; i < waterRockCount; i++) {
  let x = (waterRand() * 2 - 1) * 101, z = (waterRand() * 2 - 1) * 101;
  if (Math.hypot(x, z - 12) < 10) x += x < 0 ? -10 : 10;
  const sx = 0.3 + waterRand() * 1.8, sy = 0.18 + waterRand() * 0.75, sz = 0.3 + waterRand() * 1.6;
  vegetationDummy.position.set(x, sy * 0.42, z); vegetationDummy.scale.set(sx, sy, sz);
  vegetationDummy.rotation.set(waterRand() * 0.35, waterRand() * Math.PI * 2, waterRand() * 0.35); vegetationDummy.updateMatrix(); waterRocks.setMatrixAt(i, vegetationDummy.matrix);
  waterRocks.setColorAt(i, new THREE.Color(waterChoice(['#72b7bd', '#9bcac3', '#588f9c', '#b4c9be', '#4d8796'])));
}
waterRocks.instanceMatrix.needsUpdate = true; if (waterRocks.instanceColor) waterRocks.instanceColor.needsUpdate = true; waterWorld.add(waterRocks);
const kelpMaterials = ['#238f87', '#34aa9b', '#1d7f83', '#579d8b', '#327d82'].map(color => new THREE.MeshStandardMaterial({ color, roughness: 0.86, metalness: 0.02, side: THREE.DoubleSide }));
const kelpLeafGeometry = new THREE.SphereGeometry(1, 9, 7);
const underwaterKelp = [];
for (let i = 0; i < 48; i++) {
  let x = (waterRand() * 2 - 1) * 96, z = (waterRand() * 2 - 1) * 96;
  if (Math.hypot(x, z - 12) < 13) x += x < 0 ? -15 : 15;
  const clump = new THREE.Group(); clump.position.set(x, 0, z);
  const stems = 3 + Math.floor(waterRand() * 3);
  for (let j = 0; j < stems; j++) {
    const side = (j - (stems - 1) / 2) * 0.28, height = 1.7 + waterRand() * 3.5, sway = (waterRand() - 0.5) * 1.05;
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(side, 0, 0), new THREE.Vector3(side * 0.82, height * 0.30, 0.04),
      new THREE.Vector3(side + sway * 0.36, height * 0.66, sway * 0.07), new THREE.Vector3(side + sway, height, sway * 0.16),
    ]);
    clump.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 9, 0.045 + waterRand() * 0.025, 5, false), kelpMaterials[Math.floor(waterRand() * kelpMaterials.length)]));
    for (let leaf = 0; leaf < 2; leaf++) {
      const sideSign = leaf ? 1 : -1, yy = height * (0.42 + waterRand() * 0.24);
      const blade = new THREE.Mesh(kelpLeafGeometry, kelpMaterials[Math.floor(waterRand() * kelpMaterials.length)]);
      blade.position.set(side + sideSign * (0.22 + waterRand() * 0.18), yy, sway * 0.04);
      blade.scale.set(0.12, 0.45 + waterRand() * 0.4, 0.075); blade.rotation.z = sideSign * (0.48 + waterRand() * 0.5); clump.add(blade);
    }
  }
  waterWorld.add(clump); underwaterKelp.push({ group: clump, phase: waterRand() * Math.PI * 2 });
}
// Little pastel coral branches punctuate the kelp with a few warm pops of colour.
const coralMaterials = ['#e98da8', '#e9b77d', '#a99be8', '#f1c4d1', '#78cfc6'].map(color => new THREE.MeshStandardMaterial({ color, roughness: 0.75, side: THREE.DoubleSide }));
const underwaterCoral = [];
for (let i = 0; i < 22; i++) {
  let x = (waterRand() * 2 - 1) * 94, z = (waterRand() * 2 - 1) * 94;
  if (Math.hypot(x, z - 12) < 13) x += x < 0 ? -16 : 16;
  const coral = new THREE.Group(); coral.position.set(x, 0, z);
  const branches = 3 + Math.floor(waterRand() * 3);
  for (let j = 0; j < branches; j++) {
    const side = (j - (branches - 1) / 2) * 0.20, h = 0.9 + waterRand() * 1.5, bend = (waterRand() - 0.5) * 0.6;
    const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0, 0), new THREE.Vector3(side * 0.4, h * 0.35, 0), new THREE.Vector3(side + bend * 0.4, h * 0.75, bend * 0.12), new THREE.Vector3(side + bend, h, bend * 0.18)]);
    const mat = coralMaterials[Math.floor(waterRand() * coralMaterials.length)];
    coral.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 7, 0.065 + waterRand() * 0.035, 5, false), mat));
    const tip = new THREE.Mesh(new THREE.SphereGeometry(0.09, 9, 7), mat); tip.position.set(side + bend, h, bend * 0.18); coral.add(tip);
  }
  waterWorld.add(coral); underwaterCoral.push(coral);
}
const underwaterDetailGroups = [...underwaterKelp.map(item => item.group), ...underwaterCoral];
let lastUnderwaterDetailCull = 0;
let lastUnderwaterKelpAnimation = 0;
function updateUnderwaterDetailLOD(now) {
  if (worldMode !== 'water' || now - lastUnderwaterDetailCull < 220) return;
  lastUnderwaterDetailCull = now;
  const detailRange = touchGpuProfile ? 80 : 106;
  const rangeSq = detailRange * detailRange;
  for (const group of underwaterDetailGroups) {
    const dx = group.position.x - state.x, dz = group.position.z - state.z;
    group.visible = dx * dx + dz * dz <= rangeSq;
  }
}
function updateMeadowDetailLOD(now) {
  if (worldMode !== 'meadow' || now - lastLandDetailCull < 220) return;
  lastLandDetailCull = now;
  const detailRange = touchGpuProfile ? 102 : 138;
  const rangeSq = detailRange * detailRange;
  for (const object of landLodDecorations) {
    const dx = object.position.x - state.x, dz = object.position.z - state.z;
    object.visible = dx * dx + dz * dz <= rangeSq;
  }
}
// Dense bubble world: nearby bubbles get shaded sphere LOD; distant bubbles become tiny points.
// This preserves a field of 4,000 individually poppable bubbles without rasterising 4,000 glassy spheres.
const UNDERWATER_BUBBLE_COUNT = 4000;
const UNDERWATER_DETAILED_BUBBLES = touchGpuProfile ? 300 : 760;
const underwaterBubbleMaterial = new THREE.MeshPhysicalMaterial({ color: '#d2fbff', roughness: 0.08, metalness: 0, transparent: true, opacity: 0.48, clearcoat: 1, clearcoatRoughness: 0.04, depthWrite: false });
const underwaterBubbleGeometry = new THREE.SphereGeometry(1, 8, 6);
const underwaterBubbleMesh = new THREE.InstancedMesh(underwaterBubbleGeometry, underwaterBubbleMaterial, UNDERWATER_DETAILED_BUBBLES);
underwaterBubbleMesh.count = UNDERWATER_DETAILED_BUBBLES;
underwaterBubbleMesh.frustumCulled = false; underwaterBubbleMesh.visible = false; waterWorld.add(underwaterBubbleMesh);
const farBubbleGeometry = new THREE.BufferGeometry();
const farBubblePositions = new Float32Array((UNDERWATER_BUBBLE_COUNT - UNDERWATER_DETAILED_BUBBLES) * 3);
farBubbleGeometry.setAttribute('position', new THREE.BufferAttribute(farBubblePositions, 3));
const farBubblePoints = new THREE.Points(farBubbleGeometry, new THREE.PointsMaterial({ color: '#d9fcff', size: 0.68, sizeAttenuation: true, transparent: true, opacity: 0.34, depthWrite: false, blending: THREE.AdditiveBlending }));
farBubblePoints.frustumCulled = false; farBubblePoints.visible = false; waterWorld.add(farBubblePoints);
const underwaterBubbles = [];
const underwaterBubbleDummy = new THREE.Object3D();
const underwaterBubbleCount = UNDERWATER_BUBBLE_COUNT;
const bubbleLodOrder = Uint16Array.from({length: UNDERWATER_BUBBLE_COUNT}, (_, i) => i);
const bubbleLodDistances = new Float32Array(UNDERWATER_BUBBLE_COUNT);
let lastUnderwaterBubbleFieldUpdate = 0;
let lastBubbleLodSort = 0;
const BUBBLE_LOD_SORT_INTERVAL = 240;
for (let i = 0; i < UNDERWATER_BUBBLE_COUNT; i++) {
  const x = (waterRand() * 2 - 1) * 98, z = (waterRand() * 2 - 1) * 98;
  const baseY = i < 190 ? 0.12 + waterRand() * 4.5 : 3 + waterRand() * 24;
  underwaterBubbles.push({ baseX: x, baseZ: z, baseY, size: 0.085 + waterRand() * 0.20, riseSpeed: 0.00020 + waterRand() * 0.00034, drift: 0.28 + waterRand() * 1.1, phase: waterRand() * Math.PI * 2, poppedUntil: 0, currentX: x, currentY: baseY, currentZ: z });
}
underwaterBubbleMesh.count = UNDERWATER_DETAILED_BUBBLES;
farBubbleGeometry.computeBoundingSphere();
const waterJumpBubbles = [];
const waterJumpBubbleGeometry = new THREE.SphereGeometry(0.13, 10, 8);
const waterJumpBubbleBaseMaterial = new THREE.MeshPhysicalMaterial({ color: '#e6ffff', roughness: 0.06, transparent: true, opacity: 0.68, clearcoat: 1, depthWrite: false });
function spawnWaterJumpBubbles() {
  if (worldMode !== 'water') return;
  for (let i = 0; i < 11; i++) {
    const material = waterJumpBubbleBaseMaterial.clone();
    const mesh = new THREE.Mesh(waterJumpBubbleGeometry, material);
    const angle = (i / 11) * Math.PI * 2 + rand() * 0.3;
    mesh.position.set(state.x + Math.cos(angle) * (0.22 + rand() * 0.38), state.y + 0.16, state.z + Math.sin(angle) * (0.22 + rand() * 0.38));
    mesh.scale.setScalar(0.55 + rand() * 0.75); mesh.renderOrder = 3; waterWorld.add(mesh);
    waterJumpBubbles.push({ mesh, material, vx: Math.cos(angle) * (0.3 + rand() * 0.65), vz: Math.sin(angle) * (0.3 + rand() * 0.65), vy: 0.6 + rand() * 1.1, life: 0.55 + rand() * 0.35, maxLife: 0.9 });
  }
}
function updateWaterJumpBubbles(dt) {
  for (let i = waterJumpBubbles.length - 1; i >= 0; i--) {
    const bubble = waterJumpBubbles[i]; bubble.life -= dt;
    bubble.mesh.position.x += bubble.vx * dt; bubble.mesh.position.z += bubble.vz * dt; bubble.mesh.position.y += bubble.vy * dt;
    bubble.vy += 0.22 * dt;
    const k = Math.max(0, bubble.life / bubble.maxLife); bubble.material.opacity = 0.68 * k;
    bubble.mesh.scale.multiplyScalar(1 + dt * 0.9);
    if (bubble.life <= 0) { waterWorld.remove(bubble.mesh); bubble.material.dispose(); waterJumpBubbles.splice(i, 1); }
  }
}
function updateUnderwaterBubbleField(now) {
  underwaterBubbleMesh.visible = worldMode === 'water';
  farBubblePoints.visible = worldMode === 'water';
  if (worldMode !== 'water') return;
  // Update bubble positions and contact at 25 Hz, and sort LOD ranks only 4 times per second.
  // The character/camera still run at full frame rate; far bubbles stay cheap point sprites.
  if (now - lastUnderwaterBubbleFieldUpdate < 40) return;
  lastUnderwaterBubbleFieldUpdate = now;
  const surge = seaCurrent.active ? 5.5 : 1.0;
  const popDistanceSq = 1.06 * 1.06;
  const playerY = state.y + 1.15;
  for (let i = 0; i < underwaterBubbles.length; i++) {
    const bubble = underwaterBubbles[i];
    const x = bubble.baseX + Math.sin(now * 0.00062 + bubble.phase) * bubble.drift * surge + (seaCurrent.active ? seaCurrent.x * Math.sin(now * 0.001 + bubble.phase) * 0.85 : 0);
    const y = 0.25 + (((bubble.baseY + now * bubble.riseSpeed * surge) % 30 + 30) % 30);
    const z = bubble.baseZ + Math.cos(now * 0.00047 + bubble.phase) * bubble.drift * 0.52 + (seaCurrent.active ? seaCurrent.z * Math.cos(now * 0.0011 + bubble.phase) * 0.65 : 0);
    let hidden = now < bubble.poppedUntil;
    if (!hidden) {
      bubble.currentX = x; bubble.currentY = y; bubble.currentZ = z;
      const dx = x - state.x, dy = y - playerY, dz = z - state.z;
      if (state.started && !state.paused && !state.finale.active && Math.abs(dx) < 1.9 && Math.abs(dz) < 1.9 && Math.abs(dy) < 1.45 && dx*dx + dy*dy + dz*dz < popDistanceSq + bubble.size * bubble.size) {
        bubble.poppedUntil = now + 420; hidden = true;
        bubble.baseX = THREE.MathUtils.clamp(state.x + (rand() - 0.5) * 36, -98, 98);
        bubble.baseZ = THREE.MathUtils.clamp(state.z + (rand() - 0.5) * 36, -98, 98);
        bubble.baseY = 0.5 + rand() * 20;
        sfx(880 + rand() * 260, 0.065, 'sine', 0.09);
        sfx(410 + rand() * 120, 0.045, 'triangle', 0.035);
        sparkle(new THREE.Vector3(x, y, z), 3);
      }
    }
    bubble.renderX = x; bubble.renderY = y; bubble.renderZ = z; bubble.renderHidden = hidden;
    // Distance-based LOD: choose detailed bubbles nearest the player, and keep the rest as fast points.
    const dx = x - state.x, dy = y - playerY, dz = z - state.z;
    bubbleLodDistances[i] = dx*dx + dy*dy + dz*dz;
  }
  if (now - lastBubbleLodSort >= BUBBLE_LOD_SORT_INTERVAL) {
    bubbleLodOrder.sort((a,b)=>bubbleLodDistances[a]-bubbleLodDistances[b]);
    lastBubbleLodSort = now;
  }
  for (let slot=0; slot<UNDERWATER_DETAILED_BUBBLES; slot++) {
    const bubble=underwaterBubbles[bubbleLodOrder[slot]];
    underwaterBubbleDummy.position.set(bubble.renderX, bubble.renderHidden ? -300 : bubble.renderY, bubble.renderZ);
    underwaterBubbleDummy.scale.setScalar(bubble.renderHidden ? 0.001 : bubble.size*(0.93+Math.sin(now*0.0018+bubble.phase)*0.07+(seaCurrent.active?0.12:0)));
    underwaterBubbleDummy.rotation.set(Math.sin(now*0.0007+bubble.phase)*0.05,bubble.phase,Math.cos(now*0.0006+bubble.phase)*0.05);
    underwaterBubbleDummy.updateMatrix(); underwaterBubbleMesh.setMatrixAt(slot,underwaterBubbleDummy.matrix);
  }
  let point=0;
  for (let slot=UNDERWATER_DETAILED_BUBBLES; slot<underwaterBubbleCount; slot++) {
    const bubble=underwaterBubbles[bubbleLodOrder[slot]], p=point*3; point++;
    farBubblePositions[p]=bubble.renderX; farBubblePositions[p+1]=bubble.renderHidden?-300:bubble.renderY; farBubblePositions[p+2]=bubble.renderZ;
  }
  underwaterBubbleMesh.instanceMatrix.needsUpdate = true;
  farBubbleGeometry.attributes.position.needsUpdate = true;
}
const seaCurrent = { active: false, nextAt: performance.now() + 18000, until: 0, x: 0.72, z: -0.42, strength: 2.5, nextBubbleSound: 0 };
// Directional white foam makes ocean currents readable before they push the player.
const seaCurrentFx = new THREE.Group(); seaCurrentFx.visible = false; waterWorld.add(seaCurrentFx);
const seaCurrentFoamMaterial = new THREE.MeshBasicMaterial({ color: '#f5ffff', transparent: true, opacity: 0.78, depthWrite: false, toneMapped: false });
const seaCurrentFoamGeometry = new THREE.SphereGeometry(1, 10, 7);
const seaCurrentFoamStreaks = [];
for (let i = 0; i < 28; i++) {
  const streak = new THREE.Mesh(seaCurrentFoamGeometry, seaCurrentFoamMaterial);
  streak.scale.set(0.7, 0.045, 0.13); seaCurrentFx.add(streak); seaCurrentFoamStreaks.push(streak);
}
// Broad, world-spanning foam streaks make a bubbly current visible across the whole ocean.
const globalFoamMaterial = new THREE.MeshBasicMaterial({ color: '#f4ffff', transparent: true, opacity: 0.64, depthWrite: false, toneMapped: false });
const globalFoamGeometry = new THREE.SphereGeometry(1, 8, 6);
const GLOBAL_FOAM_COUNT = 170;
const globalFoamMesh = new THREE.InstancedMesh(globalFoamGeometry, globalFoamMaterial, GLOBAL_FOAM_COUNT);
globalFoamMesh.frustumCulled = false; globalFoamMesh.visible = false; waterWorld.add(globalFoamMesh);
const globalFoamRecords = [];
const globalFoamDummy = new THREE.Object3D();
for (let i = 0; i < GLOBAL_FOAM_COUNT; i++) {
  globalFoamRecords.push({ x: (waterRand() * 2 - 1) * 102, z: (waterRand() * 2 - 1) * 102, y: 0.18 + waterRand() * 26, phase: waterRand() * 210, speed: 0.26 + waterRand() * 0.75, length: 0.38 + waterRand() * 0.9, width: 0.065 + waterRand() * 0.065, wave: 0.6 + waterRand() * 2.1 });
}
function updateGlobalFoam(now) {
  const visible = worldMode === 'water' && seaCurrent.active;
  globalFoamMesh.visible = visible;
  if (!visible) return;
  const heading = Math.atan2(seaCurrent.x, seaCurrent.z);
  for (let i = 0; i < globalFoamRecords.length; i++) {
    const f = globalFoamRecords[i], travel = (now * 0.001 * f.speed + f.phase) % 204;
    const wrap = v => ((v + 102) % 204 + 204) % 204 - 102;
    const x = wrap(f.x + seaCurrent.x * travel - seaCurrent.z * Math.sin(now * 0.0017 + f.phase) * f.wave);
    const z = wrap(f.z + seaCurrent.z * travel + seaCurrent.x * Math.sin(now * 0.0017 + f.phase) * f.wave);
    globalFoamDummy.position.set(x, f.y + Math.sin(now * 0.003 + f.phase) * 0.08, z);
    globalFoamDummy.rotation.set(0, heading + Math.sin(now * 0.002 + f.phase) * 0.25, 0);
    const pulse = 0.78 + 0.3 * (0.5 + 0.5 * Math.sin(now * 0.006 + f.phase));
    globalFoamDummy.scale.set(f.length * pulse, f.width * 0.35, f.width);
    globalFoamDummy.updateMatrix(); globalFoamMesh.setMatrixAt(i, globalFoamDummy.matrix);
  }
  globalFoamMesh.instanceMatrix.needsUpdate = true;
}

const seaCurrentRingGeometry = new THREE.TorusGeometry(1, 0.035, 6, 36);
const seaCurrentRings = [];
for (let i = 0; i < 3; i++) {
  const ring = new THREE.Mesh(seaCurrentRingGeometry, seaCurrentFoamMaterial.clone()); ring.rotation.x = Math.PI / 2;
  ring.scale.setScalar(1 + i * 0.18); seaCurrentFx.add(ring); seaCurrentRings.push(ring);
}
const sandPuffs = [];
const sandPuffGeometry = new THREE.SphereGeometry(0.16, 9, 6);
const sandPuffMaterial = new THREE.MeshStandardMaterial({ color: '#d7c7a1', roughness: 1, transparent: true, opacity: 0.64, depthWrite: false });
function spawnSandPuff() {
  if (worldMode !== 'water') return;
  for (let i = 0; i < 8; i++) {
    const material = sandPuffMaterial.clone();
    const mesh = new THREE.Mesh(sandPuffGeometry, material);
    const angle = (i / 8) * Math.PI * 2 + rand() * 0.22;
    const radius = 0.18 + rand() * 0.32;
    mesh.position.set(state.x + Math.cos(angle) * radius, 0.08 + rand() * 0.05, state.z + Math.sin(angle) * radius);
    mesh.scale.setScalar(0.45 + rand() * 0.6); waterWorld.add(mesh);
    sandPuffs.push({ mesh, material, vx: Math.cos(angle) * (0.45 + rand() * 0.65), vz: Math.sin(angle) * (0.45 + rand() * 0.65), vy: 0.35 + rand() * 0.55, life: 0.42 + rand() * 0.22, maxLife: 0.64 });
  }
}
function updateSandPuffs(dt) {
  for (const puff of sandPuffs.slice()) {
    puff.life -= dt; puff.mesh.position.x += puff.vx * dt; puff.mesh.position.z += puff.vz * dt;
    puff.mesh.position.y += puff.vy * dt; puff.vy -= 0.48 * dt;
    const k = Math.max(0, puff.life / puff.maxLife); puff.material.opacity = 0.64 * k;
    puff.mesh.scale.multiplyScalar(1 + dt * 1.8);
    if (puff.life <= 0) { waterWorld.remove(puff.mesh); puff.material.dispose(); sandPuffs.splice(sandPuffs.indexOf(puff), 1); }
  }
}
const underwaterSnowPositions = new Float32Array(560 * 3);
for (let i = 0; i < underwaterSnowPositions.length; i += 3) {
  underwaterSnowPositions[i] = (waterRand() * 2 - 1) * 105;
  underwaterSnowPositions[i + 1] = 1 + waterRand() * 29;
  underwaterSnowPositions[i + 2] = (waterRand() * 2 - 1) * 105;
}
const underwaterSnowGeometry = new THREE.BufferGeometry(); underwaterSnowGeometry.setAttribute('position', new THREE.BufferAttribute(underwaterSnowPositions, 3));
const underwaterSnow = new THREE.Points(underwaterSnowGeometry, new THREE.PointsMaterial({ color: '#d8fbff', size: 0.12, transparent: true, opacity: 0.52, depthWrite: false, sizeAttenuation: true }));
underwaterSnow.frustumCulled = false; waterWorld.add(underwaterSnow);

// Seafoam mints are the Water World's own collectible: cooler cyan disks with a white spiral.
const waterMints = [];
const seaMintBodyMat = new THREE.MeshStandardMaterial({ color: '#55dce5', map: platformMintTexture, bumpMap: platformMintBump, bumpScale: 0.08, roughness: 0.62, metalness: 0.04, emissive: '#0a6575', emissiveIntensity: 0.12 });
const seaMintEdgeMat = new THREE.MeshStandardMaterial({ color: '#b7fbf8', roughness: 0.45, metalness: 0.04, emissive: '#5adfe5', emissiveIntensity: 0.2 });
const seaMintSpiralMat = new THREE.MeshBasicMaterial({ color: '#f4ffed', toneMapped: false });
const seaMintGlowMat = new THREE.MeshBasicMaterial({ color: '#a4fff5', transparent: true, opacity: 0.52, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending });
const baseSeaMintSpots = [
  [-92,-78],[-78,-69],[-65,-66],[-51,-55],[-39,-49],[-25,-40],[-12,-34],[1,-27],[14,-20],[29,-14],
  [42,-7],[55,0],[68,8],[82,15],[92,22],[-83,-48],[-68,-37],[-55,-31],[-41,-22],[-28,-15],
  [-13,-5],[2,2],[17,10],[33,18],[47,26],[62,33],[78,43],[88,53],[-51,4],[20,65],
];
// A second, offset parallel sweep makes the path vague and exploratory rather than tightly packed.
const seaMintSpots = [...baseSeaMintSpots, ...baseSeaMintSpots.map(([x,z], i) => [
  THREE.MathUtils.clamp(x - 7 + ((i % 4) - 1.5) * 2.0, -96, 96),
  THREE.MathUtils.clamp(z + 10 + ((i % 5) - 2) * 2.4, -96, 96),
])];
if (seaMintSpots.length !== WATER_MINT_TOTAL) throw new Error(`Water World should contain ${WATER_MINT_TOTAL} sea mints (20% cushion); found ${seaMintSpots.length}`);
for (let i = 0; i < seaMintSpots.length; i++) {
  const [x, z] = seaMintSpots[i];
  const group = new THREE.Group();
  const disk = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.36, 0.16, 28), seaMintBodyMat);
  disk.castShadow = true; disk.receiveShadow = true; group.add(disk);
  const aura = new THREE.Mesh(new THREE.TorusGeometry(0.56, 0.026, 8, 36), seaMintGlowMat);
  aura.rotation.x = Math.PI / 2; aura.position.y = 0.025; group.add(aura);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.335, 0.034, 8, 28), seaMintEdgeMat);
  rim.rotation.x = Math.PI / 2; rim.position.y = 0.085; group.add(rim);
  // A raised mint-white swirl distinguishes these from the meadow's golden fizzy pearls.
  const swirlPoints = [];
  for (let step = 0; step <= 36; step++) {
    const t = step / 36, angle = t * Math.PI * 4.3;
    const radius = 0.018 + 0.245 * t;
    swirlPoints.push(new THREE.Vector3(Math.cos(angle) * radius, 0.105 + 0.018 * Math.sin(t * Math.PI), Math.sin(angle) * radius));
  }
  const swirlCurve = new THREE.CatmullRomCurve3(swirlPoints);
  group.add(new THREE.Mesh(new THREE.TubeGeometry(swirlCurve, 48, 0.018, 5, false), seaMintSpiralMat));
  const glint = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 6), new THREE.MeshBasicMaterial({ color: '#ffffff', toneMapped: false }));
  glint.position.set(-0.18, 0.11, -0.15); group.add(glint);
  group.position.set(x, 1.92 + (i % 3) * 0.12, z); waterWorld.add(group);
  waterMints.push({ group, x, z, baseY: group.position.y, phase: waterRand() * Math.PI * 2, collected: false });
}
if (waterMints.length !== WATER_MINT_TOTAL || waterMints.length < WATER_MINT_REQUIREMENT) throw new Error(`Water World created ${waterMints.length} collectibles; ${WATER_MINT_TOTAL} expected and ${WATER_MINT_REQUIREMENT} required.`);


// A friendly giant sea turtle can be boarded by landing on its broad shell.
// While aboard, it slowly steers toward the nearest uncollected Seafoam Mint.
const seaTurtle = (() => {
  // Park the turtle beside the spawn, not underneath it. The player must approach and hop aboard.
  const group = new THREE.Group(); group.position.set(7.1, 0, 12); waterWorld.add(group);
  const skin = new THREE.MeshStandardMaterial({ color:'#4b9b83', roughness:0.86, bumpMap:meadowGrassBump, bumpScale:0.045 });
  const flipperMat = new THREE.MeshStandardMaterial({ color:'#62b69a', roughness:0.9, bumpMap:ivoryBump, bumpScale:0.035 });
  const shellCanvas = document.createElement('canvas'); shellCanvas.width = 512; shellCanvas.height = 512;
  const shellCtx = shellCanvas.getContext('2d');
  const shellGrad = shellCtx.createRadialGradient(190,165,15,260,265,360);
  shellGrad.addColorStop(0,'#83a965'); shellGrad.addColorStop(0.55,'#4c8158'); shellGrad.addColorStop(1,'#244d3e');
  shellCtx.fillStyle=shellGrad; shellCtx.fillRect(0,0,512,512);
  for(let row=-1;row<7;row++) for(let col=-1;col<7;col++) {
    const x=col*86+(row%2)*43, y=row*74, radius=45;
    shellCtx.beginPath(); for(let k=0;k<6;k++){const a=Math.PI/3*k+Math.PI/6; const px=x+Math.cos(a)*radius,py=y+Math.sin(a)*radius*0.82; if(k===0)shellCtx.moveTo(px,py);else shellCtx.lineTo(px,py);} shellCtx.closePath();
    const tint=(row*7+col*11+80)%19;
    shellCtx.fillStyle=`rgba(${tint>9?160:15},${tint>9?188:48},${tint>9?105:40},0.20)`; shellCtx.fill();
    shellCtx.strokeStyle='rgba(210,218,148,0.56)'; shellCtx.lineWidth=3; shellCtx.stroke();
    shellCtx.strokeStyle='rgba(20,55,43,0.34)'; shellCtx.lineWidth=1.4; shellCtx.stroke();
    shellCtx.beginPath();shellCtx.ellipse(x-5,y-6,24,14,-0.35,0,Math.PI*1.65);shellCtx.strokeStyle='rgba(230,230,171,0.25)';shellCtx.lineWidth=2;shellCtx.stroke();
  }
  const shellPattern = new THREE.CanvasTexture(shellCanvas); shellPattern.colorSpace=THREE.SRGBColorSpace; shellPattern.wrapS=THREE.RepeatWrapping; shellPattern.wrapT=THREE.RepeatWrapping; shellPattern.repeat.set(1.5,1.2); shellPattern.anisotropy=4;
  const shellMat = new THREE.MeshStandardMaterial({ color:'#ffffff', map:shellPattern, roughness:0.74, bumpMap:stoneBumpTexture, bumpScale:0.11, metalness:0.025 });
  const shellRimMat = new THREE.MeshStandardMaterial({ color:'#b3ca83', roughness:0.88 });
  const bellyMat = new THREE.MeshStandardMaterial({ color:'#c6d9a2', roughness:0.95 });
  const body = new THREE.Mesh(new THREE.SphereGeometry(1,22,14),skin); body.position.set(0,0.63,0); body.scale.set(2.8,0.68,3.45); body.castShadow=true; group.add(body);
  const belly = new THREE.Mesh(new THREE.SphereGeometry(1,24,12),bellyMat); belly.position.set(0,0.55,0); belly.scale.set(2.8,0.42,3.0); group.add(belly);
  const shell = new THREE.Mesh(new THREE.SphereGeometry(1,36,18,0,Math.PI*2,0,Math.PI/2),shellMat);
  shell.position.set(0,0.77,0); shell.scale.set(4.15,1.67,3.25); shell.castShadow=true; shell.receiveShadow=true; group.add(shell);
  // Pale seam pattern follows the dome like a real segmented turtle shell.
  const scutePositions = [[0,0],[-1.55,0],[1.55,0],[-0.78,-1.25],[0.78,-1.25],[-0.78,1.25],[0.78,1.25]];
  for (let i=0;i<scutePositions.length;i++) {
    const [x,z] = scutePositions[i]; const q=(x/4.15)**2+(z/3.25)**2;
    const seam = new THREE.Mesh(new THREE.TorusGeometry(i===0?0.78:0.62,0.035,6,28),shellRimMat);
    seam.rotation.x=Math.PI/2; seam.position.set(x,0.77+1.67*Math.sqrt(Math.max(0.12,1-q))+0.012,z); group.add(seam);
  }
  const flippers=[];
  for (const side of [-1,1]) for (const fore of [-1,1]) {
    const f = new THREE.Mesh(new THREE.SphereGeometry(1,16,11),flipperMat);
    f.position.set(side*2.85,0.48,fore*1.95); f.scale.set(1.18,0.25,0.72); f.rotation.y=side*fore*0.38; f.castShadow=true; group.add(f); flippers.push({mesh:f,side,fore,base:f.rotation.z});
    for (let claw=0;claw<2;claw++) {
      const nail = new THREE.Mesh(new THREE.ConeGeometry(0.10,0.25,6),bellyMat);
      nail.position.set(side*3.52,0.42,fore*1.95+(claw?0.22:-0.22)); nail.rotation.z=side*Math.PI/2; group.add(nail);
    }
  }
  const head = new THREE.Mesh(new THREE.SphereGeometry(1,20,14),skin); head.position.set(0,0.94,3.55); head.scale.set(0.92,0.76,1.05); head.castShadow=true; group.add(head);
  const eyeMat = new THREE.MeshStandardMaterial({ color:'#183e36', roughness:0.55 });
  const eyeShine = new THREE.MeshBasicMaterial({ color:'#ffffff' });
  for (const side of [-1,1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.105,12,8),eyeMat); eye.position.set(side*0.56,1.18,4.17); group.add(eye);
    const shine = new THREE.Mesh(new THREE.SphereGeometry(0.035,8,6),eyeShine); shine.position.set(side*0.585,1.22,4.235); group.add(shine);
  }
  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.32,0.9,8),skin); tail.position.set(0,0.65,-3.55); tail.rotation.x=-Math.PI/2; group.add(tail);
  return { group, flippers, heading:0, vx:0, vz:0, target:null, phase:Math.random()*6.28, topY:2.44, riderOffsetZ:-0.15 };
})();
function seaTurtleSurfaceAt(x,z) {
  const dx=x-seaTurtle.group.position.x, dz=z-seaTurtle.group.position.z;
  const c=Math.cos(seaTurtle.heading),sn=Math.sin(seaTurtle.heading);
  const lx=dx*c-dz*sn, lz=dx*sn+dz*c;
  const q=(lx/4.02)**2+(lz/3.04)**2;
  if(q>0.92) return null;
  return seaTurtle.group.position.y+0.77+1.67*Math.sqrt(Math.max(0,1-q))+0.025;
}
function updateSeaTurtle(dt,now) {
  if(worldMode!=='water') return;
  if(state.started && !state.paused && !state.finale.active) {
    let desiredX=0,desiredZ=0;
    // Stay still enough to board until the player lands on the shell. Once ridden, the turtle
    // follows the nearest remaining Seafoam Mint, then heads for another if the player collects it.
    if(state.ridingTurtle) {
      let target=seaTurtle.target;
      // Lock the target until its mint is collected. Retargeting on a distance threshold caused
      // equal-distance targets to alternate and made the turtle backtrack forever.
      if(!target || target.collected || !target.group.visible) {
        let bestDist=Infinity; target=null;
        for(const mint of waterMints) if(!mint.collected && mint.group.visible) {
          const dist=Math.hypot(mint.x-seaTurtle.group.position.x,mint.z-seaTurtle.group.position.z);
          if(dist<bestDist){bestDist=dist;target=mint;}
        }
        seaTurtle.target=target;
      }
      if(target) {
        const dx=target.x-seaTurtle.group.position.x,dz=target.z-seaTurtle.group.position.z,dist=Math.hypot(dx,dz)||1;
        if(dist<=4.25) {
          collectWaterMint(target);
          seaTurtle.target=null;
        } else {
          desiredX=dx/dist*24.0; desiredZ=dz/dist*24.0; seaTurtle.heading=Math.atan2(dx,dz);
        }
      }
    } else {
      seaTurtle.target=null;
    }
    const smoothing=1-Math.exp(-dt*(state.ridingTurtle?8.5:2.8));
    seaTurtle.vx+=(desiredX-seaTurtle.vx)*smoothing; seaTurtle.vz+=(desiredZ-seaTurtle.vz)*smoothing;
    seaTurtle.group.position.x=THREE.MathUtils.clamp(seaTurtle.group.position.x+seaTurtle.vx*dt,-92,92);
    seaTurtle.group.position.z=THREE.MathUtils.clamp(seaTurtle.group.position.z+seaTurtle.vz*dt,-92,92);
    seaTurtle.group.position.y=0.035+Math.sin(now*0.0021+seaTurtle.phase)*0.065;
    if(state.ridingTurtle && !state.finale.active) {
      for(const mint of waterMints) if(!mint.collected && mint.group.visible && Math.hypot(mint.x-seaTurtle.group.position.x,mint.z-seaTurtle.group.position.z)<4.25) collectWaterMint(mint);
      if(seaTurtle.target?.collected) seaTurtle.target=null;
    }
  }
  seaTurtle.group.rotation.y=seaTurtle.heading;
  for(const [i,flipper] of seaTurtle.flippers.entries()) {
    flipper.mesh.rotation.z=flipper.base+Math.sin(now*0.0042+seaTurtle.phase+(flipper.fore>0?0:Math.PI)+(flipper.side>0?0.8:0))*0.24;
    flipper.mesh.rotation.x=Math.sin(now*0.0032+i*1.7)*0.08;
  }
  seaTurtle.group.children[seaTurtle.group.children.length-1].rotation.z=Math.sin(now*0.003+seaTurtle.phase)*0.11;
}
function resolveSeaTurtleBodyCollision() {
  if(worldMode!=='water' || state.ridingTurtle || state.y>1.6) return;
  const dx=state.x-seaTurtle.group.position.x,dz=state.z-seaTurtle.group.position.z;
  const c=Math.cos(seaTurtle.heading),sn=Math.sin(seaTurtle.heading),lx=dx*c-dz*sn,lz=dx*sn+dz*c;
  const q=(lx/4.25)**2+(lz/3.35)**2;
  if(q>=1) return;
  let nx=dx,nz=dz,dist=Math.hypot(nx,nz)||0.001; nx/=dist;nz/=dist;
  state.x=seaTurtle.group.position.x+nx*4.45; state.z=seaTurtle.group.position.z+nz*3.55;
  const into=state.vx*nx+state.vz*nz;if(into<0){state.vx-=nx*into;state.vz-=nz*into;}
}

// --- Bridge World: an ivy-draped, stacked timber maze with vertical progression ------------------
const bridgeWorld = new THREE.Group(); bridgeWorld.visible = false; scene.add(bridgeWorld);
const bridgeGround = new THREE.Mesh(
  new THREE.PlaneGeometry(223.7, 223.7),
  new THREE.MeshStandardMaterial({ map: meadowGrassTexture, bumpMap: meadowGrassBump, bumpScale: 0.16, color: '#55785a', roughness: 1 })
);
bridgeGround.rotation.x = -Math.PI / 2; bridgeGround.position.y = -0.025; bridgeGround.receiveShadow = true; bridgeWorld.add(bridgeGround);
const bridgePlatforms = [];
const bridgeSwayObjects = [];
const bridgeWood = new THREE.MeshStandardMaterial({ map: barkTexture, bumpMap: barkBumpTexture, bumpScale: 0.12, roughness: 0.96, color: '#a17a50' });
const bridgePlankMat = new THREE.MeshStandardMaterial({ map: woodEndTexture, bumpMap: woodEndBumpTexture, bumpScale: 0.06, roughness: 0.95, color: '#c39a68' });
const bridgeIvyMats = ['#287a49','#388b50','#4a9b5a','#6caf67'].map(c => new THREE.MeshStandardMaterial({ color: c, roughness: 0.95, side: THREE.DoubleSide }));
const bridgeLeafGeo = new THREE.SphereGeometry(0.13, 9, 7);
function addBridgeVine(parent, x, z, height, phase = 0) {
  const points = [];
  for (let i = 0; i <= 6; i++) {
    const t = i / 6;
    points.push(new THREE.Vector3(x + Math.sin(t * 4 + phase) * 0.22, 0.25 - height * t, z + Math.cos(t * 3 + phase) * 0.12));
  }
  const vine = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 14, 0.045, 5, false), bridgeIvyMats[Math.floor(rand() * bridgeIvyMats.length)]);
  parent.add(vine);
  for (let i = 1; i <= 5; i++) {
    const t = i / 6;
    const leaf = new THREE.Mesh(bridgeLeafGeo, bridgeIvyMats[Math.floor(rand() * bridgeIvyMats.length)]);
    leaf.position.set(x + Math.sin(t * 4 + phase) * 0.22 + (i % 2 ? 0.16 : -0.16), 0.25 - height * t, z + Math.cos(t * 3 + phase) * 0.12);
    leaf.scale.set(1.0, 0.58, 0.38); leaf.rotation.z = (i % 2 ? -1 : 1) * 0.58; parent.add(leaf);
  }
  return vine;
}
function addBridgeSegment(spec, idx) {
  const { x, z, y, length, width, rotation = 0 } = spec;
  const group = new THREE.Group(); group.position.set(x, y, z); group.rotation.y = rotation; bridgeWorld.add(group);
  const underside = new THREE.Mesh(new THREE.BoxGeometry(length, 0.34, width), bridgeWood);
  underside.position.y = -0.23; underside.castShadow = true; underside.receiveShadow = true; group.add(underside);
  const plankCount = Math.ceil(length / 1.22), plankWidth = length / plankCount;
  for (let p = 0; p < plankCount; p++) {
    const plank = new THREE.Mesh(new THREE.BoxGeometry(plankWidth - 0.045, 0.15, width - 0.16), bridgePlankMat);
    plank.position.set(-length / 2 + plankWidth * (p + 0.5), -0.025, 0); plank.castShadow = true; plank.receiveShadow = true; group.add(plank);
    // Small dark gaps keep the deck visibly assembled from hand-cut timber.
    const seam = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.012, width - 0.18), new THREE.MeshBasicMaterial({ color: '#5e442f' }));
    seam.position.set(-length / 2 + plankWidth * p, 0.056, 0); group.add(seam);
  }
  // Stacked bridges have rails, posts, diagonal braces and dangling ivy along both sides.
  for (const side of [-1, 1]) {
    for (let pos = -length / 2 + 0.7; pos <= length / 2; pos += 3.4) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.095, 0.12, 1.05, 8), bridgeWood);
      post.position.set(pos, 0.47, side * (width / 2 - 0.08)); post.castShadow = true; group.add(post);
      const cap = new THREE.Mesh(new THREE.SphereGeometry(0.13, 8, 7), bridgePlankMat);
      cap.position.set(pos, 1.02, side * (width / 2 - 0.08)); group.add(cap);
      if (Math.floor((pos + length / 2) / 3.4) % 2 === idx % 2) {
        const vine = addBridgeVine(group, pos + 0.15, side * (width / 2 - 0.05), 1.4 + rand() * 2.1, rand() * Math.PI * 2);
        bridgeSwayObjects.push(vine);
      }
    }
    const ropePoints = [];
    for (let pos = -length / 2; pos <= length / 2 + 0.01; pos += 2.0) ropePoints.push(new THREE.Vector3(pos, 0.72 + Math.sin(pos * 0.28 + idx) * 0.06, side * (width / 2 - 0.08)));
    group.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(ropePoints), Math.max(20, plankCount * 2), 0.075, 7, false), bridgeWood));
  }
  bridgePlatforms.push({ x, z, y, length, width, rotation, group });
  return group;
}
// Each tier is reachable with the temporary jump boost; several bridges cross directly above others.
const bridgeSegmentSpecs = [
  { x: 0, z: 12, y: 1.25, length: 28, width: 4.6, rotation: 0 },
  { x: 1, z: 12, y: 4.65, length: 21, width: 4.0, rotation: 0.02 },
  { x: 12, z: 1, y: 8.05, length: 22, width: 3.8, rotation: -0.68 },
  { x: 14, z: -12, y: 11.45, length: 23, width: 3.8, rotation: -1.38 },
  { x: 0, z: -22, y: 14.85, length: 23, width: 4.0, rotation: -0.18 },
  { x: -15, z: -11, y: 18.25, length: 23, width: 3.8, rotation: 0.88 },
  { x: -17, z: 7, y: 21.65, length: 21, width: 3.8, rotation: 0.88 },
  { x: 0, z: 19, y: 25.05, length: 28, width: 5.0, rotation: 0.0 },
  // Summit deck: a clear, short forward hop from Sora's deck. Deck edges are only 0.2 units apart.
  { x: 1.7, z: 13.8, y: 25.85, length: 28, width: 5.0, rotation: 0.0 },
];
bridgeSegmentSpecs.forEach(addBridgeSegment);
function localBridgePoint(platform, lx, lz = 0) {
  const c = Math.cos(platform.rotation), sn = Math.sin(platform.rotation);
  return { x: platform.x + lx * c + lz * sn, z: platform.z - lx * sn + lz * c };
}
// Tall old trees form a natural perimeter around the bridge canopy.
const bridgeTrunkMat = new THREE.MeshStandardMaterial({ map: barkTexture, bumpMap: barkBumpTexture, bumpScale: 0.16, color: '#8d6848', roughness: 1 });
const bridgeCanopyMats = ['#244f3d','#2f6846','#38774a','#4b8751'].map(c => new THREE.MeshStandardMaterial({ color: c, roughness: 1 }));
for (let i = 0; i < 40; i++) {
  const a = (i / 40) * Math.PI * 2 + (rand() - 0.5) * 0.11;
  const radius = 79 + rand() * 20, x = Math.cos(a) * radius, z = Math.sin(a) * radius;
  const height = 15 + rand() * 15, r = 0.7 + rand() * 1.35;
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.62, r, height, 9), bridgeTrunkMat);
  trunk.position.set(x, height / 2, z); trunk.castShadow = true; trunk.receiveShadow = true; bridgeWorld.add(trunk);
  for (let c = 0; c < 4; c++) {
    const canopy = new THREE.Mesh(new THREE.IcosahedronGeometry(3.6 + rand() * 3.5, 1), bridgeCanopyMats[Math.floor(rand() * bridgeCanopyMats.length)]);
    canopy.position.set(x + (rand() - 0.5) * 5, height - 1.5 + (rand() - 0.5) * 5, z + (rand() - 0.5) * 5);
    canopy.scale.set(1.4, 0.9, 1.2); canopy.castShadow = true; bridgeWorld.add(canopy);
  }
  if (i % 2 === 0) {
    const ivyRoot = new THREE.Group(); ivyRoot.position.set(x + r * 0.4, height * 0.63, z + r * 0.35); bridgeWorld.add(ivyRoot);
    bridgeSwayObjects.push(addBridgeVine(ivyRoot, 0, 0, 3.5 + rand() * 4.2, rand() * Math.PI * 2));
  }
}
windSwayObjects.push(...bridgeSwayObjects);

// Bridge mints are intentionally placed on each tier so vertical exploration is part of the goal.
const bridgeMints = [];
const bridgeMintMaterial = new THREE.MeshStandardMaterial({ color: '#b9f0a1', map: platformMintTexture, bumpMap: platformMintBump, bumpScale: 0.08, roughness: 0.56, metalness: 0.04, emissive: '#376b37', emissiveIntensity: 0.13 });
const bridgeMintRimMaterial = new THREE.MeshStandardMaterial({ color: '#f1ffd8', roughness: 0.46, metalness: 0.05 });
const bridgeMintSpots = [];
bridgePlatforms.forEach((platform) => {
  // Eight per deck: ample optional pickups for the doubled campaign requirement.
  const locals = [-0.41,-0.30,-0.19,-0.08,0.08,0.19,0.30,0.41].map(t => platform.length * t);
  locals.forEach((lx, j) => {
    const point = localBridgePoint(platform, lx, j % 2 ? 0.48 : -0.48);
    bridgeMintSpots.push([point.x, point.z, platform.y]);
  });
});
if (bridgeMintSpots.length !== BRIDGE_MINT_TOTAL || bridgeMintSpots.length < BRIDGE_MINT_REQUIREMENT) throw new Error(`Bridge World needs ${BRIDGE_MINT_TOTAL} collectible mints and at least ${BRIDGE_MINT_REQUIREMENT} for progression; found ${bridgeMintSpots.length}`);
for (let i = 0; i < bridgeMintSpots.length; i++) {
  const [x, z, surfaceY] = bridgeMintSpots[i];
  const group = new THREE.Group();
  const disk = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.38, 0.16, 28), bridgeMintMaterial);
  disk.castShadow = true; disk.receiveShadow = true; group.add(disk);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.345, 0.035, 8, 28), bridgeMintRimMaterial); rim.rotation.x = Math.PI / 2; rim.position.y = 0.085; group.add(rim);
  const hole = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.045, 8, 18), new THREE.MeshStandardMaterial({ color: '#fff9d9', roughness: 0.55 }));
  hole.rotation.x = Math.PI / 2; hole.position.y = 0.11; group.add(hole);
  const spin = new THREE.Mesh(new THREE.TorusGeometry(0.245, 0.018, 5, 28, Math.PI * 1.35), new THREE.MeshBasicMaterial({ color: '#f9fff0' }));
  spin.rotation.x = Math.PI / 2; spin.position.y = 0.11; group.add(spin);
  group.position.set(x, surfaceY + 1.12, z); bridgeWorld.add(group);
  bridgeMints.push({ group, x, z, surfaceY, phase: rand() * Math.PI * 2, collected: false });
}
if (bridgeMints.length !== BRIDGE_MINT_TOTAL || bridgeMints.length < BRIDGE_MINT_REQUIREMENT) throw new Error(`Bridge World created ${bridgeMints.length}; expected ${BRIDGE_MINT_TOTAL}, required ${BRIDGE_MINT_REQUIREMENT}.`);

// Per-tier mint-hole powerups: boost jumps and flash the player's cherry red/yellow.
const bridgePowerups = [];
const powerMintMat = new THREE.MeshStandardMaterial({ color: '#8fe17d', roughness: 0.48, metalness: 0.02, emissive: '#317c42', emissiveIntensity: 0.55 });
const powerMintGlow = new THREE.MeshBasicMaterial({ color: '#d8ff98', transparent: true, opacity: 0.42, depthWrite: false });
const powerSpotSpecs = [
  { x: 8, z: 16, y: 0 },
  ...bridgePlatforms.map((p, i) => { const point = localBridgePoint(p, -p.length * 0.16, 0); return { x: point.x, z: point.z, y: p.y }; }),
];
for (const [i, spec] of powerSpotSpecs.entries()) {
  const group = new THREE.Group();
  const halo = new THREE.Mesh(new THREE.TorusGeometry(0.66, 0.045, 8, 36), powerMintGlow); halo.rotation.x = Math.PI / 2; group.add(halo);
  const mint = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.135, 14, 36), powerMintMat); mint.rotation.x = Math.PI / 2; group.add(mint);
  for (let j = 0; j < 5; j++) {
    const mark = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), bridgeMintRimMaterial);
    const a = j * Math.PI * 0.4; mark.position.set(Math.cos(a) * 0.30, 0.08, Math.sin(a) * 0.30); group.add(mark);
  }
  group.position.set(spec.x, spec.y + 0.86, spec.z); bridgeWorld.add(group);
  bridgePowerups.push({ group, x: spec.x, z: spec.z, surfaceY: spec.y, phase: i * 0.8, respawnAt: 0, collected: false });
}
if (bridgePowerups.length !== bridgePlatforms.length + 1) throw new Error('Bridge World must have one respawning mint-hole power-up per bridge plus the entrance pickup.');

// --- World 4: Blue Ridge Mountain — a winding climb, fresh mints, and strong ridge gusts --------
const mountainWorld = new THREE.Group(); mountainWorld.visible = false; scene.add(mountainWorld);
const mountainGroundMat = new THREE.MeshStandardMaterial({ map: stoneTexture, bumpMap: stoneBumpTexture, bumpScale: 0.20, color: '#758d9b', roughness: 1 });
const mountainGround = new THREE.Mesh(new THREE.PlaneGeometry(223.7, 223.7), mountainGroundMat);
mountainGround.rotation.x = -Math.PI / 2; mountainGround.position.y = -0.08; mountainGround.receiveShadow = true; mountainWorld.add(mountainGround);
const mountainRockMat = new THREE.MeshStandardMaterial({ map: stoneTexture, bumpMap: stoneBumpTexture, bumpScale: 0.17, color: '#718da4', roughness: 1 });
const mountainShadowRockMat = new THREE.MeshStandardMaterial({ map: stoneTexture, bumpMap: stoneBumpTexture, bumpScale: 0.20, color: '#506e88', roughness: 1 });
const mountainSnowMat = new THREE.MeshStandardMaterial({ color: '#edf3ec', roughness: 0.98, bumpMap: stoneBumpTexture, bumpScale: 0.04 });
// Distinct layered blue ridges form the skyline, unrelated to any real-world mountain range.
const mountainSolidColliders = [];
const ridgePeaks = [
  [-86,-78,28,62],[-59,-122,33,74],[-27,-132,25,52],[10,-139,38,82],[49,-125,30,68],[82,-81,25,56],
  [-96,-24,22,46],[96,-17,24,48],[-89,40,26,52],[87,42,22,43],
];
for (const [x,z,r,h] of ridgePeaks) {
  const ridge = new THREE.Mesh(new THREE.ConeGeometry(r, h, 7, 2), mountainRockMat);
  ridge.position.set(x, h * 0.48 - 1.1, z); ridge.rotation.y = rand() * Math.PI; ridge.scale.set(1.22,1,0.76); ridge.castShadow = true; ridge.receiveShadow = true; mountainWorld.add(ridge);
  mountainSolidColliders.push({ kind:'ellipse', x, z, rx:r*1.22, rz:r*0.76, topY:h-0.8 });
  if (h > 58) {
    const cap = new THREE.Mesh(new THREE.ConeGeometry(r * 0.40, h * 0.23, 7, 1), mountainSnowMat);
    cap.position.set(x * 0.99, h * 0.80, z); cap.rotation.y = ridge.rotation.y; cap.scale.set(1.16,1,0.77); mountainWorld.add(cap);
  }
}
// Trail is a sequence of connected, broad inclined ledges on a switchback route. Each edge meets
// the next, so hiking is possible without a perfect jump; the open sides mean a strong gust can
// still knock the player down to the safe base below.
const mountainTrailNodes = [
  { x: 0, z: 76, y: 0.16 }, { x: -15, z: 55, y: 2.35 }, { x: 8, z: 34, y: 4.54 },
  { x: -14, z: 13, y: 6.73 }, { x: 10, z: -8, y: 8.92 }, { x: -12, z: -29, y: 11.11 },
  { x: 10, z: -50, y: 13.30 }, { x: -10, z: -70, y: 15.49 }, { x: 3, z: -88, y: 17.68 },
];
const mountainTrailSegments = [];
function addMountainRamp(startNode, endNode, index) {
  const dx = endNode.x - startNode.x, dz = endNode.z - startNode.z, dy = endNode.y - startNode.y;
  const horizontal = Math.hypot(dx,dz), length = Math.hypot(horizontal,dy), width = 13.2;
  const tangent = new THREE.Vector3(dx,dy,dz).normalize();
  const side = new THREE.Vector3(-dz,0,dx).normalize();
  const up = side.clone().cross(tangent).normalize();
  const basis = new THREE.Matrix4().makeBasis(tangent, up, side);
  const ramp = new THREE.Group(); ramp.quaternion.setFromRotationMatrix(basis);
  ramp.position.set((startNode.x+endNode.x)/2, (startNode.y+endNode.y)/2, (startNode.z+endNode.z)/2).addScaledVector(up,-0.34);
  const bed = new THREE.Mesh(new THREE.BoxGeometry(length,0.68,width), index%2===0 ? mountainRockMat : mountainShadowRockMat);
  bed.castShadow = true; bed.receiveShadow = true; ramp.add(bed); mountainWorld.add(ramp);
  // Small layered stone seams make the trail look carved out of real rock.
  for (let i=1;i<7;i++) {
    const t=i/7;
    const seam = new THREE.Mesh(new THREE.BoxGeometry(0.045,0.018,width-0.35), new THREE.MeshBasicMaterial({color:'#526b7b',transparent:true,opacity:0.52}));
    seam.position.set((t-0.5)*length,0.347,0); ramp.add(seam);
  }
  mountainTrailSegments.push({start:startNode,end:endNode,width,ramp});
}
for (let i=0;i<mountainTrailNodes.length-1;i++) addMountainRamp(mountainTrailNodes[i],mountainTrailNodes[i+1],i);
// Flat, solid stone junctions overlap every ramp end. They eliminate the corner gaps that
// used to let the player fall between switchbacks even though the ramp endpoints touched.
const mountainJunctionMaterial = new THREE.MeshStandardMaterial({ map:stoneTexture, bumpMap:stoneBumpTexture, bumpScale:0.16, color:'#7d9aae', roughness:0.96, side:THREE.DoubleSide });
const mountainJunctionShadowMaterial = new THREE.MeshStandardMaterial({ map:stoneTexture, bumpMap:stoneBumpTexture, bumpScale:0.18, color:'#617e92', roughness:0.98, side:THREE.DoubleSide });
const mountainJunctions = mountainTrailNodes.map(node=>({node,half:7.0,mesh:null}));
function mountainPointOnSegment(segment,t,sideOffset=0) {
  const a=segment.start,b=segment.end,dx=b.x-a.x,dz=b.z-a.z,len=Math.hypot(dx,dz)||1;
  const offX=(-dz/len)*sideOffset,offZ=(dx/len)*sideOffset;
  return { x:a.x+dx*t+offX,z:a.z+dz*t+offZ,y:a.y+(b.y-a.y)*t };
}
function mountainSurfaceAt(segment,x,z) {
  const a=segment.start,b=segment.end,dx=b.x-a.x,dz=b.z-a.z,len2=dx*dx+dz*dz;
  const len=Math.sqrt(len2)||1;
  const rawT=((x-a.x)*dx+(z-a.z)*dz)/(len2||1);
  const t=THREE.MathUtils.clamp(rawT,0,1);
  // Overlapped two-unit end caps make every adjacent ledge a continuous walkable seam.
  const endOverrun=Math.abs(rawT-t)*len;
  if(endOverrun>2.25) return null;
  const px=a.x+dx*t,pz=a.z+dz*t;
  const cross=Math.hypot(x-px,z-pz);
  if(cross>segment.width/2+0.35) return null;
  return {y:a.y+(b.y-a.y)*t,t:rawT,cross,endOverrun,segment};
}
function findMountainSurfaceAt(x,z) {
  const hits=[];
  let weightedY=0,weightSum=0,closestHit=null;
  for(const segment of mountainTrailSegments) {
    const hit=mountainSurfaceAt(segment,x,z);
    if(!hit) continue;
    hits.push(hit);
    if(!closestHit || hit.cross<closestHit.cross) closestHit=hit;
    // Smoothly blend overlapping ramp planes. A ramp's weight fades to zero at its edge,
    // so moving across a switchback cannot switch abruptly from one ramp height to another.
    const edge=segment.width/2+0.35;
    const proximity=THREE.MathUtils.clamp(1-hit.cross/edge,0,1);
    const weight=proximity*proximity;
    weightedY+=hit.y*weight; weightSum+=weight;
  }
  const junction=mountainJunctions.find(item=>Math.abs(x-item.node.x)<=item.half && Math.abs(z-item.node.z)<=item.half);
  if(junction) {
    // Connector-plane influence fades toward the patch boundary, preserving continuity with
    // the ramp outside the corner while filling the inside of each switchback.
    const edgeDistance=Math.max(Math.abs(x-junction.node.x),Math.abs(z-junction.node.z))/junction.half;
    const nodeWeight=0.16*Math.pow(Math.max(0,1-edgeDistance),2);
    weightedY+=junction.node.y*nodeWeight; weightSum+=nodeWeight;
  }
  if(weightSum>1e-8) return {...(closestHit||{}),y:weightedY/weightSum,junction};
  if(junction) return {y:junction.node.y,t:0,cross:0,endOverrun:0,segment:null,junction};
  return null;
}
function mountainSupportBelow(x,z,y) {
  const hit=findMountainSurfaceAt(x,z);
  return hit && hit.y<=y+0.20 ? hit.y : 0;
}
function findMountainLanding(oldY,newY,x,z) {
  if(worldMode!=='mountain' || state.vy>0) return null;
  const hit=findMountainSurfaceAt(x,z);
  if(hit && oldY>=hit.y-0.12 && newY<=hit.y+0.10) return {y:hit.y,segment:hit.segment};
  return null;
}
// Build each switchback connector as a height-matched stone patch rather than a flat box.
// Its vertices sample the same collision surface used by the player, so the visible trail and
// walkable height field stay aligned without a slab protruding through the character.
for(let junctionIndex=0;junctionIndex<mountainJunctions.length;junctionIndex++) {
  const junction=mountainJunctions[junctionIndex], divisions=8, positions=[], indices=[];
  for(let row=0;row<=divisions;row++) for(let col=0;col<=divisions;col++) {
    const lx=-junction.half+(2*junction.half*col/divisions), lz=-junction.half+(2*junction.half*row/divisions);
    const hit=findMountainSurfaceAt(junction.node.x+lx,junction.node.z+lz);
    const y=hit?.y??junction.node.y;
    positions.push(lx,y-junction.node.y+0.012,lz);
  }
  for(let row=0;row<divisions;row++) for(let col=0;col<divisions;col++) {
    const a=row*(divisions+1)+col,b=a+1,c=a+divisions+1,d=c+1;
    indices.push(a,c,b,b,c,d);
  }
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3)); geometry.setIndex(indices); geometry.computeVertexNormals();
  const mesh=new THREE.Mesh(geometry,junctionIndex%2===0?mountainJunctionMaterial:mountainJunctionShadowMaterial);
  mesh.position.set(junction.node.x,junction.node.y,junction.node.z); mesh.receiveShadow=true; mesh.castShadow=false; mountainWorld.add(mesh); junction.mesh=mesh;
}
function isMountainSpawnClear(x,z) {
  for(const block of mountainSolidColliders) {
    if(block.kind==='ellipse') {
      const q=((x-block.x)/(block.rx*1.10))**2+((z-block.z)/(block.rz*1.10))**2;
      if(q<1) return false;
    } else if(Math.hypot(x-block.x,z-block.z)<block.radius+1.15) return false;
  }
  return true;
}
function resolveMountainSolidCollision() {
  if(worldMode!=='mountain') return;
  for(const block of mountainSolidColliders) {
    if(state.y>block.topY+0.3) continue;
    if(block.kind==='ellipse') {
      let dx=state.x-block.x,dz=state.z-block.z;
      let nx=dx/(block.rx||1),nz=dz/(block.rz||1),q=Math.hypot(nx,nz);
      // Ridge walls are solid; keep the player outside the cone's footprint.
      const required=1.035;
      if(q>=required) continue;
      if(q<0.001){nx=1;nz=0;q=1;}
      const length=Math.hypot(nx,nz)||1; nx/=length; nz/=length;
      state.x=block.x+nx*block.rx*required;
      state.z=block.z+nz*block.rz*required;
      const into=state.vx*nx+state.vz*nz;
      if(into<0){state.vx-=nx*into;state.vz-=nz*into;}
    } else {
      let dx=state.x-block.x,dz=state.z-block.z,dist=Math.hypot(dx,dz);
      if(dist<0.001){dx=1;dz=0;dist=1;}
      const min=block.radius+0.95;
      if(dist>=min) continue;
      const nx=dx/dist,nz=dz/dist; state.x=block.x+nx*min; state.z=block.z+nz*min;
      const into=state.vx*nx+state.vz*nz; if(into<0){state.vx-=nx*into;state.vz-=nz*into;}
    }
  }
}
function resolveMountainTrailMovement(oldX,oldY,oldZ,oldVy) {
  if(worldMode!=='mountain') return;
  const oldSurface=findMountainSurfaceAt(oldX,oldZ);
  const newSurface=findMountainSurfaceAt(state.x,state.z);
  const wasGrounded=oldVy<=0.05 && state.vy<=0.05 && ((oldSurface && oldY>=oldSurface.y-0.32 && oldY<=oldSurface.y+0.34) || (!oldSurface && oldY<=0.05));
  if(wasGrounded && newSurface) {
    const rise=newSurface.y-oldY;
    // Follow the rock ramp while walking. Per-frame slope steps are tiny; the generous
    // seam cap catches the two switchback transitions that previously let feet fall through.
    if(rise<=0.65 && rise>=-1.4) { state.y=newSurface.y; state.vy=0; }
  } else if(state.vy<=0 && newSurface && oldY>=newSurface.y-0.15 && state.y<=newSurface.y+0.10) {
    state.y=newSurface.y; state.vy=0;
  }
  resolveMountainSolidCollision();
}
// Rock outcrops flank the path but leave its middle open for walking and collecting.
for (let i=0;i<mountainTrailSegments.length;i++) {
  const seg=mountainTrailSegments[i];
  for (const t of [0.30,0.72]) for (const side of [-1,1]) {
    const size=1.05+rand()*1.65;
    const pt=mountainPointOnSegment(seg,t,side*(seg.width/2+size*1.25+1.25));
    const rock=new THREE.Mesh(new THREE.DodecahedronGeometry(1,1),i%2?mountainRockMat:mountainShadowRockMat);
    rock.position.set(pt.x,pt.y+size*0.52-0.1,pt.z); rock.scale.set(size*1.25,size*0.9,size); rock.rotation.set(rand()*0.3,rand()*Math.PI,rand()*0.28); rock.castShadow=true; rock.receiveShadow=true; mountainWorld.add(rock);
    mountainSolidColliders.push({kind:'rock',x:pt.x,z:pt.z,radius:size*0.82,topY:pt.y+size*0.95});
  }
}
const mountainCritterWorld = new THREE.Group(); mountainWorld.add(mountainCritterWorld);
const mountainMintMaterial = new THREE.MeshStandardMaterial({ color:'#c8ffd1', map:platformMintTexture, bumpMap:platformMintBump, bumpScale:0.065, roughness:0.48, emissive:'#3c8a65', emissiveIntensity:0.23 });
const mountainMintRimMaterial = new THREE.MeshStandardMaterial({ color:'#efffe9', roughness:0.36, metalness:0.03 });
const mountainMintSpots=[];
for(let si=0;si<mountainTrailSegments.length;si++) {
  const segment=mountainTrailSegments[si];
  const count=Math.floor(MOUNTAIN_MINT_TOTAL/mountainTrailSegments.length)+(si<MOUNTAIN_MINT_TOTAL%mountainTrailSegments.length?1:0);
  for(let j=0;j<count;j++) {
    const t=(j+0.72)/(count+0.56), off=(j%2===0?-2.8:2.8);
    const pt=mountainPointOnSegment(segment,t,off);
    mountainMintSpots.push({x:pt.x,z:pt.z,surfaceY:pt.y});
  }
}
if(mountainMintSpots.length!==MOUNTAIN_MINT_TOTAL || mountainMintSpots.length<MOUNTAIN_MINT_REQUIREMENT) throw new Error(`Blue Ridge Mountain requires ${MOUNTAIN_MINT_REQUIREMENT} mints and must spawn ${MOUNTAIN_MINT_TOTAL}; found ${mountainMintSpots.length}.`);
const mountainMints=[];
for(let i=0;i<mountainMintSpots.length;i++) {
  const spot=mountainMintSpots[i], group=new THREE.Group();
  const disk=new THREE.Mesh(new THREE.CylinderGeometry(0.34,0.37,0.15,28),mountainMintMaterial); disk.castShadow=true; group.add(disk);
  const rim=new THREE.Mesh(new THREE.TorusGeometry(0.325,0.032,8,28),mountainMintRimMaterial); rim.rotation.x=Math.PI/2; rim.position.y=0.078; group.add(rim);
  const hole=new THREE.Mesh(new THREE.TorusGeometry(0.12,0.04,8,18),mountainMintRimMaterial); hole.rotation.x=Math.PI/2; hole.position.y=0.10; group.add(hole);
  group.position.set(spot.x,spot.surfaceY+1.05,spot.z); mountainWorld.add(group);
  mountainMints.push({group,x:spot.x,z:spot.z,surfaceY:spot.surfaceY,phase:rand()*Math.PI*2,collected:false});
}
if(mountainMints.length!==MOUNTAIN_MINT_TOTAL || mountainMints.length<MOUNTAIN_MINT_REQUIREMENT) throw new Error(`Blue Ridge Mountain generated ${mountainMints.length}; goal ${MOUNTAIN_MINT_REQUIREMENT}.`);
const mountainGustGroup = new THREE.Group(); mountainGustGroup.visible=false; mountainWorld.add(mountainGustGroup);
const mountainGustMaterial = new THREE.MeshBasicMaterial({color:'#e9f5ff',transparent:true,opacity:0.68,depthWrite:false});
const mountainGustStreaks=[];
for(let i=0;i<58;i++) {
  const streak=new THREE.Mesh(new THREE.CapsuleGeometry(0.025,0.45+rand()*0.95,2,5),mountainGustMaterial);
  streak.rotation.z=Math.PI/2; streak.visible=true; mountainGustGroup.add(streak);
  mountainGustStreaks.push({mesh:streak,phase:rand()*Math.PI*2,span:8+rand()*30,height:0.5+rand()*5.4});
}

// --- Friends (each is a little plush with its own name, colour, and conversation) ------------------
function makeNameSprite(name) {
  const c = document.createElement('canvas'); c.width = 384; c.height = 112;
  const ctx = c.getContext('2d');
  ctx.fillStyle = 'rgba(255,255,249,0.94)';
  ctx.beginPath(); ctx.roundRect(8, 8, 368, 96, 35); ctx.fill();
  ctx.strokeStyle = 'rgba(102,186,166,.6)'; ctx.lineWidth = 5; ctx.stroke();
  ctx.fillStyle = '#326e64'; ctx.font = 'bold 39px ui-rounded, system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(name, 192, 57);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = anisotropy;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
  sprite.scale.set(2.35, 0.69, 1); sprite.renderOrder = 5;
  return sprite;
}
const friendSpecs = [
  { name: 'Momo', x: 18, z: -14, color: '#e889b4', tail: '#b85c6f', accessory: 'cherry', eyes: '#75423e', lines: ['Oh! You have a cherry, too. Twinsies!','I collect bubbles that look like tiny planets. That pearly one over there is my favourite.','If you follow the flower trail, it loops all the way back here. No rush, though.'], seaLines: ['Cherry twinsies, but underwater! My stem keeps tickling the bubbles.','I heard that sea mints taste like the first cold sip of soda. Is that true?','If the current carries you east, there is a garden of pink coral.'] },
  { name: 'Purin', x: -20, z: -22, color: '#eebf67', tail: '#a46d45', accessory: 'cloud', eyes: '#744d3c', lines: ['Welcome to the meadow! I was just practicing my very slow dance.','One, two… wiggle. One, two… wiggle. Perfect, right?','You make this place feel extra fizzy. Here, take a little sparkle.'], seaLines: ['My cloud hat is getting very good at catching tiny bubbles.','Under the water, everything sounds like a lullaby wrapped in a blanket.','Try drifting past the tall kelp. It sways along when you wiggle.'] },
  { name: 'Lulu', x: -37, z: 13, color: '#a88cdf', tail: '#7a66b4', accessory: 'bow', eyes: '#44335c', lines: ['I picked this bow from a cloud. It is made of exceptionally soft sky.','Sometimes I float up high just to see the whole meadow. You can do that, too!','I think the cherry on your head is a very good hat.'], seaLines: ['My ribbon is floating straight up. I feel like a very fancy jellyfish.','The blue light down here makes every pearl look like a little star.','I am collecting names for these tiny fish-shaped shadows. Any ideas?'] },
  { name: 'Berry', x: 40, z: 27, color: '#f0dfc8', tail: '#c68c9b', accessory: 'strawberry', eyes: '#91515a', savedMintGift: true, lines: ['A tiny secret: the strawberries here are mostly made of felt.','They are still very nice to look at, and they never go mushy.','I saved a mint for you! Take it—one fizz closer to your goal.'], seaLines: ['I found a tiny sea strawberry, but a shrimp borrowed it as a hat.','The sea mints are cooler blue than the meadow fizz. They tingle a little!','When I close my eyes, the bubble trails sound like soft rain.'] },
  { name: 'Mugi', x: 2, z: -44, color: '#9b6844', tail: '#65442f', accessory: 'candy', eyes: '#3e3029', lines: ['This patch of meadow is perfect for a nap. Very fluffy ground.','I tried counting the bubbles, but they kept drifting away and I forgot my place.','Maybe you will have better luck! Or we can just enjoy them.'], seaLines: ['My wrapped candy stays dry in the water. I have no idea how.','There are soft sandy ripples over there. I am trying not to fall asleep on them.','A mint that tastes like sea breeze? That sounds like a very good snack.'] },
  { name: 'Sora', x: -53, z: -39, color: '#76b9e8', tail: '#4d83b7', accessory: 'flower', eyes: '#22485b', lines: ['The sky is so minty today. Or is the meadow making the sky look minty?','When you float, you can see all the little paths the flowers make.','I hope you find a new favourite place today.'], seaLines: ['My flower smells like clean rain, even though we are under the sea.','Look up through the water surface. The sunlight is dancing!','I think the tiny bubbles are trying to tell us a story in Morse code.'] },
  { name: 'Mizu', x: 61, z: -32, color: '#e98566', tail: '#bd604d', accessory: 'wrappedCandy', eyes: '#173b35', lines: ['I am guarding this very important flower. It is important because it is cute.','You can wander anywhere around here. The meadow goes on and on.','Let us meet here again after your next little adventure.'], seaLines: ['I traded a shiny shell for this wrapped candy. Best trade ever.','Sometimes the current nudges me around like a very polite shopping cart.','There are sea mints nearby. The minty ones are my favourite flavour.'] },
  { name: 'Kiki', x: 30, z: 61, color: '#b6cb4e', tail: '#7c9635', accessory: 'flower', eyes: '#57466c', lines: ['I like looking for pearls near the edge of the big flower patch.','There is no score for being quick. I like to take the scenic route.','Here is a little hello-sparkle, just for you.'], seaLines: ['My flower petals are waving even when I am completely still.','The sea floor is full of tiny treasure, not just the shiny kind.','If you see a mint with a blue stripe, save it for a friend who needs a cool-down.'] },
];
const friends = friendSpecs.map((spec, index) => {
  const slug = buildSlug({ bodyColor: spec.color, eyeColor: spec.eyes, tailColor: spec.tail, cherry: spec.accessory === 'cherry', accessory: spec.accessory === 'cherry' ? 'none' : spec.accessory, furCount: 1450, size: 0.82 + (index % 3) * 0.04 });
  slug.position.set(spec.x, 0, spec.z);
  slug.rotation.y = Math.atan2(-spec.x, 12 - spec.z);
  scene.add(slug);
  const name = makeNameSprite(spec.name); name.position.set(spec.x, 4.05, spec.z); scene.add(name);
  const bubbleMesh = new THREE.Mesh(new THREE.SphereGeometry(0.24, 14, 10), new THREE.MeshPhysicalMaterial({ color: '#fffaf2', roughness: 0.15, transparent: true, opacity: 0.8, clearcoat: 0.9 }));
  bubbleMesh.position.set(spec.x + 1.4, 3.5, spec.z); bubbleMesh.visible = false; scene.add(bubbleMesh);
  const bobble = { group: bubbleMesh, y: 3.5, phase: rand() * 6.28 };
  return { ...spec, slug, nameSprite: name, bobble, met: false, dialogueIndex: 0, phase: rand() * Math.PI * 2, worldFloorY: 0 };
});
const bridgeFriendLines = {
  Momo: ['I can see three bridges crossing from up here. I counted twice to be sure.','The ivy makes the old rails feel like they are wearing green scarves.','The mint-hole boost makes my cherry feel fizzy all the way down to my tail.'],
  Purin: ['The highest bridge wobbles a little, but it is brave about it.','I like the tiny shadows where one bridge passes over another.','If your cherry starts flashing, hop for the upper deck!'],
  Lulu: ['A ribbon of ivy is growing all the way toward the treetops.','I found a mint with a hole in it. It looks like a tiny green window.','The bridges sound different when you land on each plank.'],
  Berry: ['These planks are old, but the ivy keeps them company.','I tucked a little flower in a bridge rail. It is our secret garden now.','The upper levels catch the warmest colour from the sky.'],
  Mugi: ['I tried to nap on the second bridge and woke up on the first.','You can see the whole forest through the gaps between planks.','Save a jump boost for the big climb around the twisted bridge.'],
  Sora: ['The bridges make a zig-zag staircase through the canopy.','I love how the sun paints little bars of light across the wood.','A mint-hole boost makes the cherry flash like a tiny traffic light.'],
  Mizu: ['Look under that bridge: there is another bridge underneath it!','The ivy is hanging down so far that it nearly brushes the grass.','If the wind picks up, the ropes and leaves sway together.'],
  Kiki: ['I planted a flower beside the top bridge. It is very proud of itself.','The view from this high up makes the meadow look like a felt blanket.','One more mint and the whole bridge garden will be yours.'],
};
for (const friend of friends) friend.bridgeLines = bridgeFriendLines[friend.name] || ['The bridges are taller than they look.','Ivy makes everything feel a little more magical.','See you on the next bridge!'];
const mountainFriendLines = {
  Momo:['The ridge turns blue when the clouds drift through it.','I found a mint so crisp it made my feelers tingle.','Lean into the gusts, but not too much, or you will tumble to the base!'],
  Purin:['Every little ledge is a place to catch your breath.','Those blue ridges are made-up mountains, but I still think they look grand.','I saved a spot near the summit where the breeze sounds like a flute.'],
  Mugi:['I brought a very small picnic. The wind keeps trying to borrow it.','Fresh mountain mints taste cool like morning air.','The switchback path is easier than climbing straight up.'],
  Sora:['From up here the whole meadow looks like a green quilt.','Wait for a gust to pass before jumping to the next ledge.','I can see three different shades of blue in the ridge.'],
  Mizu:['These rocks have been polished by a thousand tiny breezes.','I tried to count the ridges and lost count at seventeen.','There is a fresh mint just around the next bend.'],
  Lulu:['Mountain air makes my ribbon flutter all by itself.','The safest path zig-zags instead of going straight up.','Do you think the summit can see the ocean?'],
  Berry:['This is the freshest mint patch of all four worlds.','I tucked a little charm under that blue rock.','Take your time. The summit is not going anywhere.'],
  Kiki:['A gust nearly carried my flower away, but I held on!','See how the path is made of broad stone shelves?','The view from the top is worth all the little hops.'],
};
for (const friend of friends) friend.mountainLines = mountainFriendLines[friend.name] || ['The blue ridge feels wonderfully breezy.','Fresh mint grows all along the switchback path.','I will meet you nearer the summit.'];

// Little biome wildlife adds life without becoming a friend, enemy, or interaction target.
const ambientCreatureRecords = [];
const meadowCritterWorld = new THREE.Group(); scene.add(meadowCritterWorld); landDecorationObjects.push(meadowCritterWorld);
const waterCritterWorld = new THREE.Group(); waterWorld.add(waterCritterWorld);
const bridgeCritterWorld = new THREE.Group(); bridgeWorld.add(bridgeCritterWorld);
const critterMaterialCache = new Map();
function critterMat(color, roughness = 0.94) {
  const key = `${color}/${roughness}`;
  if (!critterMaterialCache.has(key)) critterMaterialCache.set(key, new THREE.MeshStandardMaterial({ color, roughness, metalness: 0 }));
  return critterMaterialCache.get(key);
}
function critterMesh(parent, geometry, material, position, scale = [1,1,1]) {
  const mesh = new THREE.Mesh(geometry, material); mesh.position.set(...position); mesh.scale.set(...scale);
  mesh.castShadow = false; mesh.receiveShadow = false; parent.add(mesh); return mesh;
}
function critterSegment(parent, a, b, radius, material, animateLeg = false) {
  const av = new THREE.Vector3(...a), bv = new THREE.Vector3(...b), dir = bv.clone().sub(av);
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.75, radius, dir.length(), 5), material);
  mesh.position.copy(av.add(bv).multiplyScalar(0.5)); mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0), dir.normalize());
  mesh.userData.gaitLeg = animateLeg; mesh.castShadow = false; parent.add(mesh); return mesh;
}
function makeAmbientCreature(kind, parent, x, z, y = 0, color = '#a66d45', index = 0) {
  const group = new THREE.Group(); parent.add(group);
  const bodyMat = critterMat(color, 0.87), dark = critterMat('#463c35'), legMat = critterMat('#5b574c'), eyeMat = critterMat('#141e22', 0.25), cream = critterMat('#fff0d5');
  const sphere = new THREE.SphereGeometry(1, 10, 8);
  if (kind === 'beetle') {
    critterMesh(group, sphere, dark, [0,0.18,0], [0.32,0.17,0.43]);
    critterMesh(group, new THREE.SphereGeometry(1,12,9), bodyMat, [0,0.27,-0.04], [0.34,0.16,0.38]);
    critterMesh(group, sphere, bodyMat, [0,0.20,0.39], [0.19,0.15,0.19]);
    for (const side of [-1,1]) {
      critterMesh(group, sphere, eyeMat, [side*0.12,0.25,0.53], [0.035,0.04,0.035]);
      for (let leg = 0; leg < 3; leg++) {
        const zz = 0.23 - leg*0.23;
        critterSegment(group,[side*0.18,0.14,zz],[side*0.39,0.06,zz+(leg-1)*0.12],0.025,legMat,true);
      }
    }
  } else if (kind === 'centipede') {
    for (let i=0;i<8;i++) {
      const zz = 0.44 - i*0.13, rr = 0.105 - i*0.004;
      critterMesh(group, sphere, bodyMat, [Math.sin(i*0.45)*0.035,0.13,zz], [rr,rr,rr*1.05]);
      for (const side of [-1,1]) critterSegment(group,[side*rr*0.65,0.12,zz],[side*(rr+0.13),0.045,zz-0.035],0.012,legMat,true);
    }
    critterMesh(group,sphere,eyeMat,[-0.035,0.17,0.55],[0.025,0.03,0.025]);
    critterMesh(group,sphere,eyeMat,[0.035,0.17,0.55],[0.025,0.03,0.025]);
  } else if (kind === 'fish') {
    critterMesh(group, sphere, bodyMat, [0,0,0], [0.46,0.25,0.22]);
    const tail = critterMesh(group,new THREE.ConeGeometry(0.2,0.33,5),bodyMat,[-0.47,0,0],[1,1,0.8]); tail.rotation.z = -Math.PI/2; group.userData.tailFin = tail;
    critterMesh(group,new THREE.ConeGeometry(0.12,0.25,5),cream,[0.02,0.25,0],[0.65,0.65,0.7]).rotation.z=0.7;
    critterMesh(group,sphere,eyeMat,[0.27,0.075,0.17],[0.045,0.045,0.035]);
  } else if (kind === 'crab') {
    critterMesh(group,sphere,bodyMat,[0,0.18,0],[0.4,0.19,0.31]);
    for (const side of [-1,1]) {
      critterMesh(group,sphere,bodyMat,[side*0.25,0.39,0.12],[0.09,0.12,0.085]);
      critterMesh(group,sphere,eyeMat,[side*0.27,0.42,0.18],[0.03,0.035,0.03]);
      for(let leg=0;leg<3;leg++) critterSegment(group,[side*0.25,0.15,-0.12+leg*0.12],[side*(0.47+leg*0.03),0.07,-0.19+leg*0.19],0.025,bodyMat,true);
      critterSegment(group,[side*0.31,0.23,0.13],[side*0.48,0.3,0.26],0.045,bodyMat);
      critterMesh(group,sphere,bodyMat,[side*0.51,0.31,0.28],[0.09,0.07,0.08]);
    }
  } else if (kind === 'cricket') {
    critterMesh(group,sphere,bodyMat,[0,0.17,-0.03],[0.18,0.13,0.37]);
    critterMesh(group,sphere,bodyMat,[0,0.19,0.37],[0.14,0.12,0.13]);
    for(const side of [-1,1]) {
      for(let leg=0;leg<3;leg++) critterSegment(group,[side*0.10,0.13,0.16-leg*0.16],[side*(leg===2?0.42:0.29),leg===2?0.22:0.045,0.23-leg*0.22],0.025,legMat,true);
      critterSegment(group,[side*0.07,0.24,0.43],[side*0.15,0.53,0.68],0.012,dark);
    }
  } else if (kind === 'spider') {
    critterMesh(group,sphere,bodyMat,[0,0.18,-0.14],[0.22,0.16,0.27]);
    critterMesh(group,sphere,dark,[0,0.17,0.17],[0.16,0.13,0.16]);
    for(const side of [-1,1]) for(let leg=0;leg<4;leg++) {
      const zz = 0.2-leg*0.15;
      critterSegment(group,[side*0.12,0.18,zz],[side*(0.34+(leg%2)*0.06),0.11,zz+(leg-1.5)*0.12],0.018,dark,true);
      critterSegment(group,[side*(0.34+(leg%2)*0.06),0.11,zz+(leg-1.5)*0.12],[side*0.42,0.035,zz+(leg-1.5)*0.16],0.014,legMat,true);
    }
  }
  group.position.set(x,y,z);
  const animatedLegs = [];
  group.traverse(child => { if (child.userData?.gaitLeg) animatedLegs.push({ mesh: child, baseQuaternion: child.quaternion.clone(), phase: animatedLegs.length * Math.PI * 0.78, axis: new THREE.Vector3(0, 0, 1), swing: new THREE.Quaternion() }); });
  const creatureMotion = {
    fish: { speed: 0.76, wander: 8.5 }, crab: { speed: 1.02, wander: 5.0 },
    beetle: { speed: 0.92, wander: 4.6 }, centipede: { speed: 0.84, wander: 5.2 },
    cricket: { speed: 1.22, wander: 2.8 }, spider: { speed: 0.74, wander: 0.68 },
  }[kind] || { speed: 0.72, wander: 2.5 };
  ambientCreatureRecords.push({ kind, group, homeX:x, homeY:y, homeZ:z, phase:rand()*Math.PI*2, speed: creatureMotion.speed, wander: creatureMotion.wander, index, animatedLegs, heading: rand()*Math.PI*2, nextTurnAt: performance.now()+1200+rand()*2200, turnUntil: 0, turnDir: rand()<0.5?-1:1 });
  return group;
}
// Meadow: beetles and centipedes trundle through the grass, safely ignoring the player.
for (let i=0;i<5;i++) makeAmbientCreature('beetle', meadowCritterWorld, -68+i*28, -28+(i%2)*17, 0, ['#995f3a','#477d49','#9b7048','#6c8d4e','#7c5e4c'][i], i);
for (let i=0;i<4;i++) makeAmbientCreature('centipede', meadowCritterWorld, -52+i*32, 43-(i%2)*19, 0, ['#d07b55','#7b9e50','#be7156','#8a9560'][i], i);
// Water: small fish swim in loose loops and crabs shuffle along the seabed.
for (let i=0;i<5;i++) makeAmbientCreature('fish', waterCritterWorld, -58+i*27, -44+(i%2)*54, 1.8+(i%3)*0.6, ['#f4a5a8','#e5d986','#8bd8db','#b8a3ea','#f5c18a'][i], i);
for (let i=0;i<4;i++) makeAmbientCreature('crab', waterCritterWorld, -55+i*36, 58-(i%2)*26, 0.02, ['#ef8b82','#d77868','#e6b06e','#d87581'][i], i);
// Bridge World: green crickets in the grass and tiny spiders exploring the timber tiers.
for (let i=0;i<3;i++) makeAmbientCreature('cricket', bridgeCritterWorld, -45+i*38, -38+(i%2)*12, 0.02, ['#628949','#829e4c','#527a45'][i], i);
for (let i=0;i<3;i++) {
  const p = bridgePlatforms[[0,4,7][i]], pt = localBridgePoint(p, (i-1)*5, 0);
  makeAmbientCreature('spider', bridgeCritterWorld, pt.x, pt.z, p.y + 0.02, ['#4c3d36','#655447','#483d3a'][i], i);
}
for(let i=0;i<4;i++) {
  const segment=mountainTrailSegments[i*2], pt=mountainPointOnSegment(segment,0.42, i%2 ? 4.0 : -4.0);
  makeAmbientCreature(i%2?'centipede':'beetle',mountainCritterWorld,pt.x,pt.z,pt.y,['#728a9f','#7e9b9b','#6c849d','#9c9a8b'][i],i);
}

// Collectible fizzy pearls lead to little discoveries, but are scattered in an open, explorable space.
const pearlMaterial = [
  new THREE.MeshPhysicalMaterial({ color: '#fff1cd', emissive: '#fff1cd', emissiveIntensity: 0.12, roughness: 0.18, clearcoat: 1 }),
  new THREE.MeshPhysicalMaterial({ color: '#d8fff3', emissive: '#c7fff0', emissiveIntensity: 0.15, roughness: 0.16, clearcoat: 1 }),
  new THREE.MeshPhysicalMaterial({ color: '#ffd4d8', emissive: '#ffd4d8', emissiveIntensity: 0.12, roughness: 0.18, clearcoat: 1 }),
];
const basePearlSpots = [
  [-5, 9, 2.0], [7, 1, 1.8], [13, -6, 3.5], [25, -3, 1.5], [11, -24, 2.4],
  [-10, -14, 3.0], [-28, -6, 1.6], [-31, 24, 2.4], [-17, 31, 1.3], [1, 28, 3.3],
  [26, 38, 2.0], [48, 17, 1.4], [50, -15, 3.6], [45, -52, 1.7], [5, -55, 2.9],
  [-15, -47, 1.7], [-45, -52, 2.8], [-61, -25, 1.6], [-56, 8, 3.1], [-37, 48, 1.7],
  [-5, 55, 2.7], [20, 55, 1.5], [56, 50, 3.0], [70, 9, 1.8], [-68, -70, 2.6],
  [-84, 23, 2.2], [39, -43, 2.55], [3, -82, 2.15], [82, 58, 2.4], [-22, 79, 1.9],
];
const pearlSpots = [...basePearlSpots, ...basePearlSpots.map(([x,z,y], i) => {
  const a = i * 2.399963229728653, r = 15 + (i % 4) * 4.5;
  return [THREE.MathUtils.clamp(x + Math.cos(a) * r, -94, 94), THREE.MathUtils.clamp(z + Math.sin(a) * r, -94, 94), Math.max(1.2, y * (0.72 + (i % 5) * 0.075))];
})];
if (pearlSpots.length !== MEADOW_MINT_TOTAL) throw new Error(`Meadow should contain ${MEADOW_MINT_TOTAL} field Fizz pearls (20% cushion); found ${pearlSpots.length}`);
const pearls = pearlSpots.map(([x, z, y], i) => {
  const g = new THREE.Group();
  const orb = new THREE.Mesh(new THREE.SphereGeometry(0.32, 20, 16), pearlMaterial[i % pearlMaterial.length]); orb.scale.set(1, 1.12, 0.9); orb.castShadow = true; g.add(orb);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.46, 0.038, 8, 28), new THREE.MeshStandardMaterial({ color: '#fffaf0', roughness: 0.35, emissive: '#fff0cb', emissiveIntensity: 0.2 })); ring.rotation.x = 0.2; g.add(ring);
  g.position.set(x, y, z); scene.add(g);
  return { group: g, x, z, y, phase: rand() * Math.PI * 2, collected: false };
});
if (pearls.length !== MEADOW_MINT_TOTAL || pearls.length < MEADOW_MINT_REQUIREMENT) throw new Error(`Meadow created ${pearls.length}; expected ${MEADOW_MINT_TOTAL}, required ${MEADOW_MINT_REQUIREMENT}.`);

// --- Silly solid hazards: wobble-bumps and sprinkle jelly bars -------------------------------
const obstacles = [];
function addBumpyThing(x, z, scale = 1, color = '#f3b1c5', drift = 0) {
  const group = new THREE.Group();
  const skin = new THREE.MeshStandardMaterial({ color, map: ivoryFabric, bumpMap: mintBump, bumpScale: 0.09, roughness: 1 });
  const body = new THREE.Mesh(plushGeometry(0.73, 0.60, 0.78, 0.72, 52, 38), skin);
  body.position.y = 0.66; body.castShadow = true; body.receiveShadow = true; group.add(body);
  const eyeMat = new THREE.MeshStandardMaterial({ color: '#314d3f', roughness: 1 });
  for (const ex of [-0.24, 0.24]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.105, 12, 9), eyeMat);
    eye.position.set(ex, 0.74, 0.69); eye.scale.set(0.78, 1.0, 0.38); group.add(eye);
  }
  const mouthCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-0.14, 0.48, 0.70), new THREE.Vector3(0, 0.43, 0.735), new THREE.Vector3(0.14, 0.48, 0.70),
  ]);
  group.add(new THREE.Mesh(new THREE.TubeGeometry(mouthCurve, 10, 0.025, 6, false), new THREE.MeshStandardMaterial({ color: '#81535a', roughness: 1 })));
  for (let i=0;i<4;i++) {
    const bump = new THREE.Mesh(new THREE.SphereGeometry(0.15, 10, 8), skin);
    const a = i * Math.PI * 0.5 + 0.35;
    bump.position.set(Math.cos(a)*0.48, 1.02 + (i%2)*0.05, Math.sin(a)*0.46);
    bump.scale.set(1,0.78,1); group.add(bump);
  }
  group.position.set(x, 0, z); group.scale.setScalar(scale); scene.add(group);
  obstacles.push({ type: 'bumpy', group, baseX: x, x, z, scale, radius: 0.83*scale, solidHeight: 1.34*scale, drift: 0, phase: rand()*Math.PI*2, bonkAt: 0, bumpX: 0, bumpZ: 0, bumpVX: 0, bumpVZ: 0 });
}
function addJellyBar(x, z, rotation = 0, scale = 1, color = '#ffa8b8') {
  const group = new THREE.Group();
  const jelly = new THREE.MeshStandardMaterial({ color, map: cherryFabric, bumpMap: cherryBump, bumpScale: 0.06, roughness: 0.72, metalness: 0.01 });
  const bar = new THREE.Mesh(new RoundedBoxGeometry(3.25, 0.64, 0.56, 5, 0.18), jelly);
  bar.position.y = 0.45; bar.castShadow = true; bar.receiveShadow = true; group.add(bar);
  const cream = new THREE.MeshStandardMaterial({ map: ivoryFabric, bumpMap: ivoryBump, bumpScale: 0.06, roughness: 1 });
  for (const end of [-1,1]) {
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.32, 16, 12), cream);
    cap.position.set(end*1.55, 0.45, 0); cap.scale.set(1,0.94,0.92); cap.castShadow = true; group.add(cap);
  }
  const sprinkleMats = ['#fff9e9','#72dccc','#fce0a5'];
  for (let i=0;i<9;i++) {
    const sprinkle = new THREE.Mesh(new THREE.SphereGeometry(0.055, 8, 6), new THREE.MeshStandardMaterial({color:sprinkleMats[i%sprinkleMats.length],roughness:0.7}));
    sprinkle.position.set(-1.25 + i*0.31, 0.79, (i%2 ? 0.12 : -0.10)); group.add(sprinkle);
  }
  group.position.set(x,0,z); group.rotation.y=rotation; group.scale.setScalar(scale); scene.add(group);
  obstacles.push({type:'bar',group,baseX:x,x,z,rotation,scale,halfLength:1.72*scale,halfWidth:0.47*scale,clearance:0.74*scale,bonkAt:0,bumpX:0,bumpZ:0,bumpVX:0,bumpVZ:0});
}
[
  [-9,1,1.0,'#f3b1c5',0], [7,-5,1.08,'#c7b5f1',2.0], [29,-2,1.1,'#ffdf91',0],
  [-30,-3,1.12,'#a9e4d8',0], [22,43,1.1,'#f3b1c5',1.6], [-45,23,1.05,'#c7b5f1',0],
  [49,-13,1.1,'#ffdf91',2.1], [-7,-34,1.05,'#a9e4d8',0], [50,47,1.12,'#f3b1c5',0], [-66,-65,1.0,'#c7b5f1',1.3],
].forEach(args => addBumpyThing(...args));
[
  [0,-8,0,1,'#ffa8b8'], [28,9,Math.PI/2,1.05,'#c8b8f3'], [-27,20,-0.42,1,'#ffdc8b'],
  [43,-46,0.62,1.08,'#a7e5d7'], [-43,-55,0,1,'#ffa8b8'],
 ].forEach(args => addJellyBar(...args));

// Giant plush trampolines: walking onto one starts automatic little bounces; pressing
// jump while primed turns that spring into a huge launch. Four spacious pads are scattered
// around the meadow rather than blocking the starting area.
const trampolines = [];
const trampolineDrumMat = new THREE.MeshStandardMaterial({ map: platformMintTexture, bumpMap: platformMintBump, bumpScale: 0.085, color: '#6bd9c7', roughness: 0.82, metalness: 0.02 });
const trampolineTopMat = new THREE.MeshStandardMaterial({ map: platformMintTexture, bumpMap: platformMintBump, bumpScale: 0.11, color: '#d1fff2', roughness: 0.95 });
const trampolineTrimMat = new THREE.MeshStandardMaterial({ color: '#fff5df', roughness: 0.72, metalness: 0.04 });
function addMeadowTrampoline(x, z, accent = '#f8c7d4') {
  const group = new THREE.Group();
  const drum = new THREE.Mesh(new THREE.CylinderGeometry(3.05, 3.34, 0.48, 44, 1), trampolineDrumMat);
  drum.position.y = 0.22; drum.castShadow = false; drum.receiveShadow = true; group.add(drum);
  const top = new THREE.Mesh(new THREE.CircleGeometry(2.88, 48), trampolineTopMat);
  top.rotation.x = -Math.PI / 2; top.position.y = 0.468; top.renderOrder = 1; group.add(top);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(2.98, 0.18, 10, 48), trampolineTrimMat);
  rim.rotation.x = -Math.PI / 2; rim.position.y = 0.462; group.add(rim);
  const innerStitchMat = new THREE.MeshStandardMaterial({ color: accent, roughness: 0.9 });
  const stitch = new THREE.Mesh(new THREE.TorusGeometry(2.56, 0.035, 5, 48), innerStitchMat);
  stitch.rotation.x = -Math.PI / 2; stitch.position.y = 0.477; group.add(stitch);
  const springMat = new THREE.MeshStandardMaterial({ color: '#f7e7c5', roughness: 0.8, metalness: 0.16 });
  for (let i = 0; i < 10; i++) {
    const angle = i / 10 * Math.PI * 2;
    const spring = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.085, 0.28, 7), springMat);
    spring.position.set(Math.cos(angle) * 3.0, 0.19, Math.sin(angle) * 3.0);
    spring.rotation.z = Math.cos(angle) * 0.15; spring.rotation.x = Math.sin(angle) * 0.15; group.add(spring);
  }
  group.position.set(x, 0, z); scene.add(group); landDecorationObjects.push(group); landLodDecorations.push(group);
  const pad = { group, x, z, radius: 3.0, topY: 0.48, top, rim, topBaseY: top.position.y, rimBaseY: rim.position.y, lastBounceAt: -10000, lastSoundAt: -10000, phase: rand() * Math.PI * 2 };
  trampolines.push(pad); return pad;
}
addMeadowTrampoline(-53, -22, '#f4aebd');
addMeadowTrampoline(43, -39, '#b6a8f0');
addMeadowTrampoline(-45, 59, '#f4c875');
addMeadowTrampoline(61, 47, '#f2a8c9');
// Bonus mints trace the actual ballistic arc of a huge trampoline jump. Each trail is aimed
// inward from its pad so it is reachable, and progression still only requires 50 Fizz Mints.
const trampolineTrailPearls = [];
for (const [padIndex, pad] of trampolines.entries()) {
  let dx=-pad.x, dz=-pad.z; const length=Math.hypot(dx,dz)||1; dx/=length; dz/=length;
  for (let n=0; n<MEADOW_TRAMPOLINE_MINTS_PER_PAD; n++) {
    const t=0.30+n*0.25;
    const distance=8.8*t;
    const x=THREE.MathUtils.clamp(pad.x+dx*distance,-96,96);
    const z=THREE.MathUtils.clamp(pad.z+dz*distance,-96,96);
    const y=Math.max(2.3,pad.topY+29.5*t-9.6*t*t);
    const group=new THREE.Group();
    const orb=new THREE.Mesh(new THREE.SphereGeometry(0.32,16,12),pearlMaterial[(padIndex+n)%pearlMaterial.length]); orb.scale.set(1,1.12,0.9); group.add(orb);
    const ring=new THREE.Mesh(new THREE.TorusGeometry(0.46,0.038,7,24),new THREE.MeshStandardMaterial({color:'#fffaf0',roughness:0.35,emissive:'#fff0cb',emissiveIntensity:0.24})); ring.rotation.x=0.2; group.add(ring);
    group.position.set(x,y,z); scene.add(group);
    const pearl={group,x,z,y,phase:rand()*Math.PI*2,collected:false,trampolineTrail:true};
    pearls.push(pearl); trampolineTrailPearls.push(pearl);
  }
}
if(trampolineTrailPearls.length!==MEADOW_TRAMPOLINE_MINT_COUNT || pearls.length!==MEADOW_AVAILABLE_MINT_TOTAL) throw new Error(`Meadow trampoline trails must add ${MEADOW_TRAMPOLINE_MINT_COUNT} bonus Fizz Mints; found ${trampolineTrailPearls.length}.`);
const mountainTrampolines = [];
function addMountainTrampoline(x, z, accent = '#9ddfff') {
  const group = new THREE.Group();
  const drum = new THREE.Mesh(new THREE.CylinderGeometry(3.05, 3.34, 0.48, 36, 1), trampolineDrumMat);
  drum.position.y = 0.22; drum.receiveShadow = true; group.add(drum);
  const top = new THREE.Mesh(new THREE.CircleGeometry(2.88, 40), trampolineTopMat); top.rotation.x = -Math.PI / 2; top.position.y = 0.468; group.add(top);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(2.98, 0.18, 9, 40), trampolineTrimMat); rim.rotation.x = -Math.PI / 2; rim.position.y = 0.462; group.add(rim);
  const stitch = new THREE.Mesh(new THREE.TorusGeometry(2.56, 0.035, 5, 40), new THREE.MeshStandardMaterial({ color: accent, roughness: 0.9 }));
  stitch.rotation.x = -Math.PI / 2; stitch.position.y = 0.477; group.add(stitch);
  group.position.set(x, 0, z); mountainWorld.add(group);
  const pad = { group, x, z, radius: 3.0, topY: 0.48, top, rim, topBaseY: top.position.y, rimBaseY: rim.position.y, lastBounceAt: -10000, lastSoundAt: -10000, phase: rand() * Math.PI * 2 };
  mountainTrampolines.push(pad); return pad;
}
// Ground-level pads sit just outside the 6.6-unit half-width of the raised trail:
// one just off the trailhead, one beside the middle switchback, and one beside the summit approach.
addMountainTrampoline(6.02, 71.70, '#92d8ff');
addMountainTrampoline(2.80, 8.00, '#bee8ff');
addMountainTrampoline(9.00, -83.66, '#86c7ed');
function activeTrampolineSet() { return worldMode === 'mountain' ? mountainTrampolines : (worldMode === 'meadow' ? trampolines : []); }
function findTrampolineAt(x, z) {
  for (const pad of activeTrampolineSet()) if (Math.hypot(x - pad.x, z - pad.z) <= pad.radius) return pad;
  return null;
}
function trampolineSupportBelow(x, z, y) {
  const pad = findTrampolineAt(x, z);
  return pad && y <= pad.topY + 0.18 ? pad.topY : 0;
}
function updateTrampolineVisuals(now) {
  for (const pad of activeTrampolineSet()) {
    const age = Math.max(0, (now - pad.lastBounceAt) / 1000);
    const compression = age < 0.20 ? Math.sin((age / 0.20) * Math.PI) * 0.13 : 0;
    const idleRipple = Math.sin(now * 0.0022 + pad.phase) * 0.018;
    pad.top.position.y = pad.topBaseY - compression + idleRipple;
    pad.rim.position.y = pad.rimBaseY - compression * 0.45;
  }
}

// --- State, controls, music --------------------------------------------------------------------
const state = {
  started: false, paused: false, x: 0, y: 0, z: 12,
  vx: 0, vy: 0, vz: 0, yaw: Math.PI, knockbackUntil: 0,
  pearls: 0, waterMintsCollected: 0, bridgeMintsCollected: 0, mountainMintsCollected: 0, score: 0, friendsMet: 0, elapsed: 0, soundOn: true,
  mintGiftClaimed: false, stageAwaitingTap: false,
  trampolineReadyUntil: 0, trampolineLaunchUntil: 0, waterJumpsUsed: 0, ridingTurtle: false,
  highJumpUntil: 0, highJumpWasActive: false, bridgeStageComplete: false,
  activeFriend: null, activeDialogueLines: null, toastUntil: 0, bob: 0,
  finale: { active: false, targetWorld: 'water', startAt: 0, baseYaw: Math.PI, camOffset: new THREE.Vector3(7.8, 7.2, 12.4), fovStart: 55, enteredWater: false, overlayShown: false },
};
const held = { left: false, right: false, forward: false, back: false, jump: false };
let weather = { kind: 'clear', phase: 'clear', pendingKind: null, phaseStarted: 0, phaseEnds: 0, windCloudTarget: 0.42, nextAt: performance.now() + 38000 + rand() * 22000, until: 0, windX: 0, windZ: 0 };
weatherInitialized = true;
chooseSkyMood();
let nextMinimapDraw = 0;
const minimapCanvas = $('#minimap');
const minimapCtx = minimapCanvas.getContext('2d');
const touchControls = $('#touch-controls');
const moveStick = $('#move-stick');
const stickKnob = $('#stick-knob');
const mobileAction = $('#mobile-action');
let stickPointer = null, actionPointer = null;
let audioContext = null, masterGain = null, musicBus = null, fxBus = null, compressor = null;
let rainNoiseGain = null, windNoiseGain = null;
let musicNextTime = 0, musicStep = 0, nextUnderwaterBloop = 0;
let stageMusicElement = null, stageMusicWorld = null, stageMusicMode = 'idle', stageMusicToken = 0;
let replayMintPoolsExpanded = false, replayMode = false;
function mintRequirementFor(stage) {
  const standard = stage === 'meadow' ? MEADOW_MINT_REQUIREMENT : (stage === 'water' ? WATER_MINT_REQUIREMENT : (stage === 'bridge' ? BRIDGE_MINT_REQUIREMENT : MOUNTAIN_MINT_REQUIREMENT));
  return standard * (replayMode ? 2 : 1);
}
function stageMintList(stage) { return stage === 'meadow' ? pearls : (stage === 'water' ? waterMints : (stage === 'bridge' ? bridgeMints : mountainMints)); }
function stageMintLabel(stage) { return stage === 'meadow' ? 'FIZZ MINTS' : (stage === 'water' ? 'SEAFOAM MINTS' : (stage === 'bridge' ? 'BRIDGE MINTS' : 'FRESH MINTS')); }
function refreshStageGoal(stage = worldMode) {
  const list = stageMintList(stage), required = mintRequirementFor(stage), label = stageMintLabel(stage);
  const suffix = stage === 'mountain' ? ' to reach the summit' : ' to progress';
  $('#stage-goal').textContent = `${label} · Collect ${required} of ${list.length}${suffix}`;
  return { required, available: list.length, label };
}

// Rain is localised around the player so it remains light enough for mobile GPUs.
const RAIN_COUNT = 240;
const rainPositions = new Float32Array(RAIN_COUNT * 2 * 3);
for (let i = 0; i < RAIN_COUNT; i++) {
  const j = i * 6, x = (rand() - 0.5) * 52, z = (rand() - 0.5) * 52, y = 2 + rand() * 24;
  rainPositions[j] = x; rainPositions[j + 1] = y; rainPositions[j + 2] = z;
  rainPositions[j + 3] = x + 0.10; rainPositions[j + 4] = y - 0.72; rainPositions[j + 5] = z + 0.035;
}
const rainGeometry = new THREE.BufferGeometry();
rainGeometry.setAttribute('position', new THREE.BufferAttribute(rainPositions, 3));
const rainLines = new THREE.LineSegments(rainGeometry, new THREE.LineBasicMaterial({ color: '#e0f8ff', transparent: true, opacity: 0.48, depthWrite: false }));
rainLines.visible = false; rainLines.frustumCulled = false; scene.add(rainLines);
const windLeaves = [];
const windLeafMaterials = ['#79b978', '#a3c96f', '#e4c27c'].map(color => new THREE.MeshStandardMaterial({ color, roughness: 1, side: THREE.DoubleSide }));
const windLeafGeometry = new THREE.SphereGeometry(0.12, 8, 6);
for (let i = 0; i < 34; i++) {
  const leaf = new THREE.Mesh(windLeafGeometry, windLeafMaterials[i % windLeafMaterials.length]);
  leaf.scale.set(0.72 + rand() * 0.5, 0.16, 0.32 + rand() * 0.18);
  leaf.position.set((rand() - 0.5) * 52, 0.8 + rand() * 8, (rand() - 0.5) * 52);
  leaf.rotation.set(rand() * 1.1, rand() * Math.PI, rand() * 1.4);
  leaf.visible = false; scene.add(leaf); windLeaves.push(leaf);
}
const melody = [79, 0, 76, 79, 83, 0, 81, 79, 76, 0, 72, 76, 79, 0, 76, 0, 81, 0, 84, 83, 79, 0, 76, 79, 83, 0, 86, 83, 81, 0, 79, 0];
const chords = [[60, 64, 67], [57, 60, 64], [53, 57, 60], [55, 59, 62]];
function midiHz(n) { return 440 * Math.pow(2, (n - 69) / 12); }
function initAudio() {
  if (audioContext) return;
  const Ctor = window.AudioContext || window.webkitAudioContext;
  if (!Ctor) return;
  audioContext = new Ctor();
  masterGain = audioContext.createGain(); masterGain.gain.value = state.soundOn ? 0.94 : 0;
  musicBus = audioContext.createGain(); musicBus.gain.value = 2.0;
  fxBus = audioContext.createGain(); fxBus.gain.value = 0.95;
  compressor = audioContext.createDynamicsCompressor();
  compressor.threshold.value = -12; compressor.knee.value = 10; compressor.ratio.value = 3.4; compressor.attack.value = 0.006; compressor.release.value = 0.18;
  musicBus.connect(masterGain); fxBus.connect(masterGain); masterGain.connect(compressor); compressor.connect(audioContext.destination);
  // Procedural weather ambience; the source buffers are local and do not require downloads.
  const makeNoiseLayer = (filterType, frequency, q) => {
    const frames = Math.max(1, Math.floor(audioContext.sampleRate * 2));
    const buffer = audioContext.createBuffer(1, frames, audioContext.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < frames; i++) data[i] = Math.random() * 2 - 1;
    const source = audioContext.createBufferSource(); source.buffer = buffer; source.loop = true;
    const filter = audioContext.createBiquadFilter(); filter.type = filterType; filter.frequency.value = frequency; filter.Q.value = q;
    const gain = audioContext.createGain(); gain.gain.value = 0;
    source.connect(filter); filter.connect(gain); gain.connect(masterGain); source.start();
    return gain;
  };
  rainNoiseGain = makeNoiseLayer('highpass', 1350, 0.45);
  windNoiseGain = makeNoiseLayer('lowpass', 430, 0.6);
  updateWeatherAudio();
  musicNextTime = audioContext.currentTime + 0.05;
}
function note(freq, when, duration, type = 'triangle', volume = 0.1, bus = musicBus) {
  if (!audioContext || !bus) return;
  const osc = audioContext.createOscillator(), gain = audioContext.createGain();
  osc.type = type; osc.frequency.setValueAtTime(freq, when);
  gain.gain.setValueAtTime(0.0001, when);
  gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, volume), when + 0.018);
  gain.gain.exponentialRampToValueAtTime(0.0001, when + duration);
  osc.connect(gain); gain.connect(bus); osc.start(when); osc.stop(when + duration + 0.025);
}
function stageTrackNumber(world = worldMode) {
  return world === 'water' ? '02' : (world === 'bridge' ? '03' : (world === 'mountain' ? '04' : '01'));
}
function tryPlayStageMusic() {
  if (!stageMusicElement || !state.soundOn || !state.started || stageMusicMode === 'fallback') return;
  stageMusicElement.volume = 0.74;
  const promise = stageMusicElement.play();
  if (promise?.catch) promise.catch(() => {
    // A late gesture restriction isn't a file-load failure; retry on the next user action.
    if (stageMusicElement?.error) activateSynthMusicFallback(stageMusicToken);
  });
}
function activateSynthMusicFallback(token) {
  if (token !== stageMusicToken || stageMusicMode === 'fallback') return;
  stageMusicMode = 'fallback';
  if (stageMusicElement) { stageMusicElement.pause(); stageMusicElement = null; }
  if (!audioContext) initAudio();
  musicNextTime = (audioContext?.currentTime || 0) + 0.06;
  musicStep = 0;
}
function setStageMusic(world = worldMode, force = false) {
  if (!force && stageMusicWorld === world && stageMusicElement) { tryPlayStageMusic(); return; }
  const token = ++stageMusicToken;
  if (stageMusicElement) { stageMusicElement.pause(); stageMusicElement.removeAttribute('src'); stageMusicElement.load(); }
  stageMusicWorld = world; stageMusicMode = 'loading';
  const track = new Audio(); track.preload = 'auto'; track.loop = true; track.volume = state.soundOn ? 0.74 : 0;
  stageMusicElement = track;
  const activateFallback = () => activateSynthMusicFallback(token);
  track.addEventListener('canplay', () => {
    if (token !== stageMusicToken) return;
    stageMusicElement = track;
    stageMusicMode = 'mp3';
    if (state.soundOn && state.started) tryPlayStageMusic();
  });
  track.addEventListener('error', activateFallback, { once: true });
  track.src = new URL(`../assets/stage${stageTrackNumber(world)}.mp3`, import.meta.url).href;
  track.load();
  if (state.started && state.soundOn) tryPlayStageMusic();
  // A missing optional file can otherwise remain in a browser's loading state indefinitely.
  setTimeout(() => { if (token === stageMusicToken && stageMusicMode === 'loading' && track.readyState < HTMLMediaElement.HAVE_FUTURE_DATA) activateFallback(); }, 5200);
}
function musicTick() {
  if (stageMusicMode !== 'fallback') return;
  if (!state.soundOn || !audioContext || audioContext.state !== 'running') return;
  const horizon = audioContext.currentTime + 0.24;
  if (musicNextTime < audioContext.currentTime) musicNextTime = audioContext.currentTime + 0.02;
  while (musicNextTime < horizon) {
    const s = musicStep % melody.length, m = melody[s];
    if (m) note(midiHz(m), musicNextTime, 0.2, 'triangle', 0.125, musicBus);
    if (s % 8 === 0) {
      const ch = chords[Math.floor(musicStep / 8) % chords.length];
      note(midiHz(ch[0] - 12), musicNextTime, 0.72, 'sine', 0.09, musicBus);
      note(midiHz(ch[1]), musicNextTime, 0.42, 'triangle', 0.055, musicBus);
      note(midiHz(ch[2]), musicNextTime, 0.53, 'sine', 0.06, musicBus);
    }
    if (s % 4 === 0) note(midiHz([48, 45, 41, 43][Math.floor(musicStep / 8) % 4]), musicNextTime, 0.37, 'triangle', 0.105, musicBus);
    // Soft percussive plop on beats gives the loop an audible pulse on phone speakers.
    if (s % 8 === 4) note(midiHz(67), musicNextTime, 0.07, 'sine', 0.052, musicBus);
    musicStep++; musicNextTime += 0.1875;
  }
}
function sfx(freq = 650, duration = 0.12, type = 'sine', volume = 0.12) {
  if (!state.soundOn) return;
  if (!audioContext) initAudio();
  if (audioContext?.state === 'running') note(freq, audioContext.currentTime + 0.005, duration, type, volume, fxBus);
}
function playBoing() {
  if (!state.soundOn) return;
  if (!audioContext) initAudio();
  if (!audioContext || audioContext.state !== 'running' || !fxBus) return;
  const t = audioContext.currentTime + 0.004;
  const osc = audioContext.createOscillator(), gain = audioContext.createGain();
  osc.type = 'triangle'; osc.frequency.setValueAtTime(175, t); osc.frequency.exponentialRampToValueAtTime(465, t + 0.075); osc.frequency.exponentialRampToValueAtTime(205, t + 0.27);
  gain.gain.setValueAtTime(0.0001, t); gain.gain.exponentialRampToValueAtTime(0.3, t + 0.018); gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.29);
  osc.connect(gain); gain.connect(fxBus); osc.start(t); osc.stop(t + 0.31);
  setTimeout(() => sfx(92, 0.09, 'sine', 0.18), 65);
}
function weatherEffectStrength(now = performance.now()) {
  if (weather.phase === 'active') return 1;
  if (weather.phase === 'clearing') {
    const span = Math.max(1, weather.phaseEnds - weather.phaseStarted);
    return THREE.MathUtils.clamp(1 - (now - weather.phaseStarted) / span, 0, 1);
  }
  return 0;
}
function updateWeatherReadout() {
  const chip = $('#weather-chip');
  if (!chip) return;
  const skyLabel = skyCloudiness < 0.20 ? 'clear sky' : (skyCloudiness < 0.68 ? 'scattered clouds' : 'overcast');
  if (weather.phase === 'gathering') {
    chip.textContent = weather.pendingKind === 'rain' ? '☁ Clouds gathering · shower approaching' : '⛅ Clouds drifting in';
    return;
  }
  if (weather.phase === 'clearing') {
    chip.textContent = weather.kind === 'rain' ? '🌦 Shower passing · skies clearing' : '🍃 Gusts easing · skies clearing';
    return;
  }
  if (worldMode === 'water') {
    chip.textContent = seaCurrent.active ? `🫧 Bubbly current · ${skyLabel} above` : `🌊 ${skyLabel} above`;
    return;
  }
  if (worldMode === 'mountain' && weather.kind === 'wind') { chip.textContent = `💨 Ridge gusts · ${skyLabel}`; return; }
  if (weather.kind === 'rain') { chip.textContent = `🌧 Light rain · ${skyLabel}`; return; }
  if (weather.kind === 'wind') { chip.textContent = `🍃 Windy · ${skyLabel}`; return; }
  if (skyCloudiness < 0.20) chip.textContent = '☀ Clear skies';
  else if (skyCloudiness < 0.68) chip.textContent = '⛅ Scattered clouds';
  else chip.textContent = '☁ Overcast';
}
function updateWeatherAudio(nowMs = performance.now()) {
  if (!audioContext) return;
  const audioNow = audioContext.currentTime;
  const strength = weatherEffectStrength(nowMs);
  if (rainNoiseGain) rainNoiseGain.gain.setTargetAtTime(weather.kind === 'rain' ? 0.19 * strength : 0, audioNow, 0.65);
  if (windNoiseGain) windNoiseGain.gain.setTargetAtTime(weather.kind === 'wind' ? 0.22 * strength : 0, audioNow, 0.75);
}
function setWeather(kind, now) {
  if (kind === 'clear') {
    if (weather.phase === 'clear') {
      weather.kind = 'clear'; weather.pendingKind = null; targetSkyCloudiness = 0.035 + rand() * 0.10;
      weather.nextAt = now + 28000 + rand() * 30000;
      skyMoodName = 'clearing skies'; updateWeatherReadout(); updateWeatherAudio(now); return;
    }
    if (weather.phase === 'clearing') return;
    weather.phase = 'clearing'; weather.phaseStarted = now; weather.phaseEnds = now + 23000;
    weather.pendingKind = null; targetSkyCloudiness = 0.035 + rand() * 0.10; skyMoodName = 'clouds gradually clearing';
    nextSkyMoodAt = weather.phaseEnds + 45000 + rand() * 25000;
    updateWeatherReadout(); updateWeatherAudio(now); return;
  }
  weather.phase = 'gathering'; weather.kind = 'clear'; weather.pendingKind = kind;
  weather.phaseStarted = now; weather.phaseEnds = now + (kind === 'rain' ? 27000 : 22000); weather.until = 0;
  weather.windCloudTarget = rand() < 0.48 ? 0.17 + rand() * 0.15 : 0.35 + rand() * 0.20;
  targetSkyCloudiness = kind === 'rain' ? 0.90 + rand() * 0.06 : weather.windCloudTarget;
  if (kind === 'wind') { const angle = rand() * Math.PI * 2; weather.windX = Math.cos(angle); weather.windZ = Math.sin(angle); }
  else { const angle = rand() * Math.PI * 2; weather.windX = 0.18 * Math.cos(angle); weather.windZ = 0.18 * Math.sin(angle); }
  skyMoodName = kind === 'rain' ? 'clouds gathering before rain' : 'wind-blown clouds gathering';
  rainLines.visible = false; for (const leaf of windLeaves) leaf.visible = false;
  nextSkyMoodAt = weather.phaseEnds + 45000 + rand() * 30000;
  updateWeatherReadout(); updateWeatherAudio(now);
}
function updateWeatherPhase(now) {
  if (!state.started || state.paused || state.finale.active) return;
  if (weather.phase === 'clear' && now >= weather.nextAt) {
    setWeather(worldMode === 'mountain' ? (rand() < 0.78 ? 'wind' : 'rain') : (rand() < 0.38 ? 'rain' : 'wind'), now);
  } else if (weather.phase === 'gathering' && now >= weather.phaseEnds) {
    weather.phase = 'active'; weather.kind = weather.pendingKind || 'wind'; weather.pendingKind = null;
    weather.phaseStarted = now; weather.until = now + (worldMode === 'mountain' ? 6500 + rand() * 4500 : 15000 + rand() * 9000);
    if (weather.kind === 'rain') targetSkyCloudiness = 0.94 + rand() * 0.05;
    skyMoodName = weather.kind === 'rain' ? 'rain shower' : 'windy';
    updateWeatherReadout(); updateWeatherAudio(now);
    toast(weather.kind === 'rain' ? (worldMode === 'mountain' ? 'A cool ridge shower!' : 'Clouds have gathered into a gentle shower.') : (worldMode === 'mountain' ? 'A strong ridge gust is sweeping across the trail!' : (worldMode === 'bridge' ? 'A breezy canopy gust!' : 'A meadow gust is stirring the grass!')));
  } else if (weather.phase === 'active' && now >= weather.until) {
    setWeather('clear', now);
  } else if (weather.phase === 'clearing' && now >= weather.phaseEnds) {
    weather.phase = 'clear'; weather.kind = 'clear'; weather.pendingKind = null;
    weather.nextAt = now + 21000 + rand() * 26000; targetSkyCloudiness = 0.035 + rand() * 0.10;
    skyMoodName = 'clear skies returning'; updateWeatherReadout(); updateWeatherAudio(now);
  }
}
function updateWeather(dt, now) {
  updateWeatherPhase(now);
  const strength = weatherEffectStrength(now);
  if (now >= lastWeatherAudioUpdate + 500) { updateWeatherAudio(now); lastWeatherAudioUpdate = now; }
  if (worldMode === 'water') {
    rainLines.visible = false; for (const leaf of windLeaves) leaf.visible = false;
    if (rainNoiseGain && audioContext) rainNoiseGain.gain.setTargetAtTime(0, audioContext.currentTime, 0.5);
    if (windNoiseGain && audioContext) windNoiseGain.gain.setTargetAtTime(0, audioContext.currentTime, 0.5);
    if (!state.started || state.paused || state.finale.active) return;
    if (!seaCurrent.active && now >= seaCurrent.nextAt) {
      seaCurrent.active = true; seaCurrent.until = now + 6800 + rand() * 4200;
      const angle = rand() * Math.PI * 2; seaCurrent.x = Math.cos(angle); seaCurrent.z = Math.sin(angle); seaCurrent.strength = 3.8 + rand() * 1.6;
      seaCurrentFx.visible = true; seaCurrent.nextBubbleSound = now;
      updateWeatherReadout(); toast('A bubbly current is swirling through the sea!');
    } else if (seaCurrent.active && now >= seaCurrent.until) {
      seaCurrent.active = false; seaCurrentFx.visible = false; seaCurrentFoamMaterial.opacity = 0.78; seaCurrent.nextAt = now + 19000 + rand() * 24000; seaCurrent.strength = 0;
      updateWeatherReadout(); toast('The sea has settled again.');
    }
    if (seaCurrent.active && now >= seaCurrent.nextBubbleSound) {
      sfx(260 + rand() * 260, 0.22 + rand() * 0.23, 'sine', 0.135); seaCurrent.nextBubbleSound = now + 520 + rand() * 520;
    }
    return;
  }
  if (!state.started || state.paused || state.finale.active) {
    rainLines.visible = false; for (const leaf of windLeaves) leaf.visible = false; return;
  }
  const raining = weather.kind === 'rain' && strength > 0.015;
  const windy = weather.kind === 'wind' && strength > 0.015;
  rainLines.visible = raining;
  rainLines.material.opacity = 0.48 * strength;
  for (const leaf of windLeaves) leaf.visible = windy && worldMode !== 'mountain';
  if (typeof mountainGustGroup !== 'undefined') mountainGustGroup.visible = worldMode === 'mountain' && windy;
  if (raining) {
    rainLines.position.set(state.x, 0, state.z);
    for (let i = 0; i < RAIN_COUNT; i++) {
      const j = i * 6;
      let x = rainPositions[j] + weather.windX * dt * 2.3;
      let y = rainPositions[j + 1] - dt * 18;
      let z = rainPositions[j + 2] + weather.windZ * dt * 2.3;
      if (y < -1 || Math.abs(x) > 29 || Math.abs(z) > 29) { x = (rand() - 0.5) * 54; y = 15 + rand() * 14; z = (rand() - 0.5) * 54; }
      rainPositions[j] = x; rainPositions[j + 1] = y; rainPositions[j + 2] = z;
      rainPositions[j + 3] = x + 0.10 + weather.windX * 0.06; rainPositions[j + 4] = y - 0.72; rainPositions[j + 5] = z + 0.035 + weather.windZ * 0.06;
    }
    rainGeometry.attributes.position.needsUpdate = true;
  }
  if (windy) {
    for (const leaf of windLeaves) {
      leaf.position.x += weather.windX * dt * 7.4 * strength + Math.sin(now * 0.001 + leaf.id) * dt * 0.75;
      leaf.position.z += weather.windZ * dt * 7.4 * strength;
      leaf.rotation.z += dt * (2.1 + leaf.id % 3) * strength;
      if (Math.hypot(leaf.position.x - state.x, leaf.position.z - state.z) > 34) {
        leaf.position.set(state.x - weather.windX * (17 + rand() * 10) + (rand() - 0.5) * 12, 1 + rand() * 7, state.z - weather.windZ * (17 + rand() * 10) + (rand() - 0.5) * 12);
      }
    }
  }
  for (let i = 0; i < windSwayObjects.length; i++) {
    const amount = windy ? 0.018 + 0.27 * strength : 0.018;
    windSwayObjects[i].rotation.z = Math.sin(now * 0.002 + i * 0.31) * amount;
  }
}
function setSound(on) {
  state.soundOn = on;
  const b = $('#sound-toggle'); b.textContent = on ? '♫' : '♪'; b.setAttribute('aria-label', on ? 'Mute music' : 'Turn music on'); b.title = on ? 'Music on' : 'Music off';
  if (on) {
    initAudio();
    if (audioContext?.state === 'suspended') audioContext.resume();
    if (masterGain && audioContext) masterGain.gain.setTargetAtTime(0.94, audioContext.currentTime, 0.05);
    if (audioContext && musicNextTime < audioContext.currentTime) musicNextTime = audioContext.currentTime + 0.025;
    if (stageMusicElement) { stageMusicElement.volume = 0.74; tryPlayStageMusic(); }
  } else {
    if (masterGain && audioContext) masterGain.gain.setTargetAtTime(0, audioContext.currentTime, 0.05);
    if (stageMusicElement) stageMusicElement.volume = 0;
  }
}
function clearHeld() {
  for (const k of Object.keys(held)) held[k] = false;
  document.querySelectorAll('.is-pressed').forEach(el => el.classList.remove('is-pressed'));
  stickPointer = null; actionPointer = null;
  if (stickKnob) stickKnob.style.transform = 'translate(0,0)';
}
function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('show'); state.toastUntil = performance.now() + 1800;
}
function sparkle(position, count = 16) {
  const palette = ['#fff6d8', '#fff8ee', '#ffbecd', '#b5fff0', '#d9d0ff'];
  for (let i = 0; i < count; i++) {
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.055 + rand() * 0.045, 8, 6), new THREE.MeshBasicMaterial({ color: choice(palette), transparent: true, opacity: 1 }));
    mesh.position.copy(position);
    scene.add(mesh);
    particles.push({ mesh, life: 0.5 + rand() * 0.65, maxLife: 1.15, v: new THREE.Vector3((rand() - 0.5) * 4.6, 1.0 + rand() * 3.1, (rand() - 0.5) * 4.6) });
  }
}
const particles = [];
const playerCenterScratch = new THREE.Vector3();
function updateHUD() {
  const stage = worldMode === 'water' ? 'water' : (worldMode === 'bridge' ? 'bridge' : (worldMode === 'mountain' ? 'mountain' : 'meadow'));
  const count = stage === 'water' ? state.waterMintsCollected : (stage === 'bridge' ? state.bridgeMintsCollected : (stage === 'mountain' ? state.mountainMintsCollected : state.pearls));
  const limit = stage === 'water' ? waterMints.length : (stage === 'bridge' ? bridgeMints.length : (stage === 'mountain' ? mountainMints.length : pearls.length));
  $('#pearl-count').textContent = String(count);
  const pearlLimit = $('#pearl-limit'); if (pearlLimit) pearlLimit.textContent = `/ ${limit}`;
  const pearlIcon = document.querySelector('.pearls-stat .stat-icon'); if (pearlIcon) pearlIcon.textContent = stage === 'water' ? '❋' : (stage === 'bridge' ? '◉' : (stage === 'mountain' ? '❄' : '✧'));
  const label = $('#pearls-stat-label'); if (label) label.textContent = stage === 'water' ? 'SEA MINTS' : (stage === 'bridge' ? 'BRIDGE MINTS' : (stage === 'mountain' ? 'FRESH MINTS' : 'FIZZ'));
  $('#friend-count').textContent = `${state.friendsMet}/${friends.length}`;
  $('#score-count').textContent = String(state.score).padStart(5, '0');
  const fill = $('#friend-progress');
  if (fill) fill.style.width = `${state.friendsMet / friends.length * 100}%`;
}
function drawMinimap() {
  const ctx = minimapCtx, w = minimapCanvas.width, h = minimapCanvas.height;
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = 'rgba(239,251,240,0.98)'; ctx.beginPath(); ctx.roundRect(2, 2, w - 4, h - 4, 13); ctx.fill();
  ctx.save(); ctx.beginPath(); ctx.roundRect(7, 7, w - 14, h - 14, 10); ctx.clip();
  ctx.strokeStyle = 'rgba(114,173,148,0.23)'; ctx.lineWidth = 1;
  for (let i = 1; i <= 3; i++) {
    const p = 7 + (w - 14) * i / 4;
    ctx.beginPath(); ctx.moveTo(p, 7); ctx.lineTo(p, h - 7); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(7, p); ctx.lineTo(w - 7, p); ctx.stroke();
  }
  const mapX = x => 7 + ((x + 110) / 220) * (w - 14);
  const mapY = z => 7 + ((z + 110) / 220) * (h - 14);
  // Uncollected mint pearls; the Water World uses bright blue seafoam mints.
  const visibleCollectibles = worldMode === 'water' ? waterMints : (worldMode === 'bridge' ? bridgeMints : (worldMode === 'mountain' ? mountainMints : pearls));
  for (const item of visibleCollectibles) if (!item.collected) {
    const x = mapX(item.x), y = mapY(item.z);
    ctx.fillStyle = worldMode === 'water' ? 'rgba(44,211,231,.24)' : (worldMode === 'bridge' ? 'rgba(171,138,83,.24)' : (worldMode === 'mountain' ? 'rgba(179,224,251,.30)' : 'rgba(48,183,164,.22)'));
    ctx.beginPath(); ctx.arc(x, y, 4.6, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = worldMode === 'water' ? '#24c7db' : (worldMode === 'bridge' ? '#9d7745' : (worldMode === 'mountain' ? '#6eacd7' : '#35b9a6'));
    ctx.beginPath(); ctx.arc(x, y, 2.65, 0, Math.PI * 2); ctx.fill();
    if (worldMode === 'water') { ctx.strokeStyle = '#f2ffff'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x-1.2,y); ctx.lineTo(x+1.2,y); ctx.stroke(); }
  }
  // Friends already spoken to disappear from the to-do layer; their position remains real.
  for (const f of friends) if (!f.met) {
    const x = mapX(f.x), y = mapY(f.z);
    ctx.fillStyle = 'rgba(177,119,205,.22)'; ctx.beginPath(); ctx.arc(x, y, 5.1, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ac75c9'; ctx.beginPath(); ctx.moveTo(x, y - 3.4); ctx.lineTo(x + 3.2, y); ctx.lineTo(x, y + 3.4); ctx.lineTo(x - 3.2, y); ctx.closePath(); ctx.fill();
  }
  // Player position and heading.
  const px = mapX(state.x), py = mapY(state.z), heading = state.yaw;
  ctx.fillStyle = 'rgba(235,73,91,.23)'; ctx.beginPath(); ctx.arc(px, py, 6.4, 0, Math.PI * 2); ctx.fill();
  ctx.save(); ctx.translate(px, py); ctx.rotate(Math.PI - heading);
  ctx.fillStyle = '#ec5265'; ctx.strokeStyle = '#fffdf5'; ctx.lineWidth = 1.4;
  ctx.beginPath(); ctx.moveTo(0, -5.3); ctx.lineTo(4.1, 3.8); ctx.lineTo(0, 2.2); ctx.lineTo(-4.1, 3.8); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore();
  ctx.restore();
}

const FRIEND_TALK_RANGE = 4.4; // Comfortable middle ground: close enough to chat without triggering from far away.
function nearestFriend() {
  let nearest = null, dist = Infinity;
  for (const f of friends) {
    const dx = f.slug.position.x - state.x, dy = f.slug.position.y + 0.8 - state.y, dz = f.slug.position.z - state.z;
    const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (d < dist) { dist = d; nearest = f; }
  }
  return dist <= FRIEND_TALK_RANGE ? { friend: nearest, distance: dist } : null;
}
function refreshPrompt() {
  const near = nearestFriend();
  const prompt = $('#talk-prompt');
  if (state.started && !state.paused && !state.activeFriend && near) {
    prompt.classList.remove('is-hidden');
    $('#talk-prompt-name').textContent = near.friend.name;
  } else {
    prompt.classList.add('is-hidden');
  }
}
function separateFromFriend(friend, gentle = false) {
  if (Math.abs(state.y - (friend.worldFloorY || 0)) > 1.45) return;
  let dx = state.x - friend.slug.position.x, dz = state.z - friend.slug.position.z;
  let dist = Math.hypot(dx, dz);
  const minimum = 2.15;
  if (dist >= minimum) return;
  if (dist < 0.001) { dx = Math.cos(state.yaw + Math.PI); dz = Math.sin(state.yaw + Math.PI); dist = 1; }
  const nx = dx / dist, nz = dz / dist, push = minimum - dist + 0.035;
  state.x += nx * push; state.z += nz * push;
  const into = state.vx * nx + state.vz * nz;
  if (into < 0) { state.vx -= nx * into * (gentle ? 0.82 : 1); state.vz -= nz * into * (gentle ? 0.82 : 1); }
  state.x = THREE.MathUtils.clamp(state.x, -103, 103); state.z = THREE.MathUtils.clamp(state.z, -103, 103);
}
function resolveFriendCollisions() {
  for (const friend of friends) separateFromFriend(friend, false);
}
function resolveWaterShellCollision() {
  if (worldMode !== 'water' || state.y > seaShellCollider.height) return;
  let dx = state.x - seaShellCollider.x, dz = state.z - seaShellCollider.z;
  let dist = Math.hypot(dx, dz);
  const minimum = SLUG_DIMS.rz * 0.88 + seaShellCollider.radius;
  if (dist >= minimum) return;
  if (dist < 0.001) { dx = 1; dz = 0; dist = 1; }
  const nx = dx / dist, nz = dz / dist;
  state.x += nx * (minimum - dist + 0.03); state.z += nz * (minimum - dist + 0.03);
  const into = state.vx * nx + state.vz * nz;
  if (into < 0) { state.vx -= nx * into; state.vz -= nz * into; }
  state.x = THREE.MathUtils.clamp(state.x, -103, 103); state.z = THREE.MathUtils.clamp(state.z, -103, 103);
}

function talkToNearest() {
  if (!state.started || state.paused || state.activeFriend) return;
  const near = nearestFriend();
  if (!near) { toast('Come a little closer to say hello.'); return; }
  const f = near.friend;
  // If the player is already overlapping a pal, make a little room before the chat pose.
  separateFromFriend(f, true);
  const lines = worldMode === 'water' && Array.isArray(f.seaLines) ? f.seaLines : (worldMode === 'bridge' && Array.isArray(f.bridgeLines) ? f.bridgeLines : (worldMode === 'mountain' && Array.isArray(f.mountainLines) ? f.mountainLines : f.lines));
  state.activeDialogueLines = lines;
  state.activeFriend = f;
  state.y = f.worldFloorY || 0; state.vy = 0;
  clearHeld();
  // Turn the player toward the pal before dialogue starts, and let the pal turn back too.
  state.yaw = Math.atan2(f.x - state.x, f.z - state.z);
  player.rotation.y = state.yaw;
  f.slug.rotation.y = Math.atan2(state.x - f.x, state.z - f.z);
  f.dialogueIndex = 0;
  $('#dialogue-name').textContent = f.name;
  $('#dialogue-text').textContent = lines[0];
  $('#dialogue-card').classList.remove('is-hidden');
  $('#talk-prompt').classList.add('is-hidden');
  if (!f.met) {
    f.met = true; state.friendsMet++; state.score += 150;
    sparkle(new THREE.Vector3(f.x, 2.7, f.z), 24);
    toast(`Made a new friend: ${f.name}!`);
    updateHUD();
  }
  $('#dialogue-kicker').textContent = worldMode === 'water' ? 'A WATER WORLD HELLO' : (worldMode === 'bridge' ? 'A BRIDGE WORLD HELLO' : (worldMode === 'mountain' ? 'A BLUE RIDGE HELLO' : 'A MEADOW HELLO'));
  $('#dialogue-next').textContent = lines.length > 1 ? 'Keep chatting  →' : 'Goodbye  ✦';
  sfx(660, 0.16, 'sine', 0.14); setTimeout(() => sfx(880, 0.2, 'triangle', 0.11), 90);
}
function closeDialogue() {
  state.activeFriend = null; state.activeDialogueLines = null;
  $('#dialogue-card').classList.add('is-hidden');
  refreshPrompt();
}
function claimSavedMintGift(friend) {
  if (!friend.savedMintGift || worldMode !== 'meadow' || state.mintGiftClaimed) return false;
  state.mintGiftClaimed = true; state.pearls++; state.score += 25;
  sparkle(new THREE.Vector3(friend.x, (friend.worldFloorY || 0) + 2.2, friend.z), 18);
  sfx(1040, 0.12, 'sine', 0.13); setTimeout(() => sfx(1380, 0.14, 'triangle', 0.11), 65);
  updateHUD(); toast('Berry gave you a saved Fizz Mint!');
  if (state.pearls >= mintRequirementFor('meadow')) { closeDialogue(); startFizzFinale(); return true; }
  return false;
}
function advanceDialogue() {
  const f = state.activeFriend, lines = state.activeDialogueLines; if (!f || !lines) return;
  f.dialogueIndex++;
  if (f.dialogueIndex >= lines.length) { closeDialogue(); return; }
  $('#dialogue-text').textContent = lines[f.dialogueIndex];
  $('#dialogue-next').textContent = f.dialogueIndex === lines.length - 1 ? 'Say goodbye  ✦' : 'Keep chatting  →';
  if (f.dialogueIndex === 2 && claimSavedMintGift(f)) return;
  sfx(530 + f.dialogueIndex * 100, 0.09, 'sine', 0.07);
}
function jumpOrInteract() {
  if (!state.started || state.paused || state.finale.active) return false;
  if (state.activeFriend) { advanceDialogue(); return false; }
  const now = performance.now();
  const supportY = playerSupportBelow(state.x, state.z, state.y);
  if (worldMode === 'water' && state.ridingTurtle) {
    state.ridingTurtle = false; state.vy = 9.2; state.waterJumpsUsed = 1;
    spawnWaterJumpBubbles(); spawnSandPuff(); sfx(590,0.11,'sine',0.10); toast('Hop off the turtle!'); return true;
  }
  // In Water World, each fresh press while airborne consumes the next jump in a triple-jump chain.
  if (worldMode === 'water' && state.y > supportY + 0.28 && state.waterJumpsUsed < 3) {
    state.waterJumpsUsed++;
    state.vy = state.waterJumpsUsed === 2 ? 7.8 : 7.1;
    spawnWaterJumpBubbles();
    sfx(state.waterJumpsUsed === 2 ? 620 : 760, 0.095, 'sine', 0.075);
    toast(state.waterJumpsUsed === 2 ? 'Double jump!' : 'Triple jump!');
    return true;
  }
  if (nearestFriend()) { talkToNearest(); return false; }
  const trampoline = findTrampolineAt(state.x, state.z);
  if (trampoline && now < state.trampolineReadyUntil) {
    state.vy = 29.5;
    state.trampolineReadyUntil = 0;
    state.trampolineLaunchUntil = now + 4700;
    trampoline.lastBounceAt = now;
    sfx(260, 0.13, 'triangle', 0.19); setTimeout(() => sfx(780, 0.22, 'sine', 0.20), 90); setTimeout(() => sfx(1160, 0.24, 'triangle', 0.15), 175);
    toast('HUGE JUMP! Wheeeee!');
    return true;
  }
  held.jump = true;
  if (state.y <= supportY + 0.025 && state.vy <= 0) {
    state.vy = now < state.highJumpUntil ? 14.6 : 7.5;
    if (worldMode === 'water') { state.waterJumpsUsed = 1; spawnWaterJumpBubbles(); spawnSandPuff(); }
  }
  sfx(420, 0.07, 'sine', 0.035);
  return true;
}
$('#dialogue-next').addEventListener('click', advanceDialogue);
$('#dialogue-close').addEventListener('click', closeDialogue);

function startStageFinale(targetWorld = 'water') {
  if (state.finale.active || (worldMode === 'meadow' && targetWorld !== 'water') || (worldMode === 'water' && targetWorld !== 'bridge') || (worldMode === 'bridge' && targetWorld !== 'mountain') || (worldMode === 'mountain' && targetWorld !== 'complete')) return;

  // If the goal mint is picked up while riding, give the slug a clear, readable exit before the
  // celebration: hop off the shell, land beside it, and take a few steps away before the close-up dance.
  const exitTurtle = worldMode === 'water' && targetWorld === 'bridge' && state.ridingTurtle;
  const exitStart = exitTurtle ? {
    x: seaTurtle.group.position.x,
    y: seaTurtleSurfaceAt(seaTurtle.group.position.x, seaTurtle.group.position.z) ?? state.y,
    z: seaTurtle.group.position.z + seaTurtle.riderOffsetZ,
  } : null;
  let exitTarget = null, exitWalkYaw = state.yaw;
  if (exitTurtle) {
    // The turtle advances immediately before mint pickup; sync to its current frame before detaching.
    state.x = exitStart.x; state.y = exitStart.y; state.z = exitStart.z;
    const h = seaTurtle.heading;
    const sideX = Math.cos(h), sideZ = -Math.sin(h);
    const forwardX = Math.sin(h), forwardZ = Math.cos(h);
    // Prefer stepping off the side the turtle is facing, but choose another clear edge near world bounds.
    const exitDirections = [
      [sideX, sideZ], [-sideX, -sideZ], [forwardX, forwardZ], [-forwardX, -forwardZ],
      [sideX + forwardX, sideZ + forwardZ], [sideX - forwardX, sideZ - forwardZ],
      [-sideX + forwardX, -sideZ + forwardZ], [-sideX - forwardX, -sideZ - forwardZ],
    ].map(([dx, dz]) => { const length = Math.hypot(dx, dz) || 1; return [dx / length, dz / length]; });
    const turtleX = seaTurtle.group.position.x, turtleZ = seaTurtle.group.position.z;
    const exitDirection = exitDirections
      .filter(([dx, dz]) => Math.abs(turtleX + dx * 7.1 + forwardX * 0.25) <= 91.5 && Math.abs(turtleZ + dz * 7.1 + forwardZ * 0.25) <= 91.5)
      .sort((a, b) => (b[0] * sideX + b[1] * sideZ) - (a[0] * sideX + a[1] * sideZ))[0] || [-Math.sign(turtleX || 1), -Math.sign(turtleZ || 1)];
    exitTarget = {
      x: THREE.MathUtils.clamp(turtleX + exitDirection[0] * 7.1 + forwardX * 0.25, -91.5, 91.5),
      z: THREE.MathUtils.clamp(turtleZ + exitDirection[1] * 7.1 + forwardZ * 0.25, -91.5, 91.5),
    };
    exitWalkYaw = Math.atan2(exitTarget.x - exitStart.x, exitTarget.z - exitStart.z);
    state.ridingTurtle = false;
    seaTurtle.target = null;
  }

  state.finale.active = true; state.finale.targetWorld = targetWorld; state.finale.startAt = performance.now();
  state.finale.baseYaw = exitTurtle ? exitWalkYaw : state.yaw;
  state.stageAwaitingTap = false; $('#stage-continue-button').classList.add('is-hidden'); $('#finale-overlay').classList.remove('waiting-for-stage-tap');
  state.finale.camOffset.set(camera.position.x - state.x, camera.position.y - state.y, camera.position.z - state.z);
  state.finale.danceY = (targetWorld === 'complete' || targetWorld === 'mountain') ? state.y : 0;
  state.finale.cameraYaw = Math.atan2(2.65, 6.9);
  state.finale.fovStart = camera.fov; state.finale.enteredWater = false; state.finale.overlayShown = false;
  state.finale.exitTurtle = exitTurtle; state.finale.exitStart = exitStart; state.finale.exitTarget = exitTarget;
  state.finale.exitDuration = exitTurtle ? 1.35 : 0; state.finale.exitWalkYaw = exitWalkYaw; state.finale.exitCompleted = false;
  state.vx = state.vy = state.vz = 0;
  if (!exitTurtle) state.y = state.finale.danceY;
  state.paused = false;
  if (exitTurtle) { spawnWaterJumpBubbles(); sfx(620, 0.13, 'sine', 0.085); }
  clearHeld(); $('#talk-prompt').classList.add('is-hidden'); $('#toast').classList.remove('show');
  touchControls.classList.add('finale-lock'); $('#pause-toggle').disabled = true;
  $('#finale-kicker').textContent = worldMode === 'meadow' ? 'FIZZY GOAL REACHED' : (targetWorld === 'bridge' ? 'SEAFOAM SET COMPLETE' : (targetWorld === 'mountain' ? 'BRIDGE GARDEN COMPLETE' : 'SUMMIT REACHED'));
  $('#finale-title').textContent = worldMode === 'meadow' ? 'So many fizzy finds!' : (targetWorld === 'bridge' ? 'A bridge to a new world!' : (targetWorld === 'mountain' ? 'The Blue Ridge awaits!' : 'A fresh mint summit!'));
  $('#finale-subtitle').textContent = worldMode === 'meadow' ? `You gathered ${state.pearls} Fizz Mints! Your trampoline trail still sparkles behind you. Time to see what is bubbling beneath the meadow.` : (targetWorld === 'bridge' ? 'The ivy-covered bridges are waiting above the treetops.' : (targetWorld === 'mountain' ? 'The high trails lead toward a blue mountain ridge.' : 'You climbed the Blue Ridge and found its freshest mints.'));
  sfx(784, 0.16, 'triangle', 0.15); setTimeout(() => sfx(988, 0.18, 'triangle', 0.14), 105);
  setTimeout(() => sfx(1175, 0.20, 'sine', 0.14), 220); setTimeout(() => sfx(1568, 0.36, 'sine', 0.16), 345);
}
function startFizzFinale() { startStageFinale('water'); }

function enterWaterWorld(now) {
  if (worldMode === 'water') return;
  worldMode = 'water'; state.finale.enteredWater = true;
  // Berry's gift can satisfy the 25-Fizz goal while one field pearl remains; clear every leftover before changing worlds.
  for (const pearl of pearls) { pearl.collected = true; pearl.group.visible = false; }
  state.stageAwaitingTap = true; state.paused = true;
  const arrivalButton = $('#stage-continue-button'); arrivalButton.innerHTML = 'Dive into the Water World <span>→</span>'; arrivalButton.classList.add('is-hidden'); $('#finale-overlay').classList.add('waiting-for-stage-tap');
  state.x=0; state.y=0; state.z=12; state.vx=state.vy=state.vz=0; state.yaw=Math.PI;
  // Close to the spawn, but offset sideways so the player must approach and hop onto the shell.
  seaTurtle.group.position.set(7.1,0,12); seaTurtle.vx=seaTurtle.vz=0; seaTurtle.target=null; seaTurtle.heading=0;
  state.friendsMet = 0; state.waterJumpsUsed = 0; state.ridingTurtle = false; state.trampolineReadyUntil = 0; state.trampolineLaunchUntil = 0;
  for (const friend of friends) friend.met = false;
  // Swap every land-specific layer for the new seabed while preserving the player, pals, and exploration controls.
  for (const obj of [meadowBase, meadow, meadowBlades, mossPatches, stoneInstances, pebbleInstances, petalMesh, flowerCenterMesh, flowerStemMesh, safetyGround, grassBlades, ...landDecorationObjects, ...landBoundaryObjects]) obj.visible = false;
  for (const obstacle of obstacles) obstacle.group.visible = false;
  waterWorld.visible = true; bridgeWorld.visible = false; mountainWorld.visible = false; underwaterBubbleMesh.visible = true;
  skyDome.visible = true; sun.visible = false; moonLight.visible = true; if (moonMesh) moonMesh.visible = false;
  $('#pearls-stat-label')?.replaceChildren(document.createTextNode('SEA MINTS'));
  const brandEyebrow = document.querySelector('.brand-copy .eyebrow'); if (brandEyebrow) brandEyebrow.textContent = 'WATER WORLD';
  updateHUD(); drawMinimap();
  scene.fog = new THREE.FogExp2('#0b5269', 0.0085);
  hemi.color.set('#a7e8f4'); hemi.groundColor.set('#0b3e51'); hemi.intensity = 1.05;
  fillLight.color.set('#64e5ef'); fillLight.intensity = 0.5;
  shadow.material.color.set('#073b50'); shadow.material.opacity = 0.38;
  for (const cluster of decorBubbles) {
    cluster.group.visible = true;
    cluster.group.traverse(obj => { if (obj.isMesh && obj.material?.color) obj.material.color.set('#aaf5ff'); });
  }
  for (const friend of friends) {
    friend.bobble.group.visible = true;
    friend.bobble.group.traverse(obj => { if (obj.isMesh && obj.material?.color) obj.material.color.set('#aaf5ff'); });
  }
  seaCurrent.active = false; seaCurrentFx.visible = false; seaCurrent.nextAt = now + 14000 + rand() * 9000;
  setWeather('clear', now); applyLocalTime(); updateWeatherReadout(); setStageMusic('water');
  const hint = document.querySelector('.world-hint span:last-child'); if (hint) hint.textContent = 'The Water World · follow bubbles and explore';
  const mapTitle = document.querySelector('.map-heading b'); if (mapTitle) mapTitle.textContent = 'WATER WORLD MAP';
  $('#finale-kicker').textContent = 'WELCOME BELOW THE WAVES';
  $('#finale-title').textContent = 'The Water World';
  const waterGoal = refreshStageGoal('water');
  $('#finale-subtitle').textContent = `Collect ${waterGoal.required} Seafoam Mints to unlock Bridge World. There are ${waterGoal.available} to find, so you can leave some behind.`;
  sfx(330, 0.45, 'sine', 0.11); setTimeout(() => sfx(440, 0.32, 'sine', 0.08), 170);
  // Replays carry doubled mint pools forward, activating the next world's fresh pool on arrival.
  if (replayMode) { setReplayCollectibleVisibility('water'); updateHUD(); }
}
function enterBridgeWorld(now) {
  if (worldMode === 'bridge') return;
  worldMode = 'bridge'; state.finale.enteredWater = true;
  for (const mint of waterMints) { mint.collected = true; mint.group.visible = false; }
  state.stageAwaitingTap = true; state.paused = true;
  // Clear all remaining Seafoam Mints once this stage is complete and the next one loads.
  for (const mint of waterMints) { mint.collected = true; mint.group.visible = false; }
  const arrivalButton = $('#stage-continue-button'); arrivalButton.innerHTML = 'Explore Bridge World <span>→</span>'; arrivalButton.classList.add('is-hidden'); $('#finale-overlay').classList.add('waiting-for-stage-tap');
  const spawnPlatform = bridgePlatforms[0];
  state.x = spawnPlatform.x; state.y = spawnPlatform.y; state.z = spawnPlatform.z; state.vx = state.vy = state.vz = 0; state.yaw = Math.PI;
  state.highJumpUntil = 0; state.highJumpWasActive = false; state.waterJumpsUsed = 0; state.ridingTurtle = false; state.bridgeMintsCollected = 0; state.bridgeStageComplete = false;
  if (player.userData.cherryMesh) player.userData.cherryMesh.material.color.copy(player.userData.cherryBaseColor);
  state.friendsMet = 0;
  const meadowObjects = [meadowBase, meadow, meadowBlades, mossPatches, stoneInstances, pebbleInstances, petalMesh, flowerCenterMesh, flowerStemMesh, safetyGround, grassBlades, ...landDecorationObjects, ...landBoundaryObjects];
  for (const obj of meadowObjects) obj.visible = false;
  for (const obstacle of obstacles) obstacle.group.visible = false;
  waterWorld.visible = false; bridgeWorld.visible = true; mountainWorld.visible = false; underwaterBubbleMesh.visible = false; seaCurrent.active = false; seaCurrentFx.visible = false; seaCurrent.strength = 0;
  skyDome.visible = true; sun.visible = true; moonLight.visible = true;
  if (moonMesh) moonMesh.visible = false;
  for (const item of decorBubbles) item.group.visible = false;
  for (const friend of friends) {
    friend.met = false;
    friend.bobble.group.visible = false;
  }
  // Spread five pals across the timber tiers and move three onto the surrounding grass.
  const bridgePlacements = [
    { platform: 0, lx: -8, lz: 0 },
    { ground: true, x: 27, z: 34 },
    { platform: 2, lx: 1, lz: 0 },
    { ground: true, x: -34, z: -29 },
    { platform: 4, lx: -4, lz: 0 },
    { platform: 7, lx: 2, lz: 0 },
    { ground: true, x: 34, z: -34 },
    { platform: 8, lx: -4, lz: 0 },
  ];
  friends.forEach((friend, i) => {
    const place = bridgePlacements[i];
    if (place.ground) { friend.x = place.x; friend.z = place.z; friend.worldFloorY = 0; }
    else { const platform = bridgePlatforms[place.platform]; const pt = localBridgePoint(platform, place.lx, place.lz); friend.x = pt.x; friend.z = pt.z; friend.worldFloorY = platform.y; }
    friend.slug.position.set(friend.x, friend.worldFloorY, friend.z);
    friend.slug.rotation.y = Math.atan2(state.x - friend.x, state.z - friend.z);
    friend.nameSprite.position.set(friend.x, friend.worldFloorY + 4.05, friend.z);
    friend.bobble.y = friend.worldFloorY + 3.5;
    friend.bobble.group.position.set(friend.x + 1.4, friend.bobble.y, friend.z);
  });
  $('#pearls-stat-label')?.replaceChildren(document.createTextNode('BRIDGE MINTS'));
  const brandEyebrow = document.querySelector('.brand-copy .eyebrow'); if (brandEyebrow) brandEyebrow.textContent = 'BRIDGE WORLD';
  const hint = document.querySelector('.world-hint span:last-child'); if (hint) hint.textContent = 'Bridge World · climb the ivy-wrapped timber paths';
  const mapTitle = document.querySelector('.map-heading b'); if (mapTitle) mapTitle.textContent = 'BRIDGE WORLD MAP';
  $('#finale-kicker').textContent = 'WELCOME TO THE CANOPY';
  $('#finale-title').textContent = 'Bridge World';
  const bridgeGoal = refreshStageGoal('bridge');
  $('#finale-subtitle').textContent = `Collect ${bridgeGoal.required} Bridge Mints to reach Blue Ridge Mountain. There are ${bridgeGoal.available} across the bridges, so you can leave some behind.`;
  scene.fog = new THREE.Fog('#8aab8c', 100, 265);
  hemi.color.set('#e4f4d7'); hemi.groundColor.set('#29442e'); fillLight.color.set('#c8e6ba');
  shadow.material.color.set('#223c28'); shadow.material.opacity = 0.29;
  setWeather('clear', now); applyLocalTime(); updateHUD(); drawMinimap(); updateWeatherReadout(); setStageMusic('bridge');
  sfx(392, 0.3, 'sine', 0.12); setTimeout(() => sfx(523, 0.32, 'triangle', 0.1), 145); setTimeout(() => sfx(659, 0.42, 'sine', 0.12), 300);
  if (replayMode) { setReplayCollectibleVisibility('bridge'); updateHUD(); }
}


function enterMountainWorld(now) {
  if(worldMode==='mountain') return;
  worldMode='mountain'; state.finale.enteredWater=true;
  // Empty every remaining Bridge Mint as this next stage loads.
  for(const mint of bridgeMints){mint.collected=true;mint.group.visible=false;}
  state.stageAwaitingTap=true; state.paused=true;
  const arrivalButton=$('#stage-continue-button'); arrivalButton.innerHTML='Climb Blue Ridge Mountain <span>→</span>'; arrivalButton.classList.add('is-hidden'); $('#finale-overlay').classList.add('waiting-for-stage-tap');
  state.mountainMintsCollected=0; state.bridgeStageComplete=false; state.waterJumpsUsed=0; state.ridingTurtle=false; state.highJumpUntil=0; state.highJumpWasActive=false;
  if(player.userData.cherryMesh){player.userData.cherryMesh.material.color.copy(player.userData.cherryBaseColor); if(player.userData.cherryMesh.material.emissive)player.userData.cherryMesh.material.emissiveIntensity=0;}
  const start=mountainTrailNodes[0]; state.x=start.x; state.y=start.y; state.z=start.z; state.vx=state.vy=state.vz=0; state.yaw=Math.PI;
  state.friendsMet=0;
  const meadowObjects=[meadowBase,meadow,meadowBlades,mossPatches,stoneInstances,pebbleInstances,petalMesh,flowerCenterMesh,flowerStemMesh,safetyGround,grassBlades,...landDecorationObjects,...landBoundaryObjects];
  for(const obj of meadowObjects)obj.visible=false;
  for(const obstacle of obstacles)obstacle.group.visible=false;
  waterWorld.visible=false; bridgeWorld.visible=false; mountainWorld.visible=true; underwaterBubbleMesh.visible=false; seaCurrent.active=false; seaCurrentFx.visible=false; seaCurrent.strength=0;
  for(const item of decorBubbles)item.group.visible=false;
  for(const friend of friends) {
    friend.met=false; friend.bobble.group.visible=false;
    const friendIndex=friends.indexOf(friend);
    // Prefer one unique trail section per friend. Search several points/sides and explicitly
    // reject every solid ridge/outcrop footprint so no interaction target can spawn embedded.
    const preferredSegmentIndex=Math.min(mountainTrailSegments.length-1,friendIndex);
    let pt=null, surface=null;
    const segmentOrder=mountainTrailSegments.map((_,i)=>i).sort((a,b)=>Math.abs(a-preferredSegmentIndex)-Math.abs(b-preferredSegmentIndex));
    outer: for(const segmentIndex of segmentOrder) {
      const segment=mountainTrailSegments[segmentIndex];
      const tValues=segmentIndex===preferredSegmentIndex?[0.34,0.5,0.66]:[0.28,0.5,0.72];
      const sideValues=friendIndex%2===0?[-3.1,3.1,0]:[3.1,-3.1,0];
      for(const t of tValues) for(const side of sideValues) {
        const candidate=mountainPointOnSegment(segment,t,side);
        const candidateSurface=findMountainSurfaceAt(candidate.x,candidate.z);
        if(candidateSurface && isMountainSpawnClear(candidate.x,candidate.z)) {
          pt=candidate; surface=candidateSurface; break outer;
        }
      }
    }
    if(!pt) { pt={x:0,z:76,y:0.16}; surface={y:0.16}; }
    const x=pt.x,z=pt.z,y=surface.y;
    friend.x=x; friend.z=z; friend.worldFloorY=y;
    friend.slug.position.set(x,y,z); friend.slug.rotation.y=Math.atan2(state.x-x,state.z-z);
    friend.nameSprite.position.set(x,y+4.05,z); friend.bobble.y=y+3.5; friend.bobble.group.position.set(x+1.4,friend.bobble.y,z);
  }
  $('#pearls-stat-label')?.replaceChildren(document.createTextNode('FRESH MINTS'));
  const eyebrow=document.querySelector('.brand-copy .eyebrow'); if(eyebrow) eyebrow.textContent='BLUE RIDGE MOUNTAIN';
  const hint=document.querySelector('.world-hint span:last-child'); if(hint) hint.textContent='Blue Ridge Mountain · hike the switchbacks, hop the ledges, watch the gusts';
  const mapTitle=document.querySelector('.map-heading b'); if(mapTitle) mapTitle.textContent='BLUE RIDGE MAP';
  $('#finale-kicker').textContent='WELCOME TO BLUE RIDGE'; $('#finale-title').textContent='Blue Ridge Mountain';
  const mountainGoal = refreshStageGoal('mountain');
  $('#finale-subtitle').textContent=`Collect ${mountainGoal.required} Fresh Mints to reach the summit. There are ${mountainGoal.available} on the mountain, so you can leave some behind. Strong gusts can tumble you back toward the base.`;
  scene.fog=new THREE.Fog('#9eb9c8',105,285); hemi.color.set('#dcebf1'); hemi.groundColor.set('#354d5e'); fillLight.color.set('#bed9e9'); shadow.material.color.set('#243949'); shadow.material.opacity=0.32;
  setWeather('wind',now); applyLocalTime(); updateHUD(); drawMinimap(); updateWeatherReadout(); setStageMusic('mountain');
  sfx(392,0.3,'sine',0.12); setTimeout(()=>sfx(523,0.32,'triangle',0.1),145); setTimeout(()=>sfx(659,0.42,'sine',0.12),300);
  if (replayMode) { setReplayCollectibleVisibility('mountain'); updateHUD(); }
}

function createReplayMintCopies() {
  if (replayMintPoolsExpanded) return;
  replayMintPoolsExpanded = true;
  const cloneSet = (items, parent, kind) => {
    const originals = items.slice();
    originals.forEach((item, i) => {
      const copyGroup = item.group.clone(true);
      const originalPos = item.group.position;
      const angle = i * 2.399963229728653;
      const radius = kind === 'meadow' ? 3.8 : (kind === 'water' ? 3.2 : (kind === 'bridge' ? 1.18 : 1.22));
      const x = THREE.MathUtils.clamp(item.x + Math.cos(angle) * radius, -96, 96);
      const z = THREE.MathUtils.clamp(item.z + Math.sin(angle) * radius, -96, 96);
      copyGroup.position.set(x, originalPos.y, z); copyGroup.visible = false; parent.add(copyGroup);
      const copy = { ...item, group: copyGroup, x, z, phase: (item.phase || 0) + 1.414 + i * 0.031, collected: false };
      if (kind === 'meadow') copy.y = originalPos.y;
      items.push(copy);
    });
  };
  cloneSet(pearls, scene, 'meadow');
  cloneSet(waterMints, waterWorld, 'water');
  cloneSet(bridgeMints, bridgeWorld, 'bridge');
  cloneSet(mountainMints, mountainWorld, 'mountain');
}
function setReplayCollectibleVisibility(stage) {
  const entries = [
    ['meadow', pearls], ['water', waterMints], ['bridge', bridgeMints], ['mountain', mountainMints],
  ];
  for (const [key, list] of entries) for (const mint of list) {
    mint.collected = key !== stage;
    mint.group.visible = key === stage;
  }
  state.pearls = 0; state.waterMintsCollected = 0; state.bridgeMintsCollected = 0; state.mountainMintsCollected = 0;
  const required = mintRequirementFor(stage);
  const available = entries.find(([key]) => key === stage)[1].length;
  const label = stageMintLabel(stage);
  $('#pearls-stat-label')?.replaceChildren(document.createTextNode(label));
  refreshStageGoal(stage);
  $('#finale-subtitle').textContent = `Replay mode has ${available} mints available. Collect ${required} to clear this world; your collected count starts at zero.`;
}
function launchReplayStage(stage) {
  createReplayMintCopies();
  closeDialogue(); clearHeld();
  state.started = true; state.paused = false; state.finale.active = false; state.stageAwaitingTap = false;
  state.friendsMet = 0; state.score = 0; state.elapsed = 0; state.mintGiftClaimed = false;
  state.activeFriend = null; state.activeDialogueLines = null; state.waterJumpsUsed = 0; state.ridingTurtle = false;
  state.vx = state.vy = state.vz = 0; state.knockbackUntil = 0; state.highJumpUntil = 0; state.highJumpWasActive = false;
  $('#stage-select-overlay').classList.add('is-hidden'); $('#finale-overlay').classList.remove('is-visible', 'waiting-for-stage-tap'); $('#pause-screen').classList.add('is-hidden');
  touchControls.classList.remove('finale-lock', 'is-disabled'); $('#pause-toggle').disabled = false; $('#pause-toggle').textContent = 'Ⅱ';
  replayMode = true;
  const now = performance.now();
  if (stage === 'water') { worldMode = 'mountain'; enterWaterWorld(now); }
  else if (stage === 'bridge') { worldMode = 'water'; enterBridgeWorld(now); }
  else if (stage === 'mountain') { worldMode = 'bridge'; enterMountainWorld(now); }
  else {
    worldMode = 'meadow';
    for (const obj of [meadowBase, meadow, meadowBlades, mossPatches, stoneInstances, pebbleInstances, petalMesh, flowerCenterMesh, flowerStemMesh, safetyGround, grassBlades, ...landDecorationObjects, ...landBoundaryObjects]) obj.visible = true;
    for (const obstacle of obstacles) obstacle.group.visible = true;
    waterWorld.visible = false; bridgeWorld.visible = false; mountainWorld.visible = false; underwaterBubbleMesh.visible = false;
    for (const friend of friends) {
      const spec = friendSpecs.find(item => item.name === friend.name);
      friend.x = spec.x; friend.z = spec.z; friend.worldFloorY = 0; friend.met = false;
      friend.slug.position.set(friend.x, 0, friend.z); friend.slug.rotation.y = Math.PI;
      friend.nameSprite.position.set(friend.x, 4.05, friend.z); friend.bobble.group.visible = false;
    }
    for (const item of decorBubbles) item.group.visible = false;
    const eyebrow = document.querySelector('.brand-copy .eyebrow'); if (eyebrow) eyebrow.textContent = 'SOFT LITTLE MEADOW';
    const hint = document.querySelector('.world-hint span:last-child'); if (hint) hint.textContent = 'The Meadow · wander, bounce, and find fizzy pearls';
    const mapTitle = document.querySelector('.map-heading b'); if (mapTitle) mapTitle.textContent = 'MEADOW MAP';
    scene.fog = new THREE.Fog('#bfece1', 95, 250); hemi.color.set('#e8fff7'); hemi.groundColor.set('#548d7a'); fillLight.color.set('#b7fff0');
    setWeather('clear', now); applyLocalTime();
  }
  setReplayCollectibleVisibility(stage);
  if (stage === 'meadow') { state.x = 0; state.y = 0; state.z = 12; state.yaw = Math.PI; }
  if (stage === 'water') {
    state.x = 0; state.y = 0; state.z = 12; state.yaw = Math.PI;
    for (const friend of friends) {
      const spec = friendSpecs.find(item => item.name === friend.name);
      friend.x = spec.x; friend.z = spec.z; friend.worldFloorY = 0; friend.met = false;
      friend.slug.position.set(friend.x, 0, friend.z); friend.slug.rotation.y = Math.atan2(state.x - friend.x, state.z - friend.z);
      friend.nameSprite.position.set(friend.x, 4.05, friend.z); friend.bobble.y = 3.5; friend.bobble.group.position.set(friend.x + 1.4, 3.5, friend.z); friend.bobble.group.visible = true;
    }
  }
  if (stage === 'bridge') { const spawn = bridgePlatforms[0]; state.x = spawn.x; state.y = spawn.y; state.z = spawn.z; state.yaw = Math.PI; }
  if (stage === 'mountain') { const start = mountainTrailNodes[0]; state.x = start.x; state.y = start.y; state.z = start.z; state.yaw = Math.PI; }
  state.vx = state.vy = state.vz = 0; state.waterJumpsUsed = 0; state.stageAwaitingTap = false; state.paused = false;
  if (stageMusicWorld === worldMode && stageMusicElement) { try { stageMusicElement.currentTime = 0; } catch {} tryPlayStageMusic(); }
  else setStageMusic(worldMode, true);
  updateHUD(); drawMinimap(); refreshPrompt();
}
for (const button of document.querySelectorAll('[data-replay-stage]')) {
  button.addEventListener('click', () => launchReplayStage(button.dataset.replayStage));
}

function updateFizzFinale(now) {
  const f = state.finale, rawElapsed = (now - f.startAt) / 1000;
  const smooth = (v) => { v = THREE.MathUtils.clamp(v, 0, 1); return v * v * (3 - 2 * v); };

  // A boarded-turtle finish gets its own short exit beat before the standard mint dance starts.
  // The hop clears the shell, then the character walks the final step to a clear patch of seabed.
  const exitDuration = f.exitTurtle ? f.exitDuration : 0;
  if (f.exitTurtle && rawElapsed < exitDuration) {
    const hopDuration = 0.55;
    let progress, walkY;
    if (rawElapsed < hopDuration) {
      const hopT = THREE.MathUtils.clamp(rawElapsed / hopDuration, 0, 1);
      progress = 0.88 * smooth(hopT);
      walkY = THREE.MathUtils.lerp(f.exitStart.y, 0, hopT) + Math.sin(hopT * Math.PI) * 1.75;
    } else {
      const walkT = THREE.MathUtils.clamp((rawElapsed - hopDuration) / (exitDuration - hopDuration), 0, 1);
      progress = 0.88 + 0.12 * smooth(walkT);
      walkY = 0;
    }
    state.x = THREE.MathUtils.lerp(f.exitStart.x, f.exitTarget.x, progress);
    state.z = THREE.MathUtils.lerp(f.exitStart.z, f.exitTarget.z, progress);
    state.y = Math.max(0, walkY);
    state.yaw = f.exitWalkYaw;
    player.position.set(state.x, state.y, state.z);
    player.rotation.set(0, f.exitWalkYaw, 0);
    player.scale.setScalar(1);
    for (const feeler of player.userData.feelers) {
      const wobble = Math.sin(rawElapsed * 17 + feeler.side) * 0.11;
      feeler.mesh.rotation.z = feeler.baseRotZ + wobble;
      feeler.tip.rotation.z = feeler.baseRotZ + wobble;
    }
    camera.position.set(state.x + f.camOffset.x, state.y + f.camOffset.y, state.z + f.camOffset.z);
    camera.up.set(0, 1, 0); camera.lookAt(state.x, state.y + 1.32, state.z - 0.2);
    return;
  }
  if (f.exitTurtle && !f.exitCompleted) {
    state.x = f.exitTarget.x; state.y = 0; state.z = f.exitTarget.z; state.yaw = f.exitWalkYaw;
    f.exitCompleted = true;
  }
  const elapsed = Math.max(0, rawElapsed - exitDuration);
  const zoom = smooth(elapsed / 2.45);
  const closeOffset = new THREE.Vector3(2.65, 2.75, 6.9);
  let camOffset = f.camOffset.clone().lerp(closeOffset, zoom);
  let danceBounce = 0;
  if (elapsed < 3.65) {
    danceBounce = Math.abs(Math.sin(elapsed * 5.6)) * 0.42;
    const turn = smooth(elapsed / 0.85);
    let yawDelta = ((f.cameraYaw - f.baseYaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
    player.rotation.y = f.baseYaw + yawDelta * turn + Math.sin(elapsed * 4.8) * 0.18;
    player.rotation.z = Math.sin(elapsed * 7.1) * 0.095;
    player.rotation.x = Math.sin(elapsed * 5.3) * 0.045;
    player.scale.setScalar(1 + Math.sin(elapsed * 8.2) * 0.025);
  } else {
    player.rotation.y = f.baseYaw; player.rotation.z = 0; player.rotation.x = 0; player.scale.setScalar(1);
    const pullback = smooth((elapsed - 4.25) / 1.45);
    camOffset.lerp(f.camOffset, pullback);
  }
  const sceneDanceY = f.enteredWater ? state.y : f.danceY;
  player.position.set(state.x, sceneDanceY + danceBounce, state.z);
  for (const feeler of player.userData.feelers) {
    const wobble = Math.sin(elapsed * 8 + feeler.side) * 0.08;
    feeler.mesh.rotation.z = feeler.baseRotZ + wobble; feeler.tip.rotation.z = feeler.baseRotZ + wobble;
  }
  camera.position.set(state.x + camOffset.x, sceneDanceY + danceBounce + camOffset.y, state.z + camOffset.z);
  camera.up.set(0, 1, 0); camera.lookAt(state.x, sceneDanceY + danceBounce + 1.32, state.z - 0.2);
  const fovBlend = elapsed < 3.25 ? smooth(elapsed / 2.45) : (elapsed > 4.25 ? 1 - smooth((elapsed - 4.25) / 1.45) : 1);
  camera.fov = THREE.MathUtils.lerp(f.fovStart, 39, fovBlend); camera.updateProjectionMatrix();
  if (elapsed >= 3.02 && !f.overlayShown) {
    f.overlayShown = true; $('#finale-overlay').classList.add('is-visible');
  }
  if (elapsed >= 3.78 && !f.enteredWater) {
    if (f.targetWorld === 'water') enterWaterWorld(now);
    else if (f.targetWorld === 'bridge') enterBridgeWorld(now);
    else if (f.targetWorld === 'mountain') enterMountainWorld(now);
    else if (f.targetWorld === 'complete') { state.bridgeStageComplete = true; f.enteredWater = true; $('#finale-kicker').textContent = 'BLUE RIDGE SUMMIT'; $('#finale-title').textContent = 'You reached the summit!'; $('#finale-subtitle').textContent = 'The fresh mountain mints are yours. Take in the blue ridge breeze.'; $('#finale-overlay').classList.add('is-visible'); sfx(880, 0.25, 'triangle', 0.14); }
  }
  if (elapsed >= 4.3 && f.targetWorld !== 'complete' && !state.stageAwaitingTap) $('#finale-overlay').classList.remove('is-visible');
  if (elapsed >= 5.78) {
    if (f.targetWorld === 'complete' || !state.stageAwaitingTap) $('#finale-overlay').classList.remove('is-visible');
    f.active = false; player.position.set(state.x, state.y, state.z); player.rotation.y = f.baseYaw; player.rotation.x = player.rotation.z = 0; player.scale.setScalar(1);
    camera.position.set(state.x + 7.8, state.y + 6.2, state.z + 12.4); camera.lookAt(state.x, state.y + 2.5, state.z - 1.4);
    camera.fov = window.innerWidth < 650 ? 59 : 55; camera.updateProjectionMatrix();
    touchControls.classList.remove('finale-lock'); $('#pause-toggle').disabled = false;
    if (state.stageAwaitingTap) $('#stage-continue-button').classList.remove('is-hidden');
    if (f.targetWorld === 'complete') {
      state.paused = true; touchControls.classList.add('finale-lock'); $('#pause-toggle').disabled = true;
      $('#stage-select-overlay').classList.remove('is-hidden');
      createReplayMintCopies();
      const listMap = { meadow: pearls.length, water: waterMints.length, bridge: bridgeMints.length, mountain: mountainMints.length };
      for (const button of document.querySelectorAll('[data-replay-stage]')) {
        const key = button.dataset.replayStage;
        const count = listMap[key];
        const requiredAgain = { meadow:MEADOW_MINT_REQUIREMENT*2, water:WATER_MINT_REQUIREMENT*2, bridge:BRIDGE_MINT_REQUIREMENT*2, mountain:MOUNTAIN_MINT_REQUIREMENT*2 }[key];
        button.querySelector('small').textContent = `${count} mints available · collect ${requiredAgain} · counter resets`;
      }
    }
    clearHeld(); refreshPrompt(); drawMinimap();
  }
}
function collectPearl(pearl) {
  if (pearl.collected || state.finale.active) return;
  pearl.collected = true; pearl.group.visible = false; state.pearls++; state.score += 25;
  sparkle(new THREE.Vector3(pearl.x, pearl.y, pearl.z), state.pearls >= mintRequirementFor('meadow') ? 36 : 10);
  sfx(960, 0.1, 'sine', 0.12); setTimeout(() => sfx(1240, 0.12, 'sine', 0.09), 45);
  updateHUD();
  if (state.pearls >= mintRequirementFor('meadow')) startFizzFinale();
  else toast('A little fizz pearl!');
}

function collectWaterMint(mint) {
  if (mint.collected || worldMode !== 'water' || state.finale.active) return;
  if (seaTurtle.target === mint) seaTurtle.target = null;
  mint.collected = true; mint.group.visible = false; state.waterMintsCollected++; state.score += 40;
  sparkle(new THREE.Vector3(mint.x, mint.baseY + 0.2, mint.z), 15);
  sfx(1120, 0.12, 'sine', 0.12); setTimeout(() => sfx(1460, 0.15, 'triangle', 0.095), 55);
  updateHUD(); drawMinimap();
  if (state.waterMintsCollected >= mintRequirementFor('water')) {
    toast('Seafoam set complete! The ivy bridges are waking up…');
    startStageFinale('bridge');
  } else toast('Seafoam mint! Cool and ocean-fresh.');
}
function collectBridgeMint(mint) {
  if (mint.collected || worldMode !== 'bridge' || state.finale.active) return;
  mint.collected = true; mint.group.visible = false; state.bridgeMintsCollected++; state.score += 55;
  sparkle(new THREE.Vector3(mint.x, mint.surfaceY + 1.1, mint.z), 17);
  sfx(1010, 0.11, 'sine', 0.12); setTimeout(() => sfx(1390, 0.13, 'triangle', 0.1), 50);
  updateHUD(); drawMinimap();
  if (state.bridgeMintsCollected >= mintRequirementFor('bridge')) {
    toast('Bridge garden complete! The Blue Ridge is next…');
    startStageFinale('mountain');
  } else toast('Bridge mint! One step closer to the canopy.');
}
function collectMountainMint(mint) {
  if (mint.collected || worldMode !== 'mountain' || state.finale.active) return;
  mint.collected = true; mint.group.visible = false; state.mountainMintsCollected++; state.score += 65;
  sparkle(new THREE.Vector3(mint.x, mint.surfaceY + 1.05, mint.z), 18);
  sfx(1180,0.12,'sine',0.13); setTimeout(()=>sfx(1560,0.15,'triangle',0.1),55);
  updateHUD(); drawMinimap();
  if(state.mountainMintsCollected >= mintRequirementFor('mountain')) {
    toast('All fresh mountain mints found! Summit celebration!'); startStageFinale('complete');
  } else toast('Fresh mint! Cool as the ridge wind.');
}

function collectHighJumpPowerup(powerup, now) {
  if (worldMode !== 'bridge' || state.finale.active || powerup.collected || now < powerup.respawnAt) return;
  powerup.collected = true; powerup.group.visible = false; powerup.respawnAt = now + 13500;
  state.highJumpUntil = now + 10500; state.highJumpWasActive = true;
  sfx(520, 0.11, 'triangle', 0.14); setTimeout(() => sfx(790, 0.12, 'triangle', 0.15), 75); setTimeout(() => sfx(1050, 0.16, 'sine', 0.13), 150);
  toast('Mint-hole boost! Your hops are super high!');
}
function updateBridgePowerups(now) {
  if (worldMode !== 'bridge') return;
  for (const powerup of bridgePowerups) {
    if (powerup.collected && now >= powerup.respawnAt) { powerup.collected = false; powerup.group.visible = true; }
    if (powerup.collected) continue;
    powerup.group.position.y = powerup.surfaceY + 0.86 + Math.sin(now * 0.002 + powerup.phase) * 0.13;
    powerup.group.rotation.y = Math.sin(now * 0.001 + powerup.phase) * 0.25;
    const dx = state.x - powerup.x, dy = state.y + 1.0 - powerup.group.position.y, dz = state.z - powerup.z;
    if (dx*dx + dy*dy + dz*dz < 1.8 * 1.8) collectHighJumpPowerup(powerup, now);
  }
  const active = now < state.highJumpUntil;
  if (active && player.userData.cherryMesh) {
    const flashColor = Math.floor(now / 125) % 2 === 0 ? '#ff1f3b' : '#fff21a';
    player.userData.cherryMesh.material.color.set(flashColor);
    if (player.userData.cherryMesh.material.emissive) { player.userData.cherryMesh.material.emissive.set(flashColor); player.userData.cherryMesh.material.emissiveIntensity = 0.75; }
  } else if (state.highJumpWasActive && player.userData.cherryMesh) {
    player.userData.cherryMesh.material.color.copy(player.userData.cherryBaseColor);
    if (player.userData.cherryMesh.material.emissive) player.userData.cherryMesh.material.emissiveIntensity = 0;
    state.highJumpWasActive = false;
    if (worldMode === 'bridge' && state.started) toast('Mint-hole boost faded. Find another one among the bridges.');
  }
}

function obstacleHitsAt(obstacle, x, z, y = state.y) {
  if (obstacle.type === 'bumpy') {
    if (y > obstacle.solidHeight) return false;
    const dx = x - obstacle.group.position.x, dz = z - obstacle.group.position.z;
    const c = Math.cos(state.yaw), sn = Math.sin(state.yaw);
    const lx = dx * c - dz * sn, lz = dx * sn + dz * c;
    const rx = SLUG_DIMS.rx + obstacle.radius * 0.80;
    const rz = SLUG_DIMS.rz + obstacle.radius * 0.80;
    return (lx*lx)/(rx*rx) + (lz*lz)/(rz*rz) < 1;
  }
  if (y >= obstacle.clearance) return false;
  const dx = x - obstacle.x, dz = z - obstacle.z;
  const c = Math.cos(obstacle.rotation), sn = Math.sin(obstacle.rotation);
  const lx = dx*c - dz*sn, lz = dx*sn + dz*c;
  const rel = state.yaw - obstacle.rotation;
  const charX = SLUG_DIMS.rz*Math.abs(Math.sin(rel)) + SLUG_DIMS.rx*Math.abs(Math.cos(rel));
  const charZ = SLUG_DIMS.rz*Math.abs(Math.cos(rel)) + SLUG_DIMS.rx*Math.abs(Math.sin(rel));
  return Math.abs(lx) < obstacle.halfLength + charX*0.72 && Math.abs(lz) < obstacle.halfWidth + charZ*0.62;
}
function collidesWithObstacle(x, z, y = state.y) {
  if (worldMode !== 'meadow') return false;
  return obstacles.some(o => obstacleHitsAt(o, x, z, y));
}
const obstacleFlashOriginals = new WeakMap();
function flashObstacle(o, now) {
  o.flashUntil = now + 900;
  const flash = new THREE.Color('#fff0a2');
  o.group.traverse(obj => {
    if (!obj.isMesh) return;
    const materials = Array.isArray(obj.material) ? obj.material : [obj.material];
    for (const mat of materials) {
      if (!mat || !mat.color) continue;
      if (!obstacleFlashOriginals.has(mat)) obstacleFlashOriginals.set(mat, {
        color: mat.color.clone(),
        emissive: mat.emissive ? mat.emissive.clone() : null,
        emissiveIntensity: mat.emissiveIntensity ?? 0,
      });
      mat.color.copy(flash);
      if (mat.emissive) { mat.emissive.set('#ffc94d'); mat.emissiveIntensity = 0.72; }
    }
  });
}
function updateObstacleMotion(dt, now) {
  if (worldMode !== 'meadow') return;
  for (const o of obstacles) {
    // Boing blocks are inert and fixed until the player collides with them. Only hit impulses move them.
    o.bumpVX *= Math.exp(-dt * 5.2); o.bumpVZ *= Math.exp(-dt * 5.2);
    o.bumpX += o.bumpVX * dt; o.bumpZ += o.bumpVZ * dt;
    o.bumpX *= Math.exp(-dt * 0.65); o.bumpZ *= Math.exp(-dt * 0.65);
    o.x = o.baseX + o.bumpX;
    o.group.position.x = o.x; o.group.position.z = o.z + o.bumpZ;
    o.group.position.y = 0;
    o.group.rotation.z = 0;
    if (o.flashUntil && now >= o.flashUntil) {
      o.group.traverse(obj => {
        if (!obj.isMesh) return;
        const materials = Array.isArray(obj.material) ? obj.material : [obj.material];
        for (const mat of materials) {
          const original = mat && obstacleFlashOriginals.get(mat);
          if (!original) continue;
          if (mat.color) mat.color.copy(original.color);
          if (mat.emissive && original.emissive) mat.emissive.copy(original.emissive);
          if (mat.emissive) mat.emissiveIntensity = original.emissiveIntensity;
        }
      });
      o.flashUntil = 0;
    }
  }
}
function resolveObstacleCollisions(oldX, oldZ, now) {
  if (worldMode !== 'meadow') return;
  for (const o of obstacles) {
    if (!obstacleHitsAt(o, state.x, state.z, state.y)) continue;
    if (o.type === 'bumpy') {
      const dx = state.x - o.group.position.x, dz = state.z - o.group.position.z;
      const c = Math.cos(state.yaw), sn = Math.sin(state.yaw);
      let lx = dx*c - dz*sn, lz = dx*sn + dz*c;
      const rx = SLUG_DIMS.rx + o.radius*0.80, rz = SLUG_DIMS.rz + o.radius*0.80;
      let metric = Math.hypot(lx/rx, lz/rz);
      if (metric < 0.001) { lx = 0; lz = rz; metric = 1; }
      lx = lx / metric * 1.035; lz = lz / metric * 1.035;
      state.x = o.group.position.x + lx*c + lz*sn;
      state.z = o.group.position.z - lx*sn + lz*c;
      const nlx = lx/(rx*rx), nlz = lz/(rz*rz), nlen = Math.hypot(nlx,nlz)||1;
      const nx = (nlx*c + nlz*sn)/nlen, nz = (-nlx*sn + nlz*c)/nlen;
      if (now > o.bonkAt) {
        state.vx = nx * 25.5; state.vz = nz * 25.5; state.knockbackUntil = now + 650;
        if (state.y < 0.14) state.vy = Math.max(state.vy, 5.6);
        o.bumpVX = -nx * 3.8; o.bumpVZ = -nz * 3.8;
        o.bonkAt = now + 700; flashObstacle(o, now); toast('BOI-OI-OING!'); playBoing();
      }
    } else {
      const candidateX = state.x, candidateZ = state.z;
      const attemptDX = candidateX - oldX, attemptDZ = candidateZ - oldZ;
      state.x = candidateX; state.z = oldZ;
      const xFree = !collidesWithObstacle(state.x, state.z);
      state.x = oldX; state.z = candidateZ;
      const zFree = !collidesWithObstacle(state.x, state.z);
      if (xFree) { state.x = candidateX; state.z = oldZ; }
      else if (zFree) { state.x = oldX; state.z = candidateZ; }
      else { state.x = oldX; state.z = oldZ; }
      if (now > o.bonkAt) {
        let bx = attemptDX, bz = attemptDZ;
        if (Math.hypot(bx, bz) < 0.01) { bx = oldX - o.x; bz = oldZ - o.z; }
        const backLen = Math.hypot(bx, bz) || 1;
        state.vx = -(bx / backLen) * 23.0; state.vz = -(bz / backLen) * 23.0; state.knockbackUntil = now + 600;
        if (state.y < 0.14) state.vy = Math.max(state.vy, 4.8);
        o.bumpVX = (bx / backLen) * 3.2; o.bumpVZ = (bz / backLen) * 3.2;
        o.bonkAt = now + 850; flashObstacle(o, now); toast('BIG BOING! Try hopping over it.'); playBoing();
      }
    }
    state.x = THREE.MathUtils.clamp(state.x,-103,103);
    state.z = THREE.MathUtils.clamp(state.z,-103,103);
  }
}

function updateMovableProps(dt) {
  if (worldMode !== 'meadow') return;
  if (worldMode !== 'meadow') return;
  if (worldMode !== 'meadow') return;
  const spring = Math.exp(-dt * 4.8), rockDrag = Math.exp(-dt * 1.15);
  for (const prop of movableProps) {
    if (prop.type === 'rock') {
      prop.vx *= rockDrag; prop.vz *= rockDrag;
      prop.offsetX += prop.vx * dt; prop.offsetZ += prop.vz * dt;
    } else {
      // Mushrooms flex aside under pressure, but a spring pulls them back to their rooted home.
      prop.vx += -prop.offsetX * 7.5 * dt; prop.vz += -prop.offsetZ * 7.5 * dt;
      prop.vx *= spring; prop.vz *= spring;
      prop.offsetX += prop.vx * dt; prop.offsetZ += prop.vz * dt;
      const maxOffset = 0.72 * prop.scale, offsetLen = Math.hypot(prop.offsetX, prop.offsetZ);
      if (offsetLen > maxOffset) { prop.offsetX *= maxOffset/offsetLen; prop.offsetZ *= maxOffset/offsetLen; }
    }
    prop.group.position.set(prop.baseX + prop.offsetX, prop.homeY || 0, prop.baseZ + prop.offsetZ);
    if (prop.type === 'mushroom') prop.group.rotation.z = THREE.MathUtils.clamp(prop.offsetX * 0.18, -0.18, 0.18);
    else prop.group.rotation.z = THREE.MathUtils.clamp(prop.vx * 0.06, -0.2, 0.2);
  }
}
function resolveMovablePropCollisions(oldX, oldZ) {
  if (worldMode !== 'meadow') return;
  for (const prop of movableProps) {
    const dx = state.x - prop.group.position.x, dz = state.z - prop.group.position.z;
    const dist = Math.hypot(dx, dz) || 0.001;
    const charRadius = 0.91;
    const minimum = charRadius + prop.radius;
    if (dist >= minimum || state.y > (prop.type === 'mushroom' ? 0.65 : 1.6)) continue;
    const nx = dx/dist, nz = dz/dist;
    const penetration = minimum-dist;
    const approach = Math.max(0, -(state.vx*nx + state.vz*nz));
    // Separate the plush just enough to avoid sinking into the prop, while its mass takes the push.
    state.x += nx * penetration * 0.82; state.z += nz * penetration * 0.82;
    if (prop.type === 'rock') {
      const effort = Math.min(1.8, 0.5 + approach * 0.16) / prop.mass;
      prop.vx -= nx * effort * 4.2; prop.vz -= nz * effort * 4.2;
      const into = state.vx*nx + state.vz*nz;
      if (into < 0) { state.vx -= nx*into*0.92; state.vz -= nz*into*0.92; }
    } else {
      const effort = 0.9 + approach * 0.18;
      prop.vx -= nx * effort; prop.vz -= nz * effort;
      const into = state.vx*nx + state.vz*nz;
      if (into < 0) { state.vx -= nx*into*0.62; state.vz -= nz*into*0.62; }
    }
  }
}
function pointOnBridgePlatform(platform, x, z, padding = 0) {
  const dx = x - platform.x, dz = z - platform.z;
  const c = Math.cos(platform.rotation), sn = Math.sin(platform.rotation);
  const lx = dx * c - dz * sn, lz = dx * sn + dz * c;
  return Math.abs(lx) <= platform.length / 2 + padding && Math.abs(lz) <= platform.width / 2 + padding;
}
function findBridgeLanding(oldY, newY, x, z) {
  if (worldMode !== 'bridge' || state.vy > 0) return null;
  let landing = null;
  for (const platform of bridgePlatforms) {
    if (!pointOnBridgePlatform(platform, x, z, 0.48)) continue;
    if (oldY >= platform.y - 0.035 && newY <= platform.y + 0.02 && (!landing || platform.y > landing.y)) landing = platform;
  }
  return landing;
}
function constrainToBridgeRails() {
  if (worldMode !== 'bridge') return;
  for (const platform of bridgePlatforms) {
    // Only constrain against rails once the player's foot level reaches that deck; this leaves room to hop up from a nearby lower deck.
    if (state.y < platform.y - 0.12 || state.y > platform.y + 1.25) continue;
    const dx = state.x - platform.x, dz = state.z - platform.z;
    const c = Math.cos(platform.rotation), sn = Math.sin(platform.rotation);
    const lx = dx*c - dz*sn, lz = dx*sn + dz*c;
    if (Math.abs(lx) > platform.length/2 - 0.55 || Math.abs(lz) > platform.width/2 + 0.35) continue;
    const safeHalf = Math.max(0.72, platform.width/2 - 0.98);
    if (Math.abs(lz) <= safeHalf) continue;
    const clamped = Math.sign(lz || 1) * safeHalf;
    state.x = platform.x + lx*c + clamped*sn;
    state.z = platform.z - lx*sn + clamped*c;
    const vxLocal = state.vx*c - state.vz*sn;
    const vzLocal = state.vx*sn + state.vz*c;
    const correctedVZ = Math.abs(vzLocal) > 0 ? 0 : vzLocal;
    state.vx = vxLocal*c + correctedVZ*sn;
    state.vz = -vxLocal*sn + correctedVZ*c;
  }
}
function bridgeSupportBelow(x, z, y) {
  let support = 0;
  if (worldMode !== 'bridge') return 0;
  for (const platform of bridgePlatforms) {
    if (platform.y <= y + 0.03 && pointOnBridgePlatform(platform, x, z, 0.22)) support = Math.max(support, platform.y);
  }
  return support;
}
function playerSupportBelow(x, z, y) {
  if (worldMode === 'water') { const turtleTop = seaTurtleSurfaceAt(x,z); return turtleTop !== null && y <= turtleTop + 0.24 ? turtleTop : 0; }
  if (worldMode === 'bridge') return bridgeSupportBelow(x, z, y);
  if (worldMode === 'mountain') return Math.max(mountainSupportBelow(x, z, y), trampolineSupportBelow(x, z, y));
  if (worldMode === 'meadow') return trampolineSupportBelow(x, z, y);
  return 0;
}
function updatePlayer(dt, now) {
  if (worldMode === 'water' && state.ridingTurtle) {
    state.x = seaTurtle.group.position.x;
    state.z = seaTurtle.group.position.z + seaTurtle.riderOffsetZ;
    state.y = seaTurtleSurfaceAt(state.x,state.z) ?? seaTurtle.topY;
    state.vx = seaTurtle.vx; state.vz = seaTurtle.vz; state.vy = 0;
    state.yaw = seaTurtle.heading;
    state.elapsed += dt;
    player.position.set(state.x,state.y+Math.sin(state.elapsed*8)*0.025,state.z); player.rotation.y=state.yaw; player.rotation.x=player.rotation.z=0;
    shadow.position.set(state.x,state.y*0.02+0.025,state.z); shadow.scale.set(0.72,1.14,1);
    camera.position.set(state.x+7.8,state.y+6.2,state.z+12.4); camera.up.set(0,1,0); camera.lookAt(state.x,state.y+2.5,state.z-1.4);
    return;
  }
  const ix = (held.right ? 1 : 0) - (held.left ? 1 : 0);
  const iz = (held.back ? 1 : 0) - (held.forward ? 1 : 0);
  const oldX = state.x, oldZ = state.z, oldY = state.y, oldVy = state.vy;
  const planarLen = Math.hypot(ix, iz) || 1;
  const speed = 8.8;
  const windStrength = weatherEffectStrength(now);
  const windDrift = worldMode === 'mountain' && weather.kind === 'wind' ? 8.2 * windStrength : ((worldMode !== 'water' && weather.kind === 'wind') ? 2.65 * windStrength : 0);
  const seaPush = worldMode === 'water' && seaCurrent.active ? seaCurrent.strength : 0;
  const pushX = worldMode === 'water' ? seaCurrent.x * seaPush : weather.windX * windDrift;
  const pushZ = worldMode === 'water' ? seaCurrent.z * seaPush : weather.windZ * windDrift;
  const targetVX = ix / planarLen * speed + pushX;
  const targetVZ = iz / planarLen * speed + pushZ;
  const smooth = 1 - Math.exp(-dt * 8.8);
  if (now < state.knockbackUntil) {
    // Let the springy recoil play out briefly instead of steering cancelling it on the next frame.
    const recoilDrag = Math.exp(-dt * 0.85); state.vx *= recoilDrag; state.vz *= recoilDrag;
  } else {
    state.vx += (targetVX - state.vx) * smooth;
    state.vz += (targetVZ - state.vz) * smooth;
  }
  const supportY = playerSupportBelow(state.x, state.z, state.y);
  const jumpPower = now < state.highJumpUntil ? 14.6 : 7.5;
  if (held.jump && state.y <= supportY + 0.025 && state.vy <= 0) {
    state.vy = jumpPower;
    if (worldMode === 'water') { state.waterJumpsUsed = 1; spawnSandPuff(); spawnWaterJumpBubbles(); }
  }
  state.vy -= 19.2 * dt;
  state.y += state.vy * dt;
  if (worldMode === 'meadow' || worldMode === 'mountain') {
    const trampoline = findTrampolineAt(state.x, state.z);
    if (trampoline && state.vy <= 0 && state.y <= trampoline.topY && oldY <= trampoline.topY + 0.62) {
      state.y = trampoline.topY;
      state.vy = 4.4; // gentle, automatic bobbing hops while standing on the spring surface
      state.trampolineReadyUntil = now + 4200;
      trampoline.lastBounceAt = now;
      if (now - trampoline.lastSoundAt > 720) { sfx(360 + rand() * 90, 0.11, 'triangle', 0.07); trampoline.lastSoundAt = now; }
    }
  }
  if (worldMode === 'bridge') {
    const landing = findBridgeLanding(oldY, state.y, state.x, state.z);
    if (landing) { state.y = landing.y; if (state.vy < 0) state.vy = 0; }
  } else if(worldMode === 'mountain') {
    const landing=findMountainLanding(oldY,state.y,state.x,state.z);
    if(landing){state.y=landing.y;if(state.vy<0)state.vy=0;}
  }
  if (worldMode === 'water' && state.y <= supportY + 0.025 && state.vy <= 0) { state.y = supportY; state.vy = 0; state.waterJumpsUsed = 0; }
  if (state.y <= 0) { state.y = 0; if (state.vy < 0) state.vy = 0; }
  const ceiling = worldMode === 'bridge' ? 34 : (worldMode === 'mountain' ? 27 : (worldMode === 'meadow' && (now < state.trampolineLaunchUntil || state.y > 8.2) ? 40 : 8.2));
  if (state.y >= ceiling) { state.y = ceiling; if (state.vy > 0) state.vy = 0; }
  state.x = THREE.MathUtils.clamp(state.x + state.vx * dt, -103, 103);
  state.z = THREE.MathUtils.clamp(state.z + state.vz * dt, -103, 103);
  if (worldMode === 'mountain') resolveMountainTrailMovement(oldX, oldY, oldZ, oldVy);
  if (worldMode === 'water' && !state.ridingTurtle && state.vy <= 0) {
    const turtleTop = seaTurtleSurfaceAt(state.x,state.z);
    if (turtleTop !== null && oldY >= turtleTop - 0.18 && state.y <= turtleTop + 0.12) {
      state.y=turtleTop; state.vy=0; state.waterJumpsUsed=0; state.ridingTurtle=true;
      toast('Turtle taxi! It will guide you toward sea mints.'); sfx(390,0.13,'sine',0.1); setTimeout(()=>sfx(590,0.15,'triangle',0.1),70);
    }
  }
  constrainToBridgeRails();
  resolveObstacleCollisions(oldX, oldZ, now);
  resolveMovablePropCollisions(oldX, oldZ);
  resolveFriendCollisions();
  resolveSeaTurtleBodyCollision();
  resolveWaterShellCollision();
  if (Math.abs(state.x) >= 102.9) state.vx = 0;
  if (Math.abs(state.z) >= 102.9) state.vz = 0;
  if (Math.hypot(state.vx, state.vz) > 0.45) {
    const desired = Math.atan2(state.vx, state.vz);
    let delta = (desired - state.yaw + Math.PI * 3) % (Math.PI * 2) - Math.PI;
    state.yaw += delta * (1 - Math.exp(-dt * 5.4));
  }
  state.elapsed += dt;
  player.position.set(state.x, state.y + (Math.hypot(state.vx, state.vz) > 0.35 ? Math.sin(state.elapsed * 8.2) * 0.035 : Math.sin(state.elapsed * 1.7) * 0.012), state.z);
  player.rotation.y = state.yaw;
  player.rotation.z = THREE.MathUtils.clamp(-state.vx * 0.006, -0.055, 0.055);
  for (const f of player.userData.feelers) {
    f.mesh.rotation.z = f.baseRotZ + Math.sin(state.elapsed * 3.8 + f.side) * 0.018;
    f.tip.rotation.z = f.baseRotZ + Math.sin(state.elapsed * 3.8 + f.side) * 0.018;
  }
  shadow.position.set(state.x + 0.1, Math.max(0.025, state.y * 0.02 + 0.025), state.z);
  const sh = THREE.MathUtils.clamp(1 - state.y * 0.025, 0.4, 1);
  shadow.scale.set(0.82 * sh, 1.38 * sh, 1);
  camera.position.set(state.x + 7.8, state.y + 6.2, state.z + 12.4);
  camera.up.set(0, 1, 0);
  camera.lookAt(state.x, state.y + 2.5, state.z - 1.4);
}
function updateAmbientCreatures(dt, now) {
  for (const critter of ambientCreatureRecords) {
    // Inactive biome creatures are hidden and need no transform/gait work on mobile.
    if (!critter.group.visible || !critter.group.parent?.visible) continue;
    const playerDx = critter.group.position.x - state.x, playerDz = critter.group.position.z - state.z;
    const updateRange = touchGpuProfile ? 78 : 112;
    if (playerDx * playerDx + playerDz * playerDz > updateRange * updateRange) continue;
    const t = now * 0.001 + critter.phase;
    const dxHome = critter.homeX - critter.group.position.x;
    const dzHome = critter.homeZ - critter.group.position.z;
    const radius = Math.hypot(dxHome, dzHome);

    // Hold a heading for a while, then turn gradually and continue walking forward.
    if (now >= critter.nextTurnAt) {
      critter.turnDir = rand() < 0.5 ? -1 : 1;
      critter.turnUntil = now + 650 + rand() * 850;
      critter.turnRate = 0.72 + rand() * 0.62;
      critter.nextTurnAt = now + 3000 + rand() * 4200;
    }
    if (now < critter.turnUntil) {
      critter.heading += critter.turnDir * critter.turnRate * dt;
    } else if (radius > critter.wander * 0.76) {
      const homeHeading = Math.atan2(dxHome, dzHome);
      let delta = ((homeHeading - critter.heading + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
      critter.heading += THREE.MathUtils.clamp(delta, -1.15 * dt, 1.15 * dt);
    }
    if (radius > critter.wander) {
      // At the edge of its little territory, turn smoothly back inward rather than looping in place.
      const homeHeading = Math.atan2(dxHome, dzHome);
      let delta = ((homeHeading - critter.heading + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
      critter.heading += THREE.MathUtils.clamp(delta, -2.1 * dt, 2.1 * dt);
    }

    const gaitRate = critter.kind === 'crab' || critter.kind === 'spider' ? 11.5 : (critter.kind === 'centipede' ? 12.5 : 9.4);
    const gait = Math.sin(t * gaitRate);
    const windStrength = weatherEffectStrength(now);
    const windFactor = (worldMode === 'mountain' && weather.kind === 'wind') ? 0.035 * windStrength : ((worldMode !== 'water' && weather.kind === 'wind') ? 0.012 * windStrength : 0);
    critter.group.position.x += Math.sin(critter.heading) * critter.speed * dt + weather.windX * windFactor * dt;
    critter.group.position.z += Math.cos(critter.heading) * critter.speed * dt + weather.windZ * windFactor * dt;

    if (critter.kind === 'fish') {
      critter.group.position.y = critter.homeY + Math.sin(t * 1.7) * 0.45;
      critter.group.rotation.z = Math.sin(t * 2.5) * 0.08;
    } else if (critter.kind === 'cricket') {
      critter.group.position.y = critter.homeY + Math.pow(Math.max(0, Math.sin(t * 3.1)), 6) * 0.38;
      critter.group.rotation.z = Math.sin(t * 3.2) * 0.045;
    } else if (critter.kind === 'beetle' || critter.kind === 'centipede') {
      critter.group.position.y = critter.homeY + Math.abs(gait) * (critter.kind === 'centipede' ? 0.025 : 0.018);
      critter.group.rotation.z = Math.sin(t * 3.4) * (critter.kind === 'centipede' ? 0.035 : 0.02);
    } else {
      critter.group.position.y = critter.homeY + Math.abs(gait) * (critter.kind === 'crab' ? 0.045 : 0.018);
      critter.group.rotation.z = Math.sin(t * 2.2) * (critter.kind === 'spider' ? 0.025 : 0.035);
    }
    critter.group.rotation.y = critter.heading;
    for (const [i, leg] of critter.animatedLegs.entries()) {
      const phase = t * gaitRate + leg.phase + (i % 2 ? Math.PI : 0);
      // Clearly alternating steps: legs swing forward/back relative to the animal's local body.
      const amplitude = critter.kind === 'centipede' ? 0.48 : (critter.kind === 'spider' ? 0.50 : (critter.kind === 'crab' ? 0.43 : 0.40));
      const amount = amplitude * Math.sin(phase);
      leg.mesh.quaternion.copy(leg.baseQuaternion).multiply(leg.swing.setFromAxisAngle(leg.axis, amount));
    }
    if (critter.group.userData.tailFin) critter.group.userData.tailFin.rotation.y = gait * 0.52;
  }
}
function update(dt, now) {
  if (now >= nextLocalTimeCheck) { applyLocalTime(); nextLocalTimeCheck = now + (60 - new Date().getSeconds()) * 1000; }
  updateWeather(dt, now);
  updateDynamicSky(dt, now);
  updateUnderwaterDetailLOD(now);
  updateMeadowDetailLOD(now);
  if (now >= nextMinimapDraw) { drawMinimap(); nextMinimapDraw = now + 140; }
  updateObstacleMotion(dt, now);
  updateTrampolineVisuals(now);
  updateSeaTurtle(dt, now);
  if(worldMode==='mountain' && weather.kind==='wind' && weatherEffectStrength(now)>0.01) {
    mountainGustGroup.visible=state.started && !state.paused;
    for(const gust of mountainGustStreaks){const t=now*0.0014+gust.phase; gust.mesh.position.set(state.x+Math.sin(t)*gust.span+weather.windX*2.4,state.y+gust.height+Math.sin(t*1.7)*0.35,state.z+Math.cos(t*0.83)*gust.span+weather.windZ*2.4); gust.mesh.rotation.y=Math.atan2(weather.windX,weather.windZ);}
  } else mountainGustGroup.visible=false;
  updateMovableProps(dt);
  updateAmbientCreatures(dt, now);
  updateSandPuffs(dt);
  updateWaterJumpBubbles(dt);
  if (state.finale.active) {
    updateFizzFinale(now);
  } else if (state.started && !state.paused && !state.activeFriend) {
    updatePlayer(dt, now);
    const playerCenter = playerCenterScratch.set(state.x, state.y + 1.0, state.z);
    if (worldMode === 'water') {
      for (const mint of waterMints) {
        if (mint.collected) continue;
        mint.group.position.y = mint.baseY + Math.sin(now * 0.0019 + mint.phase) * 0.22;
        mint.group.rotation.y = Math.sin(now * 0.00065 + mint.phase) * 0.16;
        mint.group.rotation.x = Math.sin(now * 0.0009 + mint.phase) * 0.045;
        if (playerCenter.distanceToSquared(mint.group.position) < 2.15 * 2.15) collectWaterMint(mint);
      }
    } else if (worldMode === 'bridge') {
      for (const mint of bridgeMints) {
        if (mint.collected) continue;
        mint.group.position.y = mint.surfaceY + 1.12 + Math.sin(now * 0.0018 + mint.phase) * 0.16;
        mint.group.rotation.y += dt * 0.55;
        if (playerCenter.distanceToSquared(mint.group.position) < 1.8 * 1.8) collectBridgeMint(mint);
      }
      updateBridgePowerups(now);
    } else if (worldMode === 'mountain') {
      for(const mint of mountainMints) {
        if(mint.collected) continue;
        mint.group.position.y=mint.surfaceY+1.05+Math.sin(now*0.0017+mint.phase)*0.17;
        mint.group.rotation.y+=dt*0.58;
        if(playerCenter.distanceToSquared(mint.group.position)<1.8*1.8) collectMountainMint(mint);
      }
    } else {
      for (const pearl of pearls) {
        if (pearl.collected) continue;
        pearl.group.position.y = pearl.y + Math.sin(now * 0.0018 + pearl.phase) * 0.13;
        pearl.group.rotation.y += dt * 0.65;
        if (playerCenter.distanceToSquared(pearl.group.position) < 1.65 * 1.65) collectPearl(pearl);
      }
    }
  } else {
    // Keep the scene presented behind the welcome card without making the slug move by itself.
    player.position.set(state.x, state.y + Math.sin(now * 0.0017) * 0.012, state.z);
    camera.position.set(state.x + 7.8, state.y + 6.2, state.z + 12.4);
    camera.lookAt(state.x, state.y + 2.5, state.z - 1.4);
  }
  friends.forEach((f, i) => {
    const wave = Math.sin(now * 0.0015 + f.phase);
    f.slug.position.y = f.worldFloorY + (state.activeFriend === f ? 0.05 : 0) + Math.max(0, wave) * 0.035;
    f.slug.rotation.z = wave * 0.012;
    f.nameSprite.position.y = f.worldFloorY + 4.05 + Math.sin(now * 0.002 + f.phase) * 0.07;
    f.bobble.group.position.y = f.bobble.y + Math.sin(now * 0.0016 + f.phase) * 0.16;
    if (state.activeFriend === f) f.slug.rotation.y += 0; // Keep their face turned to the player while chatting.
  });
  if (worldMode === 'water') for (const item of decorBubbles) { item.group.position.y = item.y + Math.sin(now * 0.0011 + item.phase) * 0.24; }
  if (worldMode === 'water') {
    for (const ripple of waterSurfaceRipples) {
      const pulse = 0.92 + 0.12 * Math.sin(now * 0.0014 + ripple.phase);
      ripple.mesh.scale.setScalar(ripple.baseScale * pulse);
      ripple.mesh.position.x = ripple.x + Math.sin(now * 0.00038 + ripple.phase) * 1.6;
      ripple.mesh.position.z = ripple.z + Math.cos(now * 0.00031 + ripple.phase) * 1.4;
      ripple.mesh.material.opacity = 0.055 + 0.045 * (0.5 + 0.5 * Math.sin(now * 0.001 + ripple.phase));
    }
    seaCurrentFoamMaterial.opacity = 0.78;
    seaCurrentFx.visible = seaCurrent.active;
    updateGlobalFoam(now);
    if (seaCurrent.active) {
      const dirX = seaCurrent.x, dirZ = seaCurrent.z, sideX = -dirZ, sideZ = dirX;
      const heading = Math.atan2(dirX, dirZ);
      seaCurrentFoamStreaks.forEach((streak, i) => {
        const along = ((i % 8) - 3.5) * 1.05 + Math.sin(now * 0.0021 + i * 1.7) * 0.32;
        const across = Math.sin(now * 0.0019 + i * 2.13) * (1.0 + (i % 3) * 0.42);
        streak.position.set(state.x + dirX * along + sideX * across, 0.24 + (i % 5) * 0.38 + Math.sin(now * 0.0025 + i) * 0.09, state.z + dirZ * along + sideZ * across);
        streak.rotation.y = heading + Math.sin(now * 0.0018 + i) * 0.24;
        const flicker = 0.75 + 0.38 * (0.5 + 0.5 * Math.sin(now * 0.006 + i * 1.91));
        streak.scale.set((0.5 + (i % 4) * 0.14) * flicker, 0.035 + (i % 3) * 0.012, 0.095 + (i % 2) * 0.035);
      });
      seaCurrentRings.forEach((ring, i) => {
        const pulse = ((now * 0.001 + i / 3) % 1);
        ring.position.set(state.x + dirX * 2.2, 0.12 + i * 0.12, state.z + dirZ * 2.2);
        ring.scale.setScalar(0.7 + pulse * 1.0); ring.material.opacity = 0.58 * (1 - pulse);
      });
    }
    if (now - lastUnderwaterKelpAnimation >= 40) {
      lastUnderwaterKelpAnimation = now;
      for (const kelp of underwaterKelp) if (kelp.group.visible) kelp.group.rotation.z = Math.sin(now * 0.0008 + kelp.phase) * 0.045;
      underwaterSnow.rotation.y += 0.008;
    }
    updateUnderwaterBubbleField(now);
  }
  for (let particleIndex = particles.length - 1; particleIndex >= 0; particleIndex--) {
    const p = particles[particleIndex];
    p.life -= dt;
    p.v.y -= 1.9 * dt;
    p.mesh.position.addScaledVector(p.v, dt);
    p.mesh.material.opacity = Math.max(0, p.life / p.maxLife);
    p.mesh.scale.setScalar(Math.max(0.01, p.life / p.maxLife));
    if (p.life <= 0) { scene.remove(p.mesh); p.mesh.material.dispose(); p.mesh.geometry.dispose(); particles.splice(particleIndex, 1); }
  }
  if (state.started && !state.paused && !state.activeFriend) refreshPrompt();
  skyDome.visible = true;
  skyDome.position.copy(camera.position);
  skyUniforms.uCloudiness.value = skyCloudiness;
  skyUniforms.uNight.value = nightWeight;
  updateSkyActors(now);
  updateCelestialBodies();
  if (performance.now() > state.toastUntil) $('#toast').classList.remove('show');
  if (worldMode === 'water' && state.started && !state.paused && now >= nextUnderwaterBloop) { sfx(260 + rand() * 280, 0.22 + rand() * 0.18, 'sine', 0.025); nextUnderwaterBloop = now + 4200 + rand() * 5600; }
  musicTick();
}

// --- Menu and keyboard/touch input ----------------------------------------------------------------
function startGame() {
  state.started = true; state.paused = false;
  if (weather.phase === 'clear') weather.nextAt = performance.now() + 32000 + rand() * 26000;
  $('#welcome-screen').classList.add('is-hidden'); $('#pause-screen').classList.add('is-hidden');
  touchControls.classList.remove('is-disabled');
  $('#pause-toggle').textContent = 'Ⅱ';
  initAudio(); if (audioContext?.state === 'suspended') audioContext.resume(); setSound(state.soundOn); setStageMusic(worldMode, true); updateWeatherAudio();
  chooseSkyMood(); applyLocalTime(); updateHUD(); drawMinimap(); refreshPrompt(); clearHeld();
}
function pauseGame() {
  if (!state.started || state.finale.active) return;
  state.paused = true; clearHeld(); $('#pause-screen').classList.remove('is-hidden');
  $('#pause-toggle').textContent = '▶';
}
function resumeGame() {
  state.paused = false; $('#pause-screen').classList.add('is-hidden'); $('#pause-toggle').textContent = 'Ⅱ'; clearHeld();
  if (audioContext?.state === 'suspended') audioContext.resume();
  tryPlayStageMusic();
}
$('#resume-button').addEventListener('click', resumeGame);
$('#stage-continue-button').addEventListener('click', () => {
  if (!state.stageAwaitingTap) return;
  state.stageAwaitingTap = false; state.paused = false;
  $('#finale-overlay').classList.remove('is-visible', 'waiting-for-stage-tap'); $('#stage-continue-button').classList.add('is-hidden');
  touchControls.classList.remove('finale-lock'); clearHeld(); refreshPrompt(); updateHUD(); drawMinimap();
  sfx(660, 0.12, 'triangle', 0.12); tryPlayStageMusic();
});
$('#restart-button').addEventListener('click', () => { closeDialogue(); state.x = 0; state.y = 0; state.z = 12; state.vx = state.vy = state.vz = 0; state.yaw = Math.PI; state.started = true; state.paused = false; $('#pause-screen').classList.add('is-hidden'); clearHeld(); });
$('#pause-toggle').addEventListener('click', () => state.paused ? resumeGame() : pauseGame());
$('#sound-toggle').addEventListener('click', () => setSound(!state.soundOn));
$('#welcome-music-toggle').addEventListener('click', () => setSound(!state.soundOn));

function releaseJumpAction(e) {
  if (actionPointer === null || (e && e.pointerId !== actionPointer)) return;
  actionPointer = null; held.jump = false; mobileAction.classList.remove('is-pressed');
}
mobileAction.addEventListener('pointerdown', e => {
  e.preventDefault();
  if (actionPointer !== null || !state.started || state.paused || state.finale.active) return;
  const shouldHold = jumpOrInteract();
  if (!shouldHold) return;
  actionPointer = e.pointerId;
  held.jump = true; mobileAction.classList.add('is-pressed');
  try { mobileAction.setPointerCapture(e.pointerId); } catch {}
}, { passive: false });
mobileAction.addEventListener('pointerup', releaseJumpAction, { passive: false });
mobileAction.addEventListener('pointercancel', releaseJumpAction);
mobileAction.addEventListener('lostpointercapture', releaseJumpAction);
mobileAction.addEventListener('contextmenu', e => e.preventDefault());
function setStick(event) {
  const rect = moveStick.getBoundingClientRect();
  const cx = rect.left + rect.width / 2, cy = rect.top + rect.height / 2;
  const max = rect.width * 0.31;
  let dx = event.clientX - cx, dy = event.clientY - cy;
  const len = Math.hypot(dx, dy);
  if (len > max) { dx = dx / len * max; dy = dy / len * max; }
  stickKnob.style.transform = `translate(${dx}px, ${dy}px)`;
  held.left = dx < -max * 0.23; held.right = dx > max * 0.23;
  held.forward = dy < -max * 0.23; held.back = dy > max * 0.23;
}
moveStick.addEventListener('pointerdown', e => {
  e.preventDefault(); if (!state.started || state.paused || state.activeFriend || state.finale.active) return;
  stickPointer = e.pointerId; moveStick.setPointerCapture(e.pointerId); setStick(e);
}, { passive: false });
moveStick.addEventListener('pointermove', e => { if (stickPointer === e.pointerId) { e.preventDefault(); setStick(e); } }, { passive: false });
function releaseStick(e) { if (stickPointer === null || (e && e.pointerId !== stickPointer)) return; stickPointer = null; held.left = held.right = held.forward = held.back = false; stickKnob.style.transform = 'translate(0,0)'; }
moveStick.addEventListener('pointerup', releaseStick); moveStick.addEventListener('pointercancel', releaseStick); moveStick.addEventListener('lostpointercapture', releaseStick);

const keyBindings = {
  KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right',
  KeyW: 'forward', ArrowUp: 'forward', KeyS: 'back', ArrowDown: 'back',
};
window.addEventListener('keydown', e => {
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
  if (state.finale.active) return;
  if (e.code === 'Escape' || e.code === 'KeyP') { if (state.activeFriend) closeDialogue(); else if (state.paused) resumeGame(); else pauseGame(); return; }
  if (e.code === 'Space') { if (!e.repeat) jumpOrInteract(); return; }
  if (e.code === 'KeyE' || e.code === 'Enter') { if (state.activeFriend) advanceDialogue(); else talkToNearest(); return; }
  if (e.code === 'KeyM') { setSound(!state.soundOn); return; }
  const k = keyBindings[e.code]; if (k && state.started && !state.paused && !state.activeFriend) held[k] = true;
}, { passive: false });
window.addEventListener('keyup', e => {
  if (e.code === 'Space') held.jump = false;
  const k = keyBindings[e.code]; if (k) held[k] = false;
});
window.addEventListener('blur', clearHeld);
document.addEventListener('visibilitychange', () => { if (document.hidden) clearHeld(); });

function frame(now) {
  const rawFrameMs = frame.last ? now - frame.last : 16.7;
  averageFrameMs += (rawFrameMs - averageFrameMs) * 0.08;
  const dt = Math.min(rawFrameMs / 1000, 0.04); frame.last = now;
  if (document.hidden) { frame.last = now; requestAnimationFrame(frame); return; }
  if (touchGpuProfile && now - lastAdaptiveResolutionChange > 1250) {
    const nativeCap = Math.min(window.devicePixelRatio || 1, renderPixelRatioCap);
    let nextRatio = activePixelRatio;
    if (averageFrameMs > 24 && activePixelRatio > minimumAdaptivePixelRatio) nextRatio = Math.max(minimumAdaptivePixelRatio, activePixelRatio - 0.08);
    else if (averageFrameMs < 18 && activePixelRatio < nativeCap) nextRatio = Math.min(nativeCap, activePixelRatio + 0.035);
    if (Math.abs(nextRatio - activePixelRatio) > 0.005) {
      activePixelRatio = nextRatio; renderer.setPixelRatio(activePixelRatio); renderer.setSize(window.innerWidth, window.innerHeight, false);
      lastAdaptiveResolutionChange = now;
    }
  }
  if (now - lastShadowRefresh >= shadowRefreshInterval) { renderer.shadowMap.needsUpdate = true; lastShadowRefresh = now; }
  update(dt, now); renderer.render(scene, camera); requestAnimationFrame(frame);
}
function resize() {
  renderer.setPixelRatio(activePixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.fov = window.innerWidth < 650 ? 59 : 55;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize, { passive: true });
window.addEventListener('orientationchange', () => setTimeout(resize, 120), { passive: true });
// Expose the start action only after the scene, controls, and frame loop are ready.
window.__FIZZY_MEADOW_START__ = startGame;
window.__FIZZY_MEADOW_READY__ = true;
window.dispatchEvent(new Event('fizzy-meadow-ready'));
updateHUD();
requestAnimationFrame(frame);
