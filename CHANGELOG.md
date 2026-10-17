## 2026-10-17 — Magnet attraction and shadow correction
- Fixed magnet behavior: when active, mints inside its retained 1/3 influence radius now use a smaller, vertical-aware catch radius, so they visibly move toward the player instead of instantly triggering the normal larger collection sphere.
- Magnetic movement uses world-space distance and transforms back into each mint's parent-local coordinate system before updating position.
- Restored frame-synchronous shadow-map updates. The previous `autoUpdate = false` plus manual refresh at 72 ms (touch) / 34 ms (desktop) was the reason dynamic shadows could lag behind the character/props; standard `autoUpdate = true` is restored while retaining the existing PCF soft shadows and map resolutions.

## October 17, 2026 — Restore original opacity per UI component
- Removed the accidental global rule that forced every information panel to an opaque background.
- Restored the original background values component-by-component: HUD panels 76%, world hint 63%, broadcast clock 46%, minimap panel 78%, weather chip 13%, welcome/pause cards 90%, finale card 74%/64%, talk prompt 92%, and the translucent fullscreen callout.
- Kept the dialogue card at its pre-existing 96% cream fill; only the mobile joystick and action controls retain the separately requested extra transparency.
- Updated the build assertions to enforce original per-component opacity and fail if the global opaque-panel override returns.

## October 17, 2026 — Keep dialogue readable and quiet repetitive mint messages
- Kept the speech panel at its existing 36% opacity. Improved text contrast with a fine light outline, paint-order control, and a multi-direction shadow so the letters remain legible over both light and dark 3D scenery without increasing the panel opacity.
- The `stage-goal` requirement pill is hidden only during the level-clear celebration, so it no longer repeats the amount required to collect. It reappears on the next world's arrival card.
- Added per-stage mint-collection timestamps. Mint pickup toasts (including Berry's saved mint) appear only when at least 20 seconds have passed since the previous mint pickup in that stage; pickups, sounds, counters, and progression continue normally when the toast is suppressed.
- Added build assertions for text outline/contrast, the translucent panel value, clear-card goal hiding/restoration, and the 20-second per-stage message throttle.

# Changelog

## October 17, 2026 — Make stage-clear continuation clickable and add stage magnets
- Fixed the clear-screen CTA hit target: the visible finale overlay accepts pointer input, and the continue button explicitly restores pointer events, a valid enabled state, and focus when revealed. The world-arrival tap card uses the same safe setup, preserving the separate tap to begin movement in the next stage.
- The CTA handler prevents accidental default/propagation behavior and handles both the clear action and the following world-entry confirmation.
- Added one collectible magnet power-up to each of the four stages. It is kept off the minimap for discovery, activates a stage-long mint-attraction radius on collection, displays an active magnet indicator, and resets on stage changes/replays.
- Added build guards for the clear-screen pointer-events state, actual continue-button wiring, four stage pickup placements, all four stage-specific mint-attraction update call sites, reset behavior, and a Meadow pickup placement away from spawn.

## October 17, 2026 — Restore previous renderer/shadows and fix turtle-goal finale
- Reverted the most recent experimental environment batching, GPU-driven far-bubble animation, and movement-triggered shadow refresh changes. This build is based on the previous revision's renderer and shadow behaviour, before the latest performance pass that made shadows look wrong.
- Moved the Water World turtle beside the player spawn at (7.1, 0, 12), rather than beneath the player's starting position. The player must approach it and hop onto the shell.
- When the Seafoam Mint goal is reached while riding the turtle, detach cleanly and play a short hop off the shell followed by a brief walk onto clear seabed before the camera zoom and mint dance begin.
- Added build guards for the turtle's offset spawn and the exit-hop/walk sequence so neither behaviour silently regresses.


## October 17, 2026 — Structural mobile rendering optimization (experimental; reverted in the latest package)
- Merged static meadow flower petals/stems/centres into spatial vertex-colour chunks without replacing their underlying shapes or material detail.
- Merged static Bridge World plank/rail meshes and tree trunks/canopies by material, and merged underwater kelp/coral into four spatial chunks while preserving their material textures and sway shader.
- Converted water surface ripples, sea-current foam and ring effects to instancing; jump bubbles and sand puffs use fixed pools instead of allocating/removing meshes during gameplay. Mushrooms use instanced parts while retaining their push/wobble proxies.
- Moved far-bubble drift, rise and current motion to a GPU vertex shader: all 4,000 bubbles remain animated/poppable, while touch devices keep 300 close bubbles as detailed spheres and draw the other 3,700 as points. CPU contact/ranking runs at 15 Hz, detailed bubble matrices at 30 Hz and LOD sort at 4 Hz.
- Preserved the 1024px touch / 1536px desktop shadow-map resolution and the detailed playable character, but restrict casting to the character and refresh the shadow map only after meaningful player movement/turning.
- Added optional `?perf=1` diagnostics reporting FPS, frame time, draw calls, triangles, geometry/texture counts, active pixel ratio and batching savings each second.
- Kept a touch pixel-ratio cap of 1.0 with adaptation down to 0.62 under sustained load, and retained distance-based fog culling of environmental detail.

## October 17, 2026 — Blue Ridge continuity, collision, and doubled mint progression
- Reconciled the canonical source and production copy so `src/main.js`, `src/style.css`, and `dist/` are generated from the same version.
- Rebuilt Blue Ridge switchback junctions as height-matched surface patches, and blended overlapping ramp support heights to eliminate abrupt seam changes across the walkable width.
- Increased mountain collision footprints to match the visible ridge bases, and retained safe, supported friend placement instead of fixed coordinates that could put Kik/Kiki inside a mountain.
- Spread the three mountain trampolines along the trail's start, middle, and end, with each at ground level off the elevated tiles.
- Expanded Water World to 4,000 instanced animated bubbles while keeping triple jump and the rideable mint-following turtle.
- Made the original twice-required progression the standard run: 60/60/72/84 mints available for goals of 50/50/60/70. Replay doubles pools and goals again to 120/120/144/168 available and 100/100/120/140 required, with counters reset.
- Added release checks that sample five lanes across all eight mountain ramps, validate ridge collision clearance, confirm the trampoline locations, and verify standard/replay mint totals.

## Reliable meadow entry
- Bound the welcome button synchronously in the HTML before the 3D module starts building the meadow, so early mobile taps are queued instead of lost.
- Connected the queued action to the game's start function after scene and controls initialization, and removed the later-only duplicate click handler.
- Added visible loading feedback and a retry/reload message if the game module fails to initialize instead of leaving an apparently dead button.
- Verified the queued-start and normal-click paths with a small event harness; syntax, production build, DOM references, asset output, and ZIP integrity checks pass.

## Free-roam friendship meadow

- Replaced the auto-run course with fully player-controlled X/Z roaming and independent vertical rise/sink movement.
- Added a mobile virtual joystick plus separate FLOAT and SINK buttons.
- Reworked the camera to follow with a constant world-space offset; it no longer rotates to match player movement.
- Reworked the character toward the supplied references: turquoise-mint knitted body, symmetrical dark-green stitched star eyes, plumper white-tipped feelers, round red cherry with curved stem, cream side tail, side stitches, fine fabric fibers, and scalloped ivory underside.
- Added eight distinct plush friends, name labels, proximity prompts, conversations, and friendship rewards.
- Added open-world soda pearl collectibles, sparkles, and a large continuous safe meadow.
- Increased synthesized music volume and layered in a fuller melody, chord accompaniment, bass, and rhythmic plops.
- Added the supplied close-up, reference collage, and plush gallery to the asset bundle.
- Simplified some scenery geometry with instancing for more mobile-friendly rendering.


## Long-bodied model, gravity, shared jump/talk, and restored hazards
- Corrected the shared player-and-friend silhouette to a longer front-to-back body, narrower side profile, paired front stars, two feelers, top cherry/stem, rear cream tail, and lengthwise scalloped ruffle.
- Removed vertical flight/sink controls; gravity now pulls the character down, and holding jump triggers another hop on landing.
- Unified Space and mobile JUMP/TALK: close friends open/advance dialogue; otherwise the same input jumps.
- Reinstated solid jelly-bar obstacles and wobbling, bumpy creatures with collision/bonk feedback on the continuous meadow floor.
- Preserved the previous melody/chord sequence and increased only the music bus gain.


## Proportions, meadow map, local sky and weather
- Tuned the shared slug body to a 2:1 front-to-back ratio and replaced narrow tube feelers with broad, outward-splayed, soft paddles mounted on the head.
- Switched friend bodies to neutral plush fabric tinted with distinct palettes; the main character keeps its unique mint body and cherry, while Purin now wears a little cloud accessory instead of copying the cherry.
- Added a live minimap for uncollected mint pearls and not-yet-met friends, with the player’s position and heading.
- Added a local-time sky gradient and matching lighting, plus occasional rain with falling drops/audio and wind with leaf particles, ambient sound, grass sway, and a small movement push.
- Lined the safe world perimeter with fallen logs and instanced grass tufts for lower draw-call overhead on phones.
- Boing collisions now spring the character backward, flash the obstacle warm yellow briefly, and play a dedicated bouncy sound.

## Meadow / lunar lighting polish
- Replaced the fabric-like ground surface with a seamless textured grass albedo and bump map, plus instanced grass blades and moss patches.
- Added hundreds of textured rocks and pebble clusters, tiny pastel wildflowers, and bark-grained boundary logs.
- Made local nighttime distinctly dark, with fading stars, a phase-lit moon surface, and cool moonlight tied to an astronomical-date lunar-cycle approximation.
- Added a clear local-time display using bold Japanese TV-broadcast-style Gothic numerals and an estimated moon phase / illumination readout.



## All Fizz finale and Water World
- Collecting the final pearl now starts a one-shot celebration, with a smooth camera zoom, a little bouncing/wiggling dance, a celebratory note flourish, and a full-screen transition card.
- Added an underwater biome with a procedural sandy seabed texture, mottled stones, gently swaying kelp, pastel coral, rising bubbles, drifting marine particles, overhead light rays, and subtle bubbling ambience.
- On the transition, meadow-only ground layers, flowers, logs, grass, and boing hazards are hidden; the sky/moon/weather rig is replaced by deep-blue underwater lighting and fog.
- Free movement, the existing music, minimap tracking of unspoken friends, and dialogue controls remain available after the transition.
- Verified syntax, production build, core assets, and local HTTP serving. Headless WebGL rendering could not be verified in this environment.


## 2026-10-17 — Seafoam Mints, character proportions, and dynamic sky

- Adjusted the shared character body to a 1.5:1 length/width ratio and reshaped feelers to be elongated and flatter.
- Ensured every friend has an accessory between the feelers, including a cherry for Momo’s “Twinsies!” dialogue.
- Added visible sun/glow, changing clear/scattered/overcast cloud moods, richer daytime sky colours, and cloud-softened sunlight while retaining real local time and lunar phase.
- Added 24 Seafoam Mint collectibles to Water World, world-aware HUD and minimap tracking, underwater-specific friend dialogue, and stable rising/drifting bubble motion.

## October 17, 2026 — Sky / HUD / character polish
- Replaced the sky dome's vertex-color gradient with a uniform-driven shader gradient and retained a coloured scene-background fallback, fixing the flat gray sky failure path.
- Moved the intended weather condition into the local-time HUD alongside the lunar-phase readout; removed duplicate time and weather indicators from the minimap.
- Hid decorative bubble clusters and friend bobble bubbles in the meadow; they appear after transitioning into the Water World.
- Refined feelers into a single slightly shorter and narrower plush paddle, with the lower half tinted to each character's body and the upper half ivory.
- Turned the player toward the close-up camera during the all-Fizz celebration dance.
- Reset the spoken-friend counter and contact markers when the Water World stage begins.

## October 17, 2026 — Sky, weather, and progression reliability
- Replaced the sky's shader path with a locally rasterised panoramic sky texture, using strong top-to-horizon colour transitions, layered cloud textures, and time-specific palettes in Meadow, Water, and Bridge worlds. The sun is placed lower in the visible sky band so it can actually appear from the chase-camera angle; night stars/moon and underwater daylight rays remain time-aware.
- Synchronized rain with overcast skies and wind with clear/scattered skies. Restored visible leaf gusts, moving meadow plants, wind ambience, and a stronger lateral push; the Water World now has stronger bubbling-current pushes, faster bubble surges, and a more audible bubbling effect.
- Added stage-count build assertions: exactly 25 Meadow Fizz pearls, exactly 25 Water Seafoam Mints, and exactly 30 generated Bridge Mints. The build fails if the literal stage lists or progression thresholds drift apart.
- Made Water World mints hover higher, added a luminous aqua ring, and slightly expanded their pickup radius so every required mint is easier to see and collect.
- Kept Bridge World as a vertical stack of timber bridges with rails, posts, ivy and 30 collectible mints. Mint-hole powerups respawn at their own locations after a cooldown, flash the cherry red/yellow, and enable very high jumps for a limited duration.
- Added the collectible-count invariant to the production build checks, in addition to JavaScript syntax, required assets, and normal static-site output validation.

## October 17, 2026 — Sky contrast and stronger stage forces
- Expanded the sky texture's visible horizon-side colour transitions so the chase-camera view shows a true time-of-day gradient instead of a narrow pale-blue band. Added broader high clouds, clearer overcast bands, and twilight glow; the separate 3D sun, moon/stars, and daylight-dependent sea rays are retained.
- Increased meadow wind sway, leaf-gust motion, ambience impact, and the small player push. Increased the Water World's periodic bubbly-current force, bubble surge speed, and bubble sound level.
- Added runtime guards for actual generated collectible object totals as well as their source spot lists: Meadow 25, Water 25, Bridge 30. Also guards the respawning power-up placement count for Bridge World.

## Runtime hotfix — sky colour interpolation

- Fixed `applyLocalTime()` crashing because `mixColor()` referenced an undefined `dayColor` helper. It now constructs THREE.Color instances directly for the sky, fog, ground, hemisphere-light, and sun palettes before interpolation.
- Rebuilt `dist/` so the deployable site contains the same fix as the source.


## 2026-10-17 — World interaction update
- Player turns toward friends on conversation start; friends face back.
- Berry awards one Fizz Mint when the saved-mint dialogue line is reached. Meadow has 26 possible mint rewards while the goal remains 25.
- Stage transitions now finish on a welcome panel and wait for a tap before movement resumes.
- Added pushable, momentum-driven boulders and springy rooted mushrooms to the meadow.
- Increased boing knockback for bump creatures and jelly bars.
- Added harmless ambient beetles and centipedes in the meadow, fish and crabs in Water World, and crickets and spiders in Bridge World.
- Bridge World now spawns the character at the centre of the first bridge, has more spread-out friends (including three on the grass), and constrains movement at side rails.
- Added build-time feature guards for dialogue rewards, movable props, rail collision, critter animation, and tappable stage-arrival UI.

## October 17, 2026 — Stronger boings, roaming creatures, and current/sand effects
- Increased bumpy creature knockback to a strong outward launch and bar knockback to a stronger reverse launch. A short recoil window prevents movement input from cancelling the knockback immediately.
- Made beetles, centipedes, fish, crabs, crickets, and spiders roam wider loops, with faster species-specific movement and extra swimming, hopping, scuttling, and body motion.
- Halved friend talk activation range from 6.2 to 3.1 world units to reduce accidental conversations while jumping.
- When the Berry gift lets the player meet the Meadow goal early, remaining physical Fizz pearls are hidden and marked cleared before Water World starts.
- Added a visible, player-centred trail of white foam streaks and expanding rings whenever the Water World current activates.
- Added small sand puffs around the sea floor each time the character jumps from the bottom.
- Lowered the top bridge deck to y=26.25, only 1.2 units above the second-highest deck, making the final normal jump reachable without changing the mint requirements.
- Extended production build regression checks for talk range, knockback, clearing leftover Fizz, current visuals, sand puffs, autonomous wildlife, and top bridge height. Progression remains 25 Meadow Fizz (plus Berry's bonus gift), 25 Seafoam Mints, and 30 Bridge Mints.


## Runtime fix — underwater particles and fullscreen (2026-10-17)

- Fixed a startup crash by constructing the underwater particle buffer with `new Float32Array(...)`.
- Added a fullscreen toggle to the HUD for desktop and mobile browsers. It uses the browser Fullscreen API (including WebKit-prefixed support) and updates its icon/accessibility label when fullscreen changes.
- Added an immersive app fallback for browsers that do not expose the Fullscreen API. The handler lives in the early inline page bootstrap, so it remains available even if the 3D module fails before startup.
- Added responsive fullscreen button styling.


## October 17, 2026 — Mint cushion, sea foam, and tangible friends
- Set friend speech activation to 4.4 world units, between the previous wide and narrow settings.
- Added physical friend collision across stages and a gentle separation nudge before conversations if the player overlaps a friend.
- Added a large ribbed scallop shell to the Water World and a solid collision footprint so the player cannot pass through it.
- Increased all world mint placements to 1.2× the progression goal: Meadow 30 Fizz for a 25 goal, Water 30 Seafoam Mints for a 25 goal, and Bridge 36 Bridge Mints for a 30 goal. Remaining mints are hidden/cleared as the next stage loads.
- Spread 170 animated white foam streaks across the whole Water World during currents, increased surface ripples to 72, and expanded the ambient bubble field to 176 bubbles.
- Added visible gait animation to beetle, centipede, crab, cricket, and spider legs; fish fins now sway while swimming. Critters receive only a tiny wind drift compared with the character’s stronger wind push.
- Moved the highest bridge closer to the second-highest deck, lowering the height gap to 0.8 units and reducing the horizontal gap. Sora now sits on the second-highest bridge.
- Updated build invariants to check the new mint cushion and interaction/collision features.


## October 17, 2026 — Bridge jump correction, shell redesign, and Blue Ridge Mountain
- Repositioned the highest bridge beyond the forward edge of Sora’s second-highest bridge: deck-edge gap is 0.2 units and the rise is 0.8 units. The rail clamp now only applies when the player has reached the deck’s elevation, preventing the upper bridge from interfering with takeoff. The build measures and fails if the leap geometry regresses.
- Rebuilt the sea shell as a low, open scallop with six soft edge lobes, a nacre-like rose/ivory texture, delicate radial fluting, and a small hinge. Removed the large central oval that made it look like a wheel.
- Reworked critter movement into sustained forward travel aligned with their facing direction. They hold a heading, turn gradually after a while, and steer back inside their small roaming area. Beetles, centipedes, crabs, crickets, and spiders use clearer alternating leg steps; fish continue swimming with tail-fin motion.
- Boing obstacles remain inert and unmoved by wind; only a player impact applies a temporary knockback impulse to the obstacle.
- Added World 4, Blue Ridge Mountain: a fictional blue ridge with switchback ramps, rock shelves, fresh mint collectibles, visible windy gusts, and a strong exposed-ridge push that can send the player back to the base. The level has 42 Fresh Mints with a 35-mint goal.
- Updated build invariants for all four worlds and added geometric assertions for the final bridge hop and Sora’s launch-deck placement.

## 2026-10-17 — Landscape controls, stage goals, trampolines, and mobile rendering
- Made touch controls persist in landscape on coarse-pointer and no-hover devices, including phones whose CSS viewport is wider than 760px; the control sizes adapt to short landscape viewports.
- Made each stage-arrival card explicitly state the required mint count and available cushion: Meadow 25/30 Fizz, Water 25/30 Seafoam, Bridge 30/36, and Blue Ridge 35/42 Fresh Mints.
- Added four oversized plush trampolines to Meadow. Landing on one starts automatic small bounces; pressing Jump while charged launches a huge leap with a higher temporary ceiling.
- Added the local Japanese month/day display in the time HUD (for example, `10月7日`).
- Smoothed weather evolution by moving cloud cover toward targets continuously; cluster opacity and sun dimming update gradually during cloud gathering, showers, and clearing.
- Reduced mobile draw-call overhead without reducing texture resolution or model detail: each cloud cluster's puffs are merged into one geometry/draw call. Soft shadow resolution is retained while the shadow map refreshes at 40 Hz instead of every rendered frame.
- Added build invariants for landscape controls, every stage's progression instructions, all four trampolines, large-jump behavior, gradual weather, merged cloud meshes, and the shadow refresh cadence.

## 2026-10-17 — Water triple jump, custom MP3s, and replayable ending
- Added Water World double and triple jumps: pressing jump again while airborne applies another upward impulse, up to three jumps in one airborne chain, with bubble bursts beneath the character.
- Expanded the moving underwater bubble field to 520 touchable bubbles. Contact pops a bubble, plays a fizzy pop, briefly hides it, and respawns it elsewhere.
- Added per-stage optional music loading from `public/assets/stage01.mp3` (Meadow), `stage02.mp3` (Water), `stage03.mp3` (Bridge), and `stage04.mp3` (Blue Ridge). The built-in synthesized soundtrack is used only if an MP3 errors or doesn't become playable before the load timeout. These user-provided MP3 files are not included in the ZIP; the build copies them automatically once added to `public/assets/`.
- Added a completion screen after Blue Ridge that promises more worlds to come and offers a selector for any of the four stages. Replay mode doubles each stage's mint pool to 60/60/72/84 and resets every collected-mint counter to zero.
- Fixed replay progression so entering the next world after replay reactivates that world's doubled mint pool instead of leaving its collectibles hidden.
- Added build-time regression checks for soundtrack mapping/fallback, underwater triple jump, bubble effects, replay mint duplication/counter resets, the complete level selector, and all three Blue Ridge foothill trampolines.


## Mobile controls, trampoline mint arcs, turtle ride, and performance

- Increased landscape touch controls to large hit targets (roughly 126–152px joystick and 120–146px action button), inset 28px from the screen edges with safe-area padding, including short landscape screens.
- Added 44 airborne Fizz Mints following ballistic parabolas from the four meadow trampolines. The meadow requirement remains 50 while standard availability rises to 104; replay has 208 available and still requires 100.
- Arranged Seafoam Mints as two sparse, offset diagonal sweeps rather than row clusters.
- Moved the giant turtle close to the Water World spawn, increased its ridden speed to 12 world units/sec, locked targets until collected, and collect Seafoam Mints when the turtle's shell/body reaches them.
- Added a procedural scute pattern texture to the turtle shell.
- Kept 4,000 bubbles while replacing most distant glass spheres with low-cost points. The nearest 760 use full shaded spheres; the bubble positions and touch/pop checks update 15–20 times/sec rather than every rendered frame.
- Mobile GPU profile caps render DPR at 1.28, uses a 1024px soft shadow map, and refreshes the shadow map on a cadence that reduces GPU cost without simplifying the main plush character or fabric textures.


## Landscape controls and mobile performance pass

- Enlarged the landscape joystick to 150–174px, the jump/talk button to 140–166px, and increased side/bottom safe margins for more comfortable thumb control.
- Kept all 4,000 Water World bubbles poppable, but use 300 detailed spheres on touch devices and 760 on desktop; the remaining bubbles are lightweight point LOD. Bubble LOD sorting now runs four times per second instead of every field update.
- Added distance LOD for kelp/coral and meadow decoration, a soft water fog fade, less frequent background foliage animation, and adaptive phone render scale that backs off during sustained low frame rates and recovers when frame time improves.
- Kept the meadow trampoline-arc bonus mints available without raising the 50-mint clear requirement; completion copy now celebrates the actual amount collected rather than claiming every mint was found.
- Increased turtle taxi speed to 24 world units per second while preserving its locked target and contact-based mint collection.


## October 17, 2026 — Stronger distance clipping and visible turtle spawn
- Added spatial distance clipping to static instanced meadow/shore/underwater dressing. Distant chunked grass, moss, flowers, stones, and pebbles turn off by chunk; collectible mints and the background floor are deliberately never distance-culled.
- Tightened scenery visibility so decorative ground props fade out around 30–34 units on touch devices (roughly 44–50 on desktop), friends around 30/42, and ambient creatures around 26/38. Water kelp/coral and non-target bubbles use their own near-detail ranges; bridge decks and mountain route surfaces retain longer safe ranges so upcoming traversal remains readable.
- Added explicit build guards for distance culling, excluding target mints and the background floor from the cull lists, plus tap-to-continue level-clear results.
- Moved the Water World turtle to (-5.5, 0, 2.3), approximately 11.2 units from the player start and aligned with the chase camera's actual forward sightline. The build now checks both physical separation and projected camera-forward distance, so the turtle must be visible ahead without overlapping or auto-boarding the player.


## October 17, 2026 — Start-screen counts, mountain backdrop, and hidden magnet balance
- Updated the welcome screen to report the live Meadow progression values: collect 50 Fizz Mints, with 104 available including the trampoline-arc bonus trail. The numbers are refreshed from the same constants used by gameplay.
- Marked Blue Ridge skyline ridges and their snow caps as background mountain scenery, exempted them from distance-based stage clipping, and disabled frustum culling on these skyline elements so they remain in view as the player climbs. Nearby trail ramps, rocks, and props retain their separate clipping rules.
- Moved each stage's hidden magnet into a peripheral nook away from its main mint trail or bridge decks, reduced its size and glow, and cut its attraction radius to 5.2 world units on land / 5.8 underwater (about one-third of the previous reach). Vertical reach and pull speed were reduced too.
- Added build checks for the corrected welcome mint counts, uncullable background mountains, off-route magnet placement, and the reduced magnet range.


## October 17, 2026 — Transparent touch/dialogue UI and start fullscreen request
- Reduced mobile movement-pad and jump-button surface opacity so the world is more visible through controls while keeping button labels and the joystick center readable.
- Made friend dialogue a light glass layer (36% fill opacity, subtle blur) with darker high-contrast text; avatar, close, continue, and nearby-talk prompt surfaces are also more transparent.
- Added a prominent “BEST ON MOBILE · Full screen gives you more room” callout above the start button. The Start click also requests native fullscreen during the user gesture when supported, falling back to the app's immersive viewport layout when unavailable or denied.
- Added build regression checks for the welcome callout order, fullscreen-on-start event path, fallback, transparent mobile controls, and translucent dialogue readability.

## Magnet range and Blue Ridge visibility correction (2026-10-17)
- Reduced active magnet attraction to exactly one-third of the prior in-source ranges: land 5.2 → 1.73 units, water 5.8 → 1.93 units, and vertical allowance 4.2 → 1.4 units.
- Reduced magnet models to 64% scale, dimmed their aura, and kept them hidden until the player is within 18 units on touch devices or 22 on desktop.
- Moved magnets to peripheral ground-level nooks away from normal mint trails. The Blue Ridge magnet is over 65 units from the hiking trail and is only revealed when the player explores nearby.
- Blue Ridge ramps, junction plates, outcrop rocks, ridge peaks, and snow caps no longer enter the stage distance-culling list. The distant ridge/snow materials disable fog fade, and the background peaks/caps explicitly disable frustum culling so the skyline remains visible throughout the mountain stage.
- Added release assertions for one-third magnet ranges, proximity-based reveal, the Blue Ridge magnet's trail clearance, and non-clipped mountain geometry.

## Dialogue layout correction

- Restored the original opaque cream dialogue card (`rgba(255,254,247,.96)`) and original solid avatar/close/continue button colours. Removed the light outline/shadow treatment that had made dialogue text look wrong.
- In mobile landscape, anchored the dialogue card to the bottom-centre, within the horizontal gap between the movement joystick and jump/talk control. The width scales with the viewport while preserving safe-area spacing and scrollability for longer lines.
- Kept translucent touch controls unchanged.


## UI opacity and magnet visibility restoration (2026-10-17)
- Made all information-bearing UI boxes opaque: HUD surfaces, world hint, clock/weather, minimap panel, toast, welcome and pause cards, stage goals/cards, dialogue, talk prompt, and magnet status. The only deliberately translucent surfaces are the mobile movement and action control overlays.
- Restored magnet model scale to 1.0, raised aura opacity from 0.045 to 0.17, brightened the frame and red/blue poles, enlarged sparkle details, and made the pickup visible whenever its world is active. Off-route placements and one-third attraction range are unchanged.


## Magnet attraction and shadow correction

- Fixed the magnet’s actual movement path, not just its activation state: nearby mints now move toward the player in full 3D and their vertical pull offset persists across bobbing animation frames. Collection distance is checked in world coordinates for all four stages.
- Added an allocation-free magnet-physics helper and build-time simulation tests: a nearby mint moves from 1.96 units away to the player, a mint directly above the player moves vertically, and a mint outside the one-third horizontal range remains unaffected.
- Kept horizontal attraction at the requested one-third range (1.73 units on land, 1.93 underwater) while allowing enough vertical tolerance for floating mints (2.8 units).
- Corrected the shadow projection: apply `updateProjectionMatrix()` after configuring the directional light’s orthographic camera, follow the player with a fixed sun direction, snap the target to shadow texels to reduce shimmering, and use a tighter ±38-unit shadow volume at 1536px mobile / 2048px desktop resolution.
