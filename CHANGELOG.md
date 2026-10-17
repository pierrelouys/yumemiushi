# Changelog

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
