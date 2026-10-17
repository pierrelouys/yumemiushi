# Changelog

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
