import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

// クリームソーダうみうし — a free-roaming 3D plush friendship meadow.
// Movement is player-driven on X/Z; Y follows gravity and the shared jump action.
const $ = (selector) => document.querySelector(selector);
const canvas = $('#game-canvas');
const scene = new THREE.Scene();
let worldMode = 'meadow';
const MEADOW_MINT_REQUIREMENT = 25;
const WATER_MINT_REQUIREMENT = 25;
const BRIDGE_MINT_REQUIREMENT = 30;
scene.background = new THREE.Color('#d5f8f1');
scene.fog = new THREE.Fog('#d5f8f1', 105, 245);

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.6));
renderer.setSize(window.innerWidth, window.innerHeight, false);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.13;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 360);
const hemi = new THREE.HemisphereLight('#f8fffc', '#69a99c', 2.0);
scene.add(hemi);
const sun = new THREE.DirectionalLight('#fff5e8', 3.0);
sun.position.set(-35, 65, 32);
sun.castShadow = true;
sun.shadow.mapSize.set(1536, 1536);
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
  skyUniforms.uTop.value.copy(topColor);
  skyUniforms.uHorizon.value.copy(horizonColor);
  skyUniforms.uLower.value.copy(lowerColor);
  skyUniforms.uCloudiness.value = skyCloudiness;
  skyUniforms.uNight.value = nightWeight;
  const width = skyCanvas.width, height = skyCanvas.height;
  const css = (color) => `#${color.getHexString(THREE.SRGBColorSpace)}`;
  const top = topColor.clone();
  const horizon = horizonColor.clone();
  const lowBand = horizon.clone().lerp(lowerColor, 0.58);
  const deepBand = horizon.clone().lerp(lowerColor, 0.91);
  // The camera looks slightly down over the player, so most visible sky samples the
  // texture near its equator. Keep the lower half colourful too; the old stops packed
  // every change into the top half and made the visible sky read as a single blue strip.
  const gradient = skyContext.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, css(top));
  gradient.addColorStop(0.14, css(top.clone().lerp(horizon, 0.07)));
  gradient.addColorStop(0.28, css(top.clone().lerp(horizon, 0.20)));
  gradient.addColorStop(0.40, css(top.clone().lerp(horizon, 0.43)));
  gradient.addColorStop(0.49, css(horizon));
  gradient.addColorStop(0.56, css(horizon.clone().lerp(lowerColor, 0.28)));
  gradient.addColorStop(0.65, css(lowBand));
  gradient.addColorStop(0.78, css(deepBand));
  gradient.addColorStop(1, css(deepBand.clone().lerp(lowerColor, 0.12)));
  skyContext.globalAlpha = 1;
  skyContext.globalCompositeOperation = 'source-over';
  skyContext.fillStyle = gradient;
  skyContext.fillRect(0, 0, width, height);

  // Reproducible cloud layers: high wisps plus wider cumulus/banks. The random seed
  // changes with the weather mood, not each frame, so the sky never flickers.
  let seed = skyPaintSeed >>> 0;
  const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const isNight = nightWeight > 0.52;
  const isOvercast = skyCloudiness > 0.70;
  const cloudRGB = isNight ? [66, 82, 120] : (isOvercast ? [132, 148, 165] : [255, 255, 255]);
  const cloudAlpha = (isNight ? 0.08 : 0.055) + skyCloudiness * (isNight ? 0.25 : 0.36);
  const cloudCount = Math.round(7 + skyCloudiness * 120);
  for (let i = 0; i < cloudCount; i++) {
    const cx = random() * width;
    const highLayer = random() < 0.38;
    const cy = height * (highLayer ? 0.12 + random() * 0.25 : 0.31 + random() * 0.30);
    const rx = (highLayer ? 38 : 55) + random() * (highLayer ? 135 : 175);
    const ry = (highLayer ? 4 : 8) + random() * (highLayer ? 15 : 33);
    const puffs = 3 + Math.floor(random() * 6);
    for (let j = 0; j < puffs; j++) {
      const x = cx + (random() - 0.5) * rx * 1.6;
      const y = cy + (random() - 0.5) * ry;
      const px = rx * (0.20 + random() * 0.40);
      const py = ry * (0.35 + random() * 0.62);
      const g = skyContext.createRadialGradient(x, y, 0, x, y, px);
      const alpha = cloudAlpha * (highLayer ? 0.38 : 1.0);
      g.addColorStop(0, `rgba(${cloudRGB.join(',')},${alpha})`);
      g.addColorStop(0.58, `rgba(${cloudRGB.join(',')},${alpha * 0.58})`);
      g.addColorStop(1, `rgba(${cloudRGB.join(',')},0)`);
      skyContext.fillStyle = g;
      skyContext.beginPath(); skyContext.ellipse(x, y, px, py, (random() - 0.5) * 0.12, 0, Math.PI * 2); skyContext.fill();
    }
  }
  if (skyCloudiness > 0.58) {
    const alpha = (skyCloudiness - 0.52) * (isNight ? 0.26 : 0.30);
    for (let i = 0; i < 24; i++) {
      const y = height * (0.30 + random() * 0.34);
      const x = random() * width;
      const w = 160 + random() * 390;
      const h = 14 + random() * 37;
      const band = skyContext.createLinearGradient(x, y - h, x, y + h);
      band.addColorStop(0, `rgba(${cloudRGB.join(',')},0)`);
      band.addColorStop(0.5, `rgba(${cloudRGB.join(',')},${alpha})`);
      band.addColorStop(1, `rgba(${cloudRGB.join(',')},0)`);
      skyContext.fillStyle = band; skyContext.fillRect(x - w * 0.5, y - h, w, h * 2);
    }
  }
  // Bright hazy sun-glow on clear days, and a warm horizon at dawn/dusk. The actual
  // 3D sun remains separate so clouds can obscure it naturally.
  const hour = currentLocalHour;
  const dawn = 1 - smooth01(5.0, 8.4, hour);
  const dusk = smooth01(16.4, 19.8, hour);
  const twilight = Math.max(dawn * smooth01(4.0, 5.4, hour), dusk);
  if (!isNight && skyCloudiness < 0.66 && twilight > 0.08) {
    const glow = skyContext.createRadialGradient(width * 0.50, height * 0.49, 1, width * 0.50, height * 0.49, height * 0.30);
    glow.addColorStop(0, `rgba(255,${Math.round(180 + twilight * 38)},${Math.round(136 + twilight * 38)},${0.22 * twilight})`);
    glow.addColorStop(0.40, `rgba(255,176,150,${0.10 * twilight})`);
    glow.addColorStop(1, 'rgba(255,176,150,0)');
    skyContext.fillStyle = glow; skyContext.fillRect(0, 0, width, height);
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
let skyCloudiness = 0.28;
let skyMoodName = 'scattered clouds';
let weatherInitialized = false;
let nextSkyMoodAt = performance.now() + 48000 + Math.random() * 42000;
const sunDiscMaterial = new THREE.MeshBasicMaterial({ color: '#fff6cc', toneMapped: false, fog: false });
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
let skyCloudSeed = 62491;
function skyRand() { skyCloudSeed = (skyCloudSeed * 1664525 + 1013904223) >>> 0; return skyCloudSeed / 4294967296; }
for (let i = 0; i < 26; i++) {
  const cluster = new THREE.Group();
  const puffCount = 4 + Math.floor(skyRand() * 4);
  for (let j = 0; j < puffCount; j++) {
    const puff = new THREE.Mesh(cloudBlobGeometry, cloudMats[Math.floor(skyRand() * cloudMats.length)]);
    puff.position.set((skyRand() - 0.5) * 13, (skyRand() - 0.5) * 2.8, (skyRand() - 0.5) * 3.2);
    puff.scale.set(4.0 + skyRand() * 6.5, 1.7 + skyRand() * 1.45, 2.4 + skyRand() * 3.2);
    cluster.add(puff);
  }
  const angle = skyRand() * Math.PI * 2;
  const radius = 143 + skyRand() * 47;
  cluster.position.set(Math.cos(angle) * radius, 23 + skyRand() * 42, Math.sin(angle) * radius);
  cluster.userData = { roll: (skyRand() - 0.5) * 0.035, sway: skyRand() * Math.PI * 2, homeX: cluster.position.x, threshold: skyRand() };
  cluster.visible = false;
  skyDome.add(cluster); cloudClusters.push(cluster);
}
function chooseSkyMood(now = performance.now()) {
  if (weatherInitialized && weather.kind === 'rain') {
    skyMoodName = 'rain clouds'; skyCloudiness = 0.84 + Math.random() * 0.14;
  } else if (weatherInitialized && weather.kind === 'wind') {
    if (Math.random() < 0.36) { skyMoodName = 'windy clear skies'; skyCloudiness = 0.06 + Math.random() * 0.16; }
    else { skyMoodName = 'wind-blown clouds'; skyCloudiness = 0.35 + Math.random() * 0.27; }
  } else {
    const r = Math.random();
    if (r < 0.34) { skyMoodName = 'clear skies'; skyCloudiness = 0.025 + Math.random() * 0.12; }
    else if (r < 0.78) { skyMoodName = 'scattered clouds'; skyCloudiness = 0.32 + Math.random() * 0.27; }
    else { skyMoodName = 'overcast'; skyCloudiness = 0.76 + Math.random() * 0.20; }
  }
  skyPaintSeed = Math.floor(Math.random() * 0xffffffff) >>> 0;
  nextSkyMoodAt = now + 48000 + Math.random() * 85000;
  for (const cloud of cloudClusters) cloud.visible = cloud.userData.threshold < skyCloudiness;
  // The intended sky condition lives in the local-time/weather box, not the minimap.
  if (weatherInitialized) updateWeatherReadout();
  applyLocalTime();
}
function updateSkyActors(now = performance.now()) {
  if (now >= nextSkyMoodAt) chooseSkyMood(now);
  const hour = currentLocalHour;
  const daylight = 1 - nightWeight;
  // The sun travels east-to-west across the visible sky, dipping below the horizon at night.
  const arc = THREE.MathUtils.clamp((hour - 6) / 12, 0, 1) * Math.PI;
  const altitude = Math.sin(arc) * 0.14 + 0.015;
  const direction = new THREE.Vector3(-Math.cos(arc) * 0.94, altitude, -Math.sin(arc) * 0.94).normalize();
  sunDiscMesh.position.copy(direction).multiplyScalar(257);
  sunGlowMesh.position.copy(direction).multiplyScalar(251);
  sunDiscMesh.visible = daylight > 0.035 && skyCloudiness < 0.72 && worldMode !== 'water';
  sunGlowMesh.visible = daylight > 0.02 && skyCloudiness < 0.86 && worldMode !== 'water';
  if (underwaterRayMaterial) {
    const rayDay = THREE.MathUtils.clamp(daylight, 0, 1) * (0.35 + 0.65 * Math.max(0, altitude));
    underwaterRayMaterial.opacity = worldMode === 'water' ? 0.74 * rayDay * (1 - THREE.MathUtils.smoothstep(skyCloudiness, 0.42, 0.9)) : 0;
  }
  skyUniforms.uTime.value = now;
  skyUniforms.uNight.value = nightWeight;
  sunGlowMaterial.opacity = (0.12 + altitude * 0.21) * (1 - skyCloudiness * 0.42);
  const cloudColor = nightWeight > 0.45 ? cloudNightColor : (skyCloudiness > 0.65 ? cloudOvercastColor : cloudDayColor);
  for (let i = 0; i < cloudClusters.length; i++) {
    const cloud = cloudClusters[i];
    cloud.visible = worldMode !== 'water' && cloud.userData.threshold < skyCloudiness;
    cloud.position.x = cloud.userData.homeX + Math.sin(now * 0.000035 + cloud.userData.sway) * 3.8;
    cloud.rotation.z = Math.sin(now * 0.00012 + cloud.userData.sway) * 0.018 + cloud.userData.roll;
    cloud.traverse(obj => {
      if (!obj.isMesh || !obj.material?.color) return;
      obj.material.color.copy(cloudColor).lerp(cloudShadeColor, Math.max(0, skyCloudiness - 0.62) * 0.48);
      obj.material.opacity = nightWeight > 0.45 ? 0.36 : 0.76 + skyCloudiness * 0.14;
    });
  }
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
  const moonIcon = lunarPhase < 0.04 || lunarPhase > 0.96 ? '●' : (lunarPhase < 0.5 ? '☽' : '☾');
  $('#moon-readout').textContent = `${moonIcon} ${lunar.name} · ${Math.round(moonIllumination * 100)}%`;
  if (weatherInitialized) updateWeatherReadout();
  const keys = worldMode === 'water' ? waterDaylightKeys : (worldMode === 'bridge' ? bridgeDaylightKeys : daylightKeys);
  let left = keys[0], right = keys[keys.length - 1];
  for (let i = 0; i < keys.length - 1; i++) {
    if (hour >= keys[i].h && hour < keys[i + 1].h) { left = keys[i]; right = keys[i + 1]; break; }
  }
  const t = THREE.MathUtils.clamp((hour - left.h) / Math.max(0.001, right.h - left.h), 0, 1);
  const mixColor = (a, b) => new THREE.Color(a).lerp(new THREE.Color(b), t);
  const skyColor = mixColor(left.sky, right.sky);
  const fogColor = mixColor(left.fog, right.fog);
  const lowerColor = mixColor(left.ground, right.ground);
  scene.background.copy(skyColor);
  scene.fog.color.copy(fogColor);
  // The cloud pass is stronger than a simple colour wash: clear skies stay saturated,
  // scattered cloud breaks have bright edges, and overcast skies diffuse the horizon.
  const overcastSky = new THREE.Color(nightWeight > 0.55 ? '#0c1425' : (worldMode === 'water' ? '#668b9c' : '#abb9c8'));
  const overcastFog = new THREE.Color(nightWeight > 0.55 ? '#101b2d' : (worldMode === 'water' ? '#6da8b4' : '#c5d1dc'));
  scene.background.lerp(overcastSky, skyCloudiness * 0.34);
  scene.fog.color.lerp(overcastFog, skyCloudiness * 0.28);
  const dawnWeight = smooth01(4.6, 6.8, hour) * (1 - smooth01(7.0, 8.8, hour));
  const duskWeight = smooth01(16.1, 18.3, hour) * (1 - smooth01(19.0, 21.0, hour));
  const twilightWeight = Math.max(dawnWeight, duskWeight);
  let lowerAtmosphere;
  if (nightWeight > 0.55) {
    lowerAtmosphere = new THREE.Color(worldMode === 'water' ? '#102b46' : (worldMode === 'bridge' ? '#17251f' : '#11182e'));
  } else if (twilightWeight > 0.04) {
    const warmDawn = new THREE.Color('#f3bdc5');
    const warmDusk = new THREE.Color('#ef9a91');
    lowerAtmosphere = warmDawn.lerp(warmDusk, duskWeight / Math.max(0.001, dawnWeight + duskWeight));
    if (worldMode === 'water') lowerAtmosphere.lerp(new THREE.Color('#8acbd9'), 0.28);
    if (worldMode === 'bridge') lowerAtmosphere.lerp(new THREE.Color('#c8aa9b'), 0.22);
  } else if (skyCloudiness > 0.70) {
    lowerAtmosphere = new THREE.Color(worldMode === 'water' ? '#9cbcc7' : '#bdcbd7');
  } else {
    lowerAtmosphere = new THREE.Color(worldMode === 'water' ? '#b4f0f1' : (worldMode === 'bridge' ? '#f0e7d8' : '#f3f7ff'));
  }
  updateSkyGradient(scene.background.clone().multiplyScalar(nightWeight > 0.55 ? 0.74 : 0.86), scene.fog.color, lowerAtmosphere);
  updateSkyActors(performance.now());
  hemi.color.copy(mixColor(left.hemi, right.hemi));
  hemi.groundColor.copy(lowerColor);
  sun.color.copy(mixColor(left.sun, right.sun));
  sun.intensity = THREE.MathUtils.lerp(left.sunI, right.sunI, t) * (1 - skyCloudiness * 0.58);
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
  const sx = 0.65 + rand() * 1.0, sy = 0.42 + rand() * 0.8, sz = 0.55 + rand() * 1.0;
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
  cylinder.castShadow = false; cylinder.receiveShadow = true; scene.add(cylinder); landBoundaryObjects.push(cylinder);
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
  group.position.set(x, 0, z); group.scale.setScalar(scale); group.traverse(o => { if (o.isMesh) o.castShadow = false; }); scene.add(group); landDecorationObjects.push(group); windSwayObjects.push(group);
}
function addSodaMushroom(x, z, scale, capColor) {
  const group = new THREE.Group();
  const stem = new THREE.Mesh(new THREE.CapsuleGeometry(0.42, 1.1, 5, 10), new THREE.MeshStandardMaterial({ color: '#f7eee0', roughness: 0.98, bumpMap: ivoryBump, bumpScale: 0.04 })); stem.position.y = 0.85; stem.castShadow = true; group.add(stem);
  const cap = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16), new THREE.MeshStandardMaterial({ color: capColor, roughness: 0.8, bumpMap: mintBump, bumpScale: 0.05 })); cap.position.y = 1.65; cap.scale.set(1.22, 0.67, 1.18); cap.castShadow = true; group.add(cap);
  const dotMat = new THREE.MeshStandardMaterial({ color: '#fff8ed', roughness: 0.78 });
  for (let i = 0; i < 5; i++) { const a = i * Math.PI * 0.4; const dot = new THREE.Mesh(new THREE.SphereGeometry(0.095, 10, 8), dotMat); dot.position.set(Math.cos(a) * 0.67, 2.05 + (i % 2) * 0.12, Math.sin(a) * 0.65); group.add(dot); }
  group.position.set(x, 0, z); group.scale.setScalar(scale); scene.add(group); landDecorationObjects.push(group); windSwayObjects.push(group);
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
for (let i = 0; i < 26; i++) {
  const ripple = new THREE.Mesh(new THREE.RingGeometry(0.7 + waterRand() * 0.8, 0.76 + waterRand() * 0.8, 32), waterRippleMat);
  ripple.rotation.x = -Math.PI / 2; ripple.position.set((waterRand() * 2 - 1) * 94, 33.94, (waterRand() * 2 - 1) * 94); ripple.scale.setScalar(1.8 + waterRand() * 4.5); waterWorld.add(ripple);
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
  waterWorld.add(coral);
}
const underwaterBubbleMaterial = new THREE.MeshPhysicalMaterial({ color: '#d2fbff', roughness: 0.08, metalness: 0, transparent: true, opacity: 0.45, clearcoat: 1, clearcoatRoughness: 0.04, depthWrite: false });
const underwaterBubbles = [];
for (let i = 0; i < 88; i++) {
  const bubble = new THREE.Mesh(new THREE.SphereGeometry(0.085 + waterRand() * 0.20, 12, 9), underwaterBubbleMaterial);
  const x = (waterRand() * 2 - 1) * 98, z = (waterRand() * 2 - 1) * 98, baseY = waterRand() * 26;
  bubble.position.set(x, baseY, z); waterWorld.add(bubble); underwaterBubbles.push({ mesh: bubble, baseX: x, baseZ: z, baseY, riseSpeed: 0.00018 + waterRand() * 0.00024, drift: 0.25 + waterRand() * 0.95, phase: waterRand() * Math.PI * 2 });
}
const seaCurrent = { active: false, nextAt: performance.now() + 18000, until: 0, x: 0.72, z: -0.42, strength: 2.5, nextBubbleSound: 0 };
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
const seaMintSpots = [
  [-76,-65],[-51,-74],[-24,-78],[13,-77],[48,-69],[77,-54],
  [-84,-25],[-56,-22],[-32,-41],[29,-35],[58,-26],[82,-12],
  [-78,12],[-48,29],[-17,42],[15,22],[45,39],[73,32],
  [-65,66],[-28,73],[18,67],[57,72],[-4,-5],[3,52],[35,-57],
];
if (seaMintSpots.length !== WATER_MINT_REQUIREMENT) throw new Error(`Water World progression requires exactly ${WATER_MINT_REQUIREMENT} sea mints; found ${seaMintSpots.length}`);
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
if (waterMints.length !== WATER_MINT_REQUIREMENT) throw new Error(`Water World created ${waterMints.length} collectibles; ${WATER_MINT_REQUIREMENT} are required for progression.`);

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
  { x: 0, z: 19, y: 25.05, length: 26, width: 4.2, rotation: 0.25 },
  { x: 16, z: 13, y: 28.45, length: 22, width: 3.8, rotation: -0.88 },
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
bridgePlatforms.forEach((platform, pi) => {
  const locals = pi < 6 ? [-platform.length * 0.34, -platform.length * 0.10, platform.length * 0.14, platform.length * 0.36] : [-platform.length * 0.28, 0, platform.length * 0.28];
  locals.forEach((lx, j) => {
    if (bridgeMintSpots.length >= BRIDGE_MINT_REQUIREMENT) return;
    const point = localBridgePoint(platform, lx, j % 2 ? 0.32 : -0.28);
    bridgeMintSpots.push([point.x, point.z, platform.y]);
  });
});
if (bridgeMintSpots.length !== BRIDGE_MINT_REQUIREMENT) throw new Error(`Bridge World requires exactly ${BRIDGE_MINT_REQUIREMENT} progression mints; found ${bridgeMintSpots.length}`);
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
if (bridgeMints.length !== BRIDGE_MINT_REQUIREMENT) throw new Error(`Bridge World created ${bridgeMints.length} collectibles; ${BRIDGE_MINT_REQUIREMENT} are required for progression.`);

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
  { name: 'Berry', x: 40, z: 27, color: '#f0dfc8', tail: '#c68c9b', accessory: 'strawberry', eyes: '#91515a', lines: ['A tiny secret: the strawberries here are mostly made of felt.','They are still very nice to look at, and they never go mushy.','I saved a bubble for you. I hope it sparkles in just the right way.'], seaLines: ['I found a tiny sea strawberry, but a shrimp borrowed it as a hat.','The sea mints are cooler blue than the meadow fizz. They tingle a little!','When I close my eyes, the bubble trails sound like soft rain.'] },
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

// Collectible fizzy pearls lead to little discoveries, but are scattered in an open, explorable space.
const pearlMaterial = [
  new THREE.MeshPhysicalMaterial({ color: '#fff1cd', emissive: '#fff1cd', emissiveIntensity: 0.12, roughness: 0.18, clearcoat: 1 }),
  new THREE.MeshPhysicalMaterial({ color: '#d8fff3', emissive: '#c7fff0', emissiveIntensity: 0.15, roughness: 0.16, clearcoat: 1 }),
  new THREE.MeshPhysicalMaterial({ color: '#ffd4d8', emissive: '#ffd4d8', emissiveIntensity: 0.12, roughness: 0.18, clearcoat: 1 }),
];
const pearlSpots = [
  [-5, 9, 2.0], [7, 1, 1.8], [13, -6, 3.5], [25, -3, 1.5], [11, -24, 2.4],
  [-10, -14, 3.0], [-28, -6, 1.6], [-31, 24, 2.4], [-17, 31, 1.3], [1, 28, 3.3],
  [26, 38, 2.0], [48, 17, 1.4], [50, -15, 3.6], [45, -52, 1.7], [5, -55, 2.9],
  [-15, -47, 1.7], [-45, -52, 2.8], [-61, -25, 1.6], [-56, 8, 3.1], [-37, 48, 1.7],
  [-5, 55, 2.7], [20, 55, 1.5], [56, 50, 3.0], [70, 9, 1.8], [-68, -70, 2.6],
];
if (pearlSpots.length !== MEADOW_MINT_REQUIREMENT) throw new Error(`Meadow progression requires exactly ${MEADOW_MINT_REQUIREMENT} fizz pearls; found ${pearlSpots.length}`);
const pearls = pearlSpots.map(([x, z, y], i) => {
  const g = new THREE.Group();
  const orb = new THREE.Mesh(new THREE.SphereGeometry(0.32, 20, 16), pearlMaterial[i % pearlMaterial.length]); orb.scale.set(1, 1.12, 0.9); orb.castShadow = true; g.add(orb);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.46, 0.038, 8, 28), new THREE.MeshStandardMaterial({ color: '#fffaf0', roughness: 0.35, emissive: '#fff0cb', emissiveIntensity: 0.2 })); ring.rotation.x = 0.2; g.add(ring);
  g.position.set(x, y, z); scene.add(g);
  return { group: g, x, z, y, phase: rand() * Math.PI * 2, collected: false };
});
if (pearls.length !== MEADOW_MINT_REQUIREMENT) throw new Error(`Meadow created ${pearls.length} collectibles; ${MEADOW_MINT_REQUIREMENT} are required for progression.`);

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
  obstacles.push({ type: 'bumpy', group, baseX: x, x, z, scale, radius: 0.83*scale, solidHeight: 1.34*scale, drift, phase: rand()*Math.PI*2, bonkAt: 0 });
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
  obstacles.push({type:'bar',group,x,z,rotation,scale,halfLength:1.72*scale,halfWidth:0.47*scale,clearance:0.74*scale,bonkAt:0});
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

// --- State, controls, music --------------------------------------------------------------------
const state = {
  started: false, paused: false, x: 0, y: 0, z: 12,
  vx: 0, vy: 0, vz: 0, yaw: Math.PI,
  pearls: 0, waterMintsCollected: 0, bridgeMintsCollected: 0, score: 0, friendsMet: 0, elapsed: 0, soundOn: true,
  highJumpUntil: 0, highJumpWasActive: false, bridgeStageComplete: false,
  activeFriend: null, activeDialogueLines: null, toastUntil: 0, bob: 0,
  finale: { active: false, targetWorld: 'water', startAt: 0, baseYaw: Math.PI, camOffset: new THREE.Vector3(7.8, 7.2, 12.4), fovStart: 55, enteredWater: false, overlayShown: false },
};
const held = { left: false, right: false, forward: false, back: false, jump: false };
let weather = { kind: 'clear', nextAt: performance.now() + 10000 + rand() * 6000, until: 0, windX: 0, windZ: 0 };
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
function musicTick() {
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
function updateWeatherReadout() {
  const chip = document.querySelector('#weather-chip');
  if (!chip) return;
  const skyLabel = skyCloudiness < 0.20 ? 'clear sky' : (skyCloudiness < 0.68 ? 'scattered clouds' : 'overcast');
  if (worldMode === 'water') {
    chip.textContent = seaCurrent.active ? `🫧 Bubbly current · ${skyLabel} above` : `🌊 ${skyLabel} above`;
    return;
  }
  if (weather.kind === 'rain') { chip.textContent = `🌧 Light rain · ${skyLabel}`; return; }
  if (weather.kind === 'wind') { chip.textContent = `🍃 Windy · ${skyLabel}`; return; }
  if (skyCloudiness < 0.20) chip.textContent = '☀ Clear skies';
  else if (skyCloudiness < 0.68) chip.textContent = '⛅ Scattered clouds';
  else chip.textContent = '☁ Overcast';
}
function updateWeatherAudio() {
  if (!audioContext) return;
  const now = audioContext.currentTime;
  if (rainNoiseGain) rainNoiseGain.gain.setTargetAtTime(weather.kind === 'rain' ? 0.19 : 0, now, 0.5);
  if (windNoiseGain) windNoiseGain.gain.setTargetAtTime(weather.kind === 'wind' ? 0.22 : 0, now, 0.65);
}
function setWeather(kind, now) {
  weather.kind = kind;
  if (kind === 'clear') {
    weather.until = 0; weather.windX = 0; weather.windZ = 0;
    weather.nextAt = now + 13000 + rand() * 21000;
  } else {
    weather.until = now + 14000 + rand() * 9000;
    if (kind === 'wind') {
      const angle = rand() * Math.PI * 2;
      weather.windX = Math.cos(angle); weather.windZ = Math.sin(angle);
    } else {
      weather.windX = 0.22 * Math.cos(rand() * Math.PI * 2); weather.windZ = 0.22 * Math.sin(rand() * Math.PI * 2);
    }
  }
  rainLines.visible = kind === 'rain' && state.started && !state.paused;
  for (const leaf of windLeaves) leaf.visible = kind === 'wind' && state.started && !state.paused;
  // Couple the weather effect to the sky texture immediately rather than waiting for the next clock tick.
  if (weatherInitialized) chooseSkyMood(now);
  updateWeatherReadout();
  updateWeatherAudio();
  if (state.started && !state.paused && kind !== 'clear') toast(kind === 'rain' ? 'A little meadow shower!' : (worldMode === 'bridge' ? 'A breezy canopy gust!' : 'A meadow gust is stirring the grass!'));
}
function updateWeather(dt, now) {
  if (worldMode === 'water') {
    rainLines.visible = false; for (const leaf of windLeaves) leaf.visible = false;
    if (rainNoiseGain && audioContext) rainNoiseGain.gain.setTargetAtTime(0, audioContext.currentTime, 0.35);
    if (windNoiseGain && audioContext) windNoiseGain.gain.setTargetAtTime(0, audioContext.currentTime, 0.35);
    if (!state.started || state.paused || state.finale.active) return;
    if (!seaCurrent.active && now >= seaCurrent.nextAt) {
      seaCurrent.active = true; seaCurrent.until = now + 6800 + rand() * 4200;
      const angle = rand() * Math.PI * 2; seaCurrent.x = Math.cos(angle); seaCurrent.z = Math.sin(angle); seaCurrent.strength = 3.8 + rand() * 1.6;
      seaCurrent.nextBubbleSound = now;
      toast('A bubbly current is swirling through the sea!');
    } else if (seaCurrent.active && now >= seaCurrent.until) {
      seaCurrent.active = false; seaCurrent.nextAt = now + 19000 + rand() * 24000; seaCurrent.strength = 0;
      toast('The sea has settled again.');
    }
    if (seaCurrent.active && now >= seaCurrent.nextBubbleSound) {
      sfx(260 + rand() * 260, 0.22 + rand() * 0.23, 'sine', 0.135);
      seaCurrent.nextBubbleSound = now + 520 + rand() * 520;
    }
    return;
  }
  if (!state.started || state.paused) {
    rainLines.visible = false; for (const leaf of windLeaves) leaf.visible = false;
    return;
  }
  if (weather.kind !== 'clear' && now >= weather.until) setWeather('clear', now);
  else if (weather.kind === 'clear' && now >= weather.nextAt) setWeather(rand() < 0.38 ? 'rain' : 'wind', now);

  rainLines.visible = weather.kind === 'rain';
  for (const leaf of windLeaves) leaf.visible = weather.kind === 'wind';
  if (weather.kind === 'rain') {
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
  if (weather.kind === 'wind') {
    for (const leaf of windLeaves) {
      leaf.position.x += weather.windX * dt * 7.4 + Math.sin(now * 0.001 + leaf.id) * dt * 0.75;
      leaf.position.z += weather.windZ * dt * 7.4;
      leaf.rotation.z += dt * (2.1 + leaf.id % 3);
      if (Math.hypot(leaf.position.x - state.x, leaf.position.z - state.z) > 34) {
        leaf.position.set(state.x - weather.windX * (17 + rand() * 10) + (rand() - 0.5) * 12, 1 + rand() * 7, state.z - weather.windZ * (17 + rand() * 10) + (rand() - 0.5) * 12);
      }
    }
  }
  for (let i = 0; i < windSwayObjects.length; i++) {
    const amount = weather.kind === 'wind' ? 0.27 : 0.018;
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
  } else if (masterGain && audioContext) masterGain.gain.setTargetAtTime(0, audioContext.currentTime, 0.05);
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
function updateHUD() {
  const stage = worldMode === 'water' ? 'water' : (worldMode === 'bridge' ? 'bridge' : 'meadow');
  const count = stage === 'water' ? state.waterMintsCollected : (stage === 'bridge' ? state.bridgeMintsCollected : state.pearls);
  const limit = stage === 'water' ? WATER_MINT_REQUIREMENT : (stage === 'bridge' ? BRIDGE_MINT_REQUIREMENT : MEADOW_MINT_REQUIREMENT);
  $('#pearl-count').textContent = String(count);
  const pearlLimit = $('#pearl-limit'); if (pearlLimit) pearlLimit.textContent = `/ ${limit}`;
  const pearlIcon = document.querySelector('.pearls-stat .stat-icon'); if (pearlIcon) pearlIcon.textContent = stage === 'water' ? '❋' : (stage === 'bridge' ? '◉' : '✧');
  const label = $('#pearls-stat-label'); if (label) label.textContent = stage === 'water' ? 'SEA MINTS' : (stage === 'bridge' ? 'BRIDGE MINTS' : 'FIZZ');
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
  const visibleCollectibles = worldMode === 'water' ? waterMints : (worldMode === 'bridge' ? bridgeMints : pearls);
  for (const item of visibleCollectibles) if (!item.collected) {
    const x = mapX(item.x), y = mapY(item.z);
    ctx.fillStyle = worldMode === 'water' ? 'rgba(44,211,231,.24)' : (worldMode === 'bridge' ? 'rgba(171,138,83,.24)' : 'rgba(48,183,164,.22)');
    ctx.beginPath(); ctx.arc(x, y, 4.6, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = worldMode === 'water' ? '#24c7db' : (worldMode === 'bridge' ? '#9d7745' : '#35b9a6');
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

function nearestFriend() {
  let nearest = null, dist = Infinity;
  for (const f of friends) {
    const dx = f.slug.position.x - state.x, dy = f.slug.position.y + 0.8 - state.y, dz = f.slug.position.z - state.z;
    const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (d < dist) { dist = d; nearest = f; }
  }
  return dist <= 6.2 ? { friend: nearest, distance: dist } : null;
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
function talkToNearest() {
  if (!state.started || state.paused || state.activeFriend) return;
  const near = nearestFriend();
  if (!near) { toast('Come a little closer to say hello.'); return; }
  const f = near.friend;
  const lines = worldMode === 'water' && Array.isArray(f.seaLines) ? f.seaLines : (worldMode === 'bridge' && Array.isArray(f.bridgeLines) ? f.bridgeLines : f.lines);
  state.activeDialogueLines = lines;
  state.activeFriend = f;
  state.y = f.worldFloorY || 0; state.vy = 0;
  clearHeld();
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
  $('#dialogue-kicker').textContent = worldMode === 'water' ? 'A WATER WORLD HELLO' : (worldMode === 'bridge' ? 'A BRIDGE WORLD HELLO' : 'A MEADOW HELLO');
  $('#dialogue-next').textContent = lines.length > 1 ? 'Keep chatting  →' : 'Goodbye  ✦';
  sfx(660, 0.16, 'sine', 0.14); setTimeout(() => sfx(880, 0.2, 'triangle', 0.11), 90);
}
function closeDialogue() {
  state.activeFriend = null; state.activeDialogueLines = null;
  $('#dialogue-card').classList.add('is-hidden');
  refreshPrompt();
}
function advanceDialogue() {
  const f = state.activeFriend, lines = state.activeDialogueLines; if (!f || !lines) return;
  f.dialogueIndex++;
  if (f.dialogueIndex >= lines.length) { closeDialogue(); return; }
  $('#dialogue-text').textContent = lines[f.dialogueIndex];
  $('#dialogue-next').textContent = f.dialogueIndex === lines.length - 1 ? 'Say goodbye  ✦' : 'Keep chatting  →';
  sfx(530 + f.dialogueIndex * 100, 0.09, 'sine', 0.07);
}
function jumpOrInteract() {
  if (!state.started || state.paused || state.finale.active) return false;
  if (state.activeFriend) { advanceDialogue(); return false; }
  if (nearestFriend()) { talkToNearest(); return false; }
  held.jump = true;
  const supportY = worldMode === 'bridge' ? bridgeSupportBelow(state.x, state.z, state.y) : 0;
  if (state.y <= supportY + 0.025 && state.vy <= 0) state.vy = performance.now() < state.highJumpUntil ? 14.6 : 7.5;
  sfx(420, 0.07, 'sine', 0.035);
  return true;
}
$('#dialogue-next').addEventListener('click', advanceDialogue);
$('#dialogue-close').addEventListener('click', closeDialogue);

function startStageFinale(targetWorld = 'water') {
  if (state.finale.active || (worldMode === 'meadow' && targetWorld !== 'water') || (worldMode === 'water' && targetWorld === 'water') || (worldMode === 'bridge' && targetWorld !== 'complete')) return;
  state.finale.active = true; state.finale.targetWorld = targetWorld; state.finale.startAt = performance.now(); state.finale.baseYaw = state.yaw;
  state.finale.camOffset.set(camera.position.x - state.x, camera.position.y - state.y, camera.position.z - state.z);
  state.finale.danceY = targetWorld === 'complete' ? state.y : 0;
  state.finale.cameraYaw = Math.atan2(2.65, 6.9);
  state.finale.fovStart = camera.fov; state.finale.enteredWater = false; state.finale.overlayShown = false;
  state.vx = state.vy = state.vz = 0; state.y = state.finale.danceY; state.paused = false;
  clearHeld(); $('#talk-prompt').classList.add('is-hidden'); $('#toast').classList.remove('show');
  touchControls.classList.add('finale-lock'); $('#pause-toggle').disabled = true;
  $('#finale-kicker').textContent = worldMode === 'meadow' ? 'EVERY LAST DROP' : (targetWorld === 'bridge' ? 'SEAFOAM SET COMPLETE' : 'BRIDGE GARDEN COMPLETE');
  $('#finale-title').textContent = worldMode === 'meadow' ? 'You found every fizz!' : (targetWorld === 'bridge' ? 'A bridge to a new world!' : 'Every bridge mint found!');
  $('#finale-subtitle').textContent = worldMode === 'meadow' ? 'A little celebration… then, something is bubbling beneath the meadow.' : (targetWorld === 'bridge' ? 'The ivy-covered bridges are waiting above the treetops.' : 'You have explored every level of the Bridge World.');
  sfx(784, 0.16, 'triangle', 0.15); setTimeout(() => sfx(988, 0.18, 'triangle', 0.14), 105);
  setTimeout(() => sfx(1175, 0.20, 'sine', 0.14), 220); setTimeout(() => sfx(1568, 0.36, 'sine', 0.16), 345);
}
function startFizzFinale() { startStageFinale('water'); }

function enterWaterWorld(now) {
  if (worldMode === 'water') return;
  worldMode = 'water'; state.finale.enteredWater = true;
  state.friendsMet = 0;
  for (const friend of friends) friend.met = false;
  // Swap every land-specific layer for the new seabed while preserving the player, pals, and exploration controls.
  for (const obj of [meadowBase, meadow, meadowBlades, mossPatches, stoneInstances, pebbleInstances, petalMesh, flowerCenterMesh, flowerStemMesh, safetyGround, grassBlades, ...landDecorationObjects, ...landBoundaryObjects]) obj.visible = false;
  for (const obstacle of obstacles) obstacle.group.visible = false;
  waterWorld.visible = true;
  skyDome.visible = true; sun.visible = false; moonLight.visible = true; if (moonMesh) moonMesh.visible = false;
  $('#pearls-stat-label')?.replaceChildren(document.createTextNode('SEA MINTS'));
  const brandEyebrow = document.querySelector('.brand-copy .eyebrow'); if (brandEyebrow) brandEyebrow.textContent = 'WATER WORLD';
  updateHUD(); drawMinimap();
  scene.fog = new THREE.FogExp2('#0b5269', 0.0065);
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
  seaCurrent.active = false; seaCurrent.nextAt = now + 14000 + rand() * 9000;
  setWeather('clear', now); applyLocalTime(); updateWeatherReadout();
  const hint = document.querySelector('.world-hint span:last-child'); if (hint) hint.textContent = 'The Water World · follow bubbles and explore';
  const mapTitle = document.querySelector('.map-heading b'); if (mapTitle) mapTitle.textContent = 'WATER WORLD MAP';
  $('#finale-kicker').textContent = 'WELCOME BELOW THE WAVES';
  $('#finale-title').textContent = 'The Water World';
  $('#finale-subtitle').textContent = 'The whole ocean is yours to explore.';
  sfx(330, 0.45, 'sine', 0.11); setTimeout(() => sfx(440, 0.32, 'sine', 0.08), 170);
}
function enterBridgeWorld(now) {
  if (worldMode === 'bridge') return;
  worldMode = 'bridge'; state.finale.enteredWater = true;
  state.x = 0; state.y = 0; state.z = 12; state.vx = state.vy = state.vz = 0; state.yaw = Math.PI;
  state.highJumpUntil = 0; state.highJumpWasActive = false; state.bridgeMintsCollected = 0; state.bridgeStageComplete = false;
  if (player.userData.cherryMesh) player.userData.cherryMesh.material.color.copy(player.userData.cherryBaseColor);
  state.friendsMet = 0;
  const meadowObjects = [meadowBase, meadow, meadowBlades, mossPatches, stoneInstances, pebbleInstances, petalMesh, flowerCenterMesh, flowerStemMesh, safetyGround, grassBlades, ...landDecorationObjects, ...landBoundaryObjects];
  for (const obj of meadowObjects) obj.visible = false;
  for (const obstacle of obstacles) obstacle.group.visible = false;
  waterWorld.visible = false; bridgeWorld.visible = true; seaCurrent.active = false; seaCurrent.strength = 0;
  skyDome.visible = true; sun.visible = true; moonLight.visible = true;
  if (moonMesh) moonMesh.visible = false;
  for (const item of decorBubbles) item.group.visible = false;
  for (const friend of friends) {
    friend.met = false;
    friend.bobble.group.visible = false;
  }
  // Place friends along successive tiers, including a couple of bridges stacked above lower decks.
  const friendPlatforms = [0, 1, 2, 3, 4, 5, 6, 7];
  const friendOffsets = [-8, 1, 3, -5, 5, -2, 4, -7];
  friends.forEach((friend, i) => {
    const platform = bridgePlatforms[friendPlatforms[i]];
    const pt = localBridgePoint(platform, friendOffsets[i], (i % 2 ? 0.7 : -0.6));
    friend.x = pt.x; friend.z = pt.z; friend.worldFloorY = platform.y;
    friend.slug.position.set(friend.x, friend.worldFloorY, friend.z);
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
  $('#finale-subtitle').textContent = 'Stacked timber bridges, dangling ivy, and mint-hole jump boosts await above the forest.';
  scene.fog = new THREE.Fog('#8aab8c', 100, 265);
  hemi.color.set('#e4f4d7'); hemi.groundColor.set('#29442e'); fillLight.color.set('#c8e6ba');
  shadow.material.color.set('#223c28'); shadow.material.opacity = 0.29;
  setWeather('clear', now); applyLocalTime(); updateHUD(); drawMinimap(); updateWeatherReadout();
  sfx(392, 0.3, 'sine', 0.12); setTimeout(() => sfx(523, 0.32, 'triangle', 0.1), 145); setTimeout(() => sfx(659, 0.42, 'sine', 0.12), 300);
}

function updateFizzFinale(now) {
  const f = state.finale, elapsed = (now - f.startAt) / 1000;
  const smooth = (v) => { v = THREE.MathUtils.clamp(v, 0, 1); return v * v * (3 - 2 * v); };
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
  player.position.set(state.x, f.danceY + danceBounce, state.z);
  for (const feeler of player.userData.feelers) {
    const wobble = Math.sin(elapsed * 8 + feeler.side) * 0.08;
    feeler.mesh.rotation.z = feeler.baseRotZ + wobble; feeler.tip.rotation.z = feeler.baseRotZ + wobble;
  }
  camera.position.set(state.x + camOffset.x, f.danceY + danceBounce + camOffset.y, state.z + camOffset.z);
  camera.up.set(0, 1, 0); camera.lookAt(state.x, f.danceY + danceBounce + 1.32, state.z - 0.2);
  const fovBlend = elapsed < 3.25 ? smooth(elapsed / 2.45) : (elapsed > 4.25 ? 1 - smooth((elapsed - 4.25) / 1.45) : 1);
  camera.fov = THREE.MathUtils.lerp(f.fovStart, 39, fovBlend); camera.updateProjectionMatrix();
  if (elapsed >= 3.02 && !f.overlayShown) {
    f.overlayShown = true; $('#finale-overlay').classList.add('is-visible');
  }
  if (elapsed >= 3.78 && !f.enteredWater) {
    if (f.targetWorld === 'water') enterWaterWorld(now);
    else if (f.targetWorld === 'bridge') enterBridgeWorld(now);
    else if (f.targetWorld === 'complete') { state.bridgeStageComplete = true; f.enteredWater = true; $('#finale-kicker').textContent = 'BRIDGE GARDEN COMPLETE'; $('#finale-title').textContent = 'Every mint, every bridge!'; $('#finale-subtitle').textContent = 'The whole treetop garden is yours to wander.'; $('#finale-overlay').classList.add('is-visible'); sfx(880, 0.25, 'triangle', 0.14); }
  }
  if (elapsed >= 4.3 && f.targetWorld !== 'complete') $('#finale-overlay').classList.remove('is-visible');
  if (elapsed >= 5.78) {
    if (f.targetWorld === 'complete') $('#finale-overlay').classList.remove('is-visible');
    f.active = false; player.position.set(state.x, state.y, state.z); player.rotation.y = f.baseYaw; player.rotation.x = player.rotation.z = 0; player.scale.setScalar(1);
    camera.position.set(state.x + 7.8, state.y + 6.2, state.z + 12.4); camera.lookAt(state.x, state.y + 2.5, state.z - 1.4);
    camera.fov = window.innerWidth < 650 ? 59 : 55; camera.updateProjectionMatrix();
    touchControls.classList.remove('finale-lock'); $('#pause-toggle').disabled = false;
    clearHeld(); refreshPrompt(); drawMinimap();
  }
}
function collectPearl(pearl) {
  if (pearl.collected || state.finale.active) return;
  pearl.collected = true; pearl.group.visible = false; state.pearls++; state.score += 25;
  sparkle(new THREE.Vector3(pearl.x, pearl.y, pearl.z), state.pearls === pearls.length ? 36 : 10);
  sfx(960, 0.1, 'sine', 0.12); setTimeout(() => sfx(1240, 0.12, 'sine', 0.09), 45);
  updateHUD();
  if (state.pearls >= MEADOW_MINT_REQUIREMENT) startFizzFinale();
  else toast('A little fizz pearl!');
}

function collectWaterMint(mint) {
  if (mint.collected || worldMode !== 'water' || state.finale.active) return;
  mint.collected = true; mint.group.visible = false; state.waterMintsCollected++; state.score += 40;
  sparkle(new THREE.Vector3(mint.x, mint.baseY + 0.2, mint.z), 15);
  sfx(1120, 0.12, 'sine', 0.12); setTimeout(() => sfx(1460, 0.15, 'triangle', 0.095), 55);
  updateHUD(); drawMinimap();
  if (state.waterMintsCollected >= WATER_MINT_REQUIREMENT) {
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
  if (state.bridgeMintsCollected >= BRIDGE_MINT_REQUIREMENT) {
    toast('Bridge garden complete!');
    startStageFinale('complete');
  } else toast('Bridge mint! One step closer to the canopy.');
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
function updateObstacleMotion(now) {
  for (const o of obstacles) {
    if (o.type === 'bumpy') {
      o.x = o.baseX + Math.sin(now * 0.0012 + o.phase) * o.drift;
      o.group.position.x = o.x;
      o.group.position.y = Math.max(0, Math.sin(now*0.003 + o.phase))*0.055;
      o.group.rotation.z = Math.sin(now*0.0032 + o.phase)*0.035;
    }
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
        state.vx = nx*5.2; state.vz = nz*5.2;
        if (state.y < 0.14) state.vy = Math.max(state.vy, 3.1);
        o.bonkAt = now + 700; flashObstacle(o, now); toast('Boing!'); playBoing();
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
        state.vx = -(bx / backLen) * 5.8; state.vz = -(bz / backLen) * 5.8;
        if (state.y < 0.14) state.vy = Math.max(state.vy, 2.8);
        o.bonkAt = now + 850; flashObstacle(o, now); toast('Boing! Try hopping over it.'); playBoing();
      }
    }
    state.x = THREE.MathUtils.clamp(state.x,-103,103);
    state.z = THREE.MathUtils.clamp(state.z,-103,103);
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
function bridgeSupportBelow(x, z, y) {
  let support = 0;
  if (worldMode !== 'bridge') return 0;
  for (const platform of bridgePlatforms) {
    if (platform.y <= y + 0.03 && pointOnBridgePlatform(platform, x, z, 0.22)) support = Math.max(support, platform.y);
  }
  return support;
}
function updatePlayer(dt, now) {
  const ix = (held.right ? 1 : 0) - (held.left ? 1 : 0);
  const iz = (held.back ? 1 : 0) - (held.forward ? 1 : 0);
  const oldX = state.x, oldZ = state.z, oldY = state.y;
  const planarLen = Math.hypot(ix, iz) || 1;
  const speed = 8.8;
  const windDrift = (worldMode !== 'water' && weather.kind === 'wind') ? 2.65 : 0;
  const seaPush = worldMode === 'water' && seaCurrent.active ? seaCurrent.strength : 0;
  const pushX = worldMode === 'water' ? seaCurrent.x * seaPush : weather.windX * windDrift;
  const pushZ = worldMode === 'water' ? seaCurrent.z * seaPush : weather.windZ * windDrift;
  const targetVX = ix / planarLen * speed + pushX;
  const targetVZ = iz / planarLen * speed + pushZ;
  const smooth = 1 - Math.exp(-dt * 8.8);
  state.vx += (targetVX - state.vx) * smooth;
  state.vz += (targetVZ - state.vz) * smooth;
  const supportY = worldMode === 'bridge' ? bridgeSupportBelow(state.x, state.z, state.y) : 0;
  const jumpPower = now < state.highJumpUntil ? 14.6 : 7.5;
  if (held.jump && state.y <= supportY + 0.025 && state.vy <= 0) state.vy = jumpPower;
  state.vy -= 19.2 * dt;
  state.y += state.vy * dt;
  if (worldMode === 'bridge') {
    const landing = findBridgeLanding(oldY, state.y, state.x, state.z);
    if (landing) { state.y = landing.y; if (state.vy < 0) state.vy = 0; }
  }
  if (state.y <= 0) { state.y = 0; if (state.vy < 0) state.vy = 0; }
  const ceiling = worldMode === 'bridge' ? 34 : 8.2;
  if (state.y >= ceiling) { state.y = ceiling; if (state.vy > 0) state.vy = 0; }
  state.x = THREE.MathUtils.clamp(state.x + state.vx * dt, -103, 103);
  state.z = THREE.MathUtils.clamp(state.z + state.vz * dt, -103, 103);
  resolveObstacleCollisions(oldX, oldZ, now);
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
function update(dt, now) {
  if (now >= nextLocalTimeCheck) { applyLocalTime(); nextLocalTimeCheck = now + (60 - new Date().getSeconds()) * 1000; }
  updateWeather(dt, now);
  if (now >= nextMinimapDraw) { drawMinimap(); nextMinimapDraw = now + 140; }
  updateObstacleMotion(now);
  if (state.finale.active) {
    updateFizzFinale(now);
  } else if (state.started && !state.paused && !state.activeFriend) {
    updatePlayer(dt, now);
    const playerCenter = new THREE.Vector3(state.x, state.y + 1.0, state.z);
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
  for (const item of decorBubbles) { item.group.position.y = item.y + Math.sin(now * 0.0011 + item.phase) * 0.24; item.group.visible = worldMode === 'water'; }
  if (worldMode === 'water') {
    for (const kelp of underwaterKelp) kelp.group.rotation.z = Math.sin(now * 0.0008 + kelp.phase) * 0.045;
    for (const bubble of underwaterBubbles) {
      const surge = seaCurrent.active ? 5.5 : 1.0;
      const rise = ((bubble.baseY + now * bubble.riseSpeed * surge) % 30 + 30) % 30;
      bubble.mesh.position.set(
        bubble.baseX + Math.sin(now * 0.00062 + bubble.phase) * bubble.drift * surge + (seaCurrent.active ? seaCurrent.x * Math.sin(now * 0.001 + bubble.phase) * 0.85 : 0),
        0.35 + rise,
        bubble.baseZ + Math.cos(now * 0.00047 + bubble.phase) * bubble.drift * 0.52 + (seaCurrent.active ? seaCurrent.z * Math.cos(now * 0.0011 + bubble.phase) * 0.65 : 0),
      );
      const pulse = 0.90 + Math.sin(now * 0.0018 + bubble.phase) * 0.10 + (seaCurrent.active ? 0.18 : 0);
      bubble.mesh.scale.setScalar(pulse);
    }
    underwaterSnow.rotation.y += dt * 0.008;
  }
  for (const p of particles.slice()) {
    p.life -= dt;
    p.v.y -= 1.9 * dt;
    p.mesh.position.addScaledVector(p.v, dt);
    p.mesh.material.opacity = Math.max(0, p.life / p.maxLife);
    p.mesh.scale.setScalar(Math.max(0.01, p.life / p.maxLife));
    if (p.life <= 0) { scene.remove(p.mesh); p.mesh.material.dispose(); p.mesh.geometry.dispose(); particles.splice(particles.indexOf(p), 1); }
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
  if (weather.kind === 'clear') weather.nextAt = performance.now() + 7000 + rand() * 8000;
  $('#welcome-screen').classList.add('is-hidden'); $('#pause-screen').classList.add('is-hidden');
  touchControls.classList.remove('is-disabled');
  $('#pause-toggle').textContent = 'Ⅱ';
  initAudio(); if (audioContext?.state === 'suspended') audioContext.resume(); setSound(state.soundOn); updateWeatherAudio();
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
}
$('#resume-button').addEventListener('click', resumeGame);
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
  const dt = Math.min((now - (frame.last || now)) / 1000, 0.04); frame.last = now;
  update(dt, now); renderer.render(scene, camera); requestAnimationFrame(frame);
}
function resize() {
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.6));
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
