# クリームソーダうみうし — Fizzy Meadow

**Latest update — stronger moonlight and cleaner night horizon:** moonlight now uses a true blue ambient fill to reach all lit surfaces (including vertical grass blades, rocks, and bridge sides), plus a directional moon light aimed using the Moon's calculated altitude. Full-moon intensity is stronger; both contributions remain proportional to the real UTC lunar illuminated fraction and fade with night/altitude. The scripted dusk glow and lower-sky band fade as night takes over to prevent a bright halo below the playable world. The moon's unlit side no longer renders a faint full-disc haze.

**Recent corrections — player shadow and Mint Magnet:** the ground shadow is neutral gray instead of green and slightly smaller. Magnet reach now uses 60% of the original range, keeping the existing pull speed, pickup behavior, and vertical movement.

**UI presentation:** HUD/clock/minimap panels and welcome/finale cards retain their original translucent glass backgrounds; the dialogue bubble remains at its original 96% cream opacity; the talk prompt retains its original 92% fill. Only the mobile joystick and jump/talk controls use the deliberately increased transparency from the control-UI change.

**Current progression and world presentation:** The welcome screen shows 50 Fizz required with 104 available in Meadow. Blue Ridge skyline ridges and snow caps remain outside the distance-culling system. Level-clear cards wait for a deliberate tap, and mint pickup toasts only appear after 20 seconds without another mint collection in the current stage.

**Latest correction:** This build restores the renderer and shadow behaviour from before the last experimental performance revision. Distance clipping now turns off far non-target scenery in spatial chunks while keeping the background floor and every mint visible. The Water World turtle is positioned about 11.2 units from the player start, in the actual chase-camera sightline rather than beside/behind the camera. If the player reaches the mint goal while riding, the character hops off the shell, walks a short distance onto clear seabed, and only then performs the zoom-in celebration dance. Level-clear cards wait for a deliberate tap before advancing.

A mobile-friendly, free-roaming 3D plush adventure built for static hosting on GitHub Pages. Explore the meadow, swim through Water World, hop between stacked bridges, and hike the fictional Blue Ridge Mountain. Friends have conversations, harmless creatures wander through each biome, and there are extra mints so you do not need to find every collectible.

## Current standard progression

The current standard run uses twice the original mint requirements and twice the original available pools. The 20% cushion remains for the regular collectible pools, plus 44 bonus Fizz along the four trampoline jump arcs. Completion goals remain unchanged for the standard run.

| Stage | Available | Required to progress |
|---|---:|---:|
| 1 — Fizzy Meadow | 104 Fizz Mints (including 44 airborne trampoline-trail mints) | 50 |
| 2 — Water World | 60 Seafoam Mints | 50 |
| 3 — Bridge World | 72 Bridge Mints | 60 |
| 4 — Blue Ridge Mountain | 84 Fresh Mints | 70 |

Unused mints are removed when the next stage loads. Blue Ridge is a fictional blue mountain world, unrelated to any real place. Its switchback trail has broad inclined stone surfaces and connected junction patches. Mountain walls have collision across their visible footprint, friends are placed on supported safe points, and three trampolines are at ground level near the beginning, middle, and end of the trail.

## Water World

Water World includes 4,000 animated, poppable bubbles (300 closest to the player render as detailed spheres on touch devices and 760 on desktop; distant bubbles use low-cost point LOD), double and triple jumps (press Jump again while airborne), bubble bursts beneath extra jumps, a rideable giant turtle that seeks the nearest uncollected Seafoam Mint while carrying the player, a shell with collision, fish and crabs, and visible currents with world-spanning foam and underwater sand puffs.

## After clearing stage four

The ending promises more worlds to come and offers a selector for replaying any of the four stages. Replay mode doubles both mint availability and the required goals again:

| Stage | Replay mints available | Replay goal |
|---|---:|---:|
| Fizzy Meadow | 208 | 100 |
| Water World | 120 | 100 |
| Bridge World | 144 | 120 |
| Blue Ridge Mountain | 168 | 140 |

Each replay starts the collected-mint counter at zero. Advancing to another world during replay activates that world's expanded pool and resets its counter too.

## Controls

### Desktop

- **W / A / S / D** or **arrow keys** — move around
- **Space** — jump; keep holding to hop repeatedly after landing
- **Space while airborne in Water World** — double jump, then triple jump
- **Space near a friend** — start or continue conversation
- **E / Enter** — alternate talk action
- **M** — toggle music
- **P / Esc** — pause / resume
- **⛶** — fullscreen on supported browsers

Gravity handles falling. There is no sink control or auto-run.

### Phone / tablet

- Drag the **MOVE** joystick to steer.
- Hold **JUMP / TALK** to keep hopping. In Water World, tap it again mid-air for the second and third jumps; near friends it starts or continues conversation.
- Use the fullscreen button on the welcome screen or HUD where supported.

## Music

You can use your own music. Place your MP3 files in `public/assets/` with these exact names:

- `stage01.mp3` — Fizzy Meadow
- `stage02.mp3` — Water World
- `stage03.mp3` — Bridge World
- `stage04.mp3` — Blue Ridge Mountain

The files are optional and are intentionally not included in this ZIP. Each stage attempts to load its corresponding MP3. If a file is missing, fails to load, or does not begin providing media data before the timeout, the existing synthesized music is used as fallback. After adding tracks, rebuild before deployment.

### Friend nameplates and moonlight (2026-10-17)
Friend bodies keep the existing distance LOD, but their nameplates are shown only within 8.8 world units, exactly twice the 4.4-unit talk range, measured with the same vertical offset as the talk interaction. The moon's phase and illuminated fraction are calculated from the real UTC date/time using a low-precision Meeus phase-angle model rather than assuming every lunation is a fixed average length. Direct blue moonlight and a blue `AmbientLight` fill both scale linearly with the illuminated fraction: 40% illumination is 40% of the maximum before the time-of-night and moon-altitude factors; new moon emits no moonlight and full moon reaches 100% of the phase multiplier. The direct light now tracks actual altitude instead of being capped at a shallow angle, the all-surface fill reaches the grass and scenery across the playable worlds, and the sky's scripted twilight glow/horizon band fades as night takes over. Light fades when night has not begun or the moon is below the horizon, and remains gentler underwater.

### Cherry flashlight ground illumination (corrected 2026-10-17)
The nighttime cherry uses a real Three.js spotlight aimed at the ground in front of the player, not just a decorative cone. Its target is near floor height about 6.3 units forward from the lamp, its range is 14 units, and its intensity ramps up to 72 as the lens turns on. The warm translucent cone is tilted down and sized to match the spotlight. The feature stays shadow-free to avoid an extra real-time shadow map cost; the spotlight still illuminates the lit grass and nearby standard-material scenery.

## Rendering and mobile performance

This package intentionally restores the renderer and shadow-update behaviour from the revision before the latest experimental performance pass. The close-up plush character, previous shadow refresh cadence, and world content are retained; the environment batching and GPU-driven far-bubble shader from that experimental pass are not used here. The existing modest bubble LOD, distance culling, and adaptive pixel ratio from the prior baseline remain.

The current baseline keeps 4,000 bubbles in Water World. On touch devices, the nearest 300 render as detailed spheres and the rest as point sprites; bubble motion and contact are updated on the CPU at a throttled cadence. The shadow map refreshes regularly again rather than staying stale until the camera/player moves enough to trigger it. Non-target vegetation, rocks, scenery, friends, and creatures use distance clipping (typically 26–50 world units on phones, with longer ranges for platforms and route surfaces). Static instanced ground dressing is split into spatial chunks so far chunks can be hidden independently. The background floor and mint collectibles are never distance-culled. Stage-clear summary cards require a tap before progressing, giving the player time to read their result.


## Build locally

Requires Node.js 22 or newer. Three.js is loaded from jsDelivr at runtime, so the browser needs an internet connection to load the engine.

```bash
npm ci
npm run dev
npm run check
npm run build
```

The development server prints `http://localhost:5173`. The static site is built into `dist/`.

The build has regression checks for standard/replay mint counts, lunar illumination at new/full moon plus linear 0%/40%/100% light scaling, friend nameplate range, underwater bubble count and turtle/triple-jump systems, adaptive render scale and LOD culling, the final Bridge World jump, Blue Ridge ridge collision, supported safe friend placement, and continuous mountain ramps across five lanes and all eight segments. It checks that ramp height changes stay below 0.15 world units per sampled step; the current maximum is 0.141.

## Deploy to GitHub Pages

1. Push this project to a GitHub repository on `main` or `master`.
2. Open **Settings → Pages** and choose **GitHub Actions** as the source.
3. Push to the branch or run the **Build and deploy to GitHub Pages** workflow manually.
4. The deployment URL appears in the Actions run and `github-pages` environment.

The workflow in `.github/workflows/deploy.yml` checks JavaScript syntax, builds the site, and deploys `dist/`.


## Touch UI and fullscreen
Each UI panel retains the opacity it had before the accidental global-opaque override: the HUD, world hint, clock, minimap panel, weather chip, welcome/finale cards, talk prompt, and other glass surfaces keep their original translucency; the dialogue card remains at its original 96% cream fill. Only the mobile joystick and jump/talk control overlays have the explicitly requested extra transparency. On the welcome screen, the prominent **PLAY FULL SCREEN** option is available, and pressing **Enter the meadow** also tries the browser's Fullscreen API directly from the user's tap. Browsers that reject or do not offer native fullscreen fall back to the app's immersive viewport layout; mobile browsers may still keep browser chrome visible unless the game is launched from a supported Home Screen/PWA mode.

### Magnet visibility and Blue Ridge backdrop
The current build uses a balanced 60% of the original horizontal magnet range: 3.12 units on land and 3.48 underwater, with a 2.8-unit vertical allowance. This gives attracted mints enough space to visibly move before pickup. Pickups remain in peripheral off-route areas, but their original full size and bright aura are restored, and they remain visible throughout their active stage so they can be found. The Blue Ridge magnet is tucked at a ground-level side nook over 65 units away from the climbing trail.

All Blue Ridge mountain terrain objects bypass stage distance-culling. The skyline peaks and snow caps use fog-independent materials and are not frustum-culled, so the mountain silhouette stays visible while exploring the stage.

### Dialogue on mobile landscape

The friend dialogue card uses the original opaque cream panel for readability. In mobile landscape it is anchored bottom-centre between the movement joystick and jump/talk button; its width adapts to the free space between the controls, and longer dialogue remains scrollable.


### UI opacity restored per component (2026-10-17)
- Removed the global opaque-panel override. Components that were translucent before that change are translucent again with their original values: HUD panels (76%), world hint (63%), clock (46%), minimap panel (78%), weather chip (13%), welcome/pause card (90%), finale card (74%/64%), talk prompt (92%), and the glass callout.
- Kept the dialogue card at its original 96% cream fill and retained the transparent mobile movement/action controls. No opacity change was applied globally to unrelated text boxes.
- Magnet models stay at full scale with bright poles/aura, remain visible throughout their active stage, and keep the tuned 60% attraction range.


## Magnet attraction and shadow restoration (2026-10-17)

- Fixed the no-visible-movement magnet bug: the previous active magnet radii (1.73 land / 1.93 water) were at or below the normal mint pickup spheres (1.65–2.15), so a mint in range was collected immediately instead of visibly moving toward the player. While a mint is in magnetic range, it now uses a smaller catch radius (1.05 units, adjusted for vertical separation), giving it time to be pulled before collection. The influence range has since been increased to 60% of its original horizontal reach so attracted mints have room to visibly travel before pickup.
- Magnetic mint motion now measures and updates positions in world space, then converts back to the mint's parent-local space, avoiding coordinate-space mismatches for mints in world groups.
- Restored normal shadow updates by removing the throttled manual shadow refresh (72 ms mobile / 34 ms desktop) and re-enabling `renderer.shadowMap.autoUpdate`. The old throttle left moving-character and prop shadows stale between refreshes; the soft-shadow type and current map resolutions remain unchanged.


### Recent magnet and shadow fixes

The Mint Magnet now pulls targets toward the player in three dimensions and persists its vertical offset instead of having the float animation erase it on the next frame. Mint pickup distances are measured in world coordinates. The build runs a small physical simulation to verify that nearby targets actually converge, vertically aligned mints move vertically, and targets outside the short horizontal field are not affected.

Directional shadows use a correctly updated orthographic projection (`updateProjectionMatrix()` is called after frustum setup). The light/target pair tracks the player with a fixed direction, the target snaps to shadow texel increments to reduce swimming, and the frustum is tightened around local gameplay to avoid spreading shadow resolution across the entire world. Shadow map size is 1536px on touch devices and 2048px on desktop.
