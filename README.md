# クリームソーダうみうし — Fizzy Meadow

A free-roaming 3D plush-friend adventure starring **クリームソーダうみうし**. It is a static browser game made with Three.js and can be hosted on GitHub Pages; it needs no backend or game server.

## Play controls
### Latest polish
The current build uses a locally generated panoramic day/night sky texture with a strong horizon gradient, visible low sun on clear days, and time-aware moon/stars. Current weather appears in the local-time HUD, while the minimap is focused on exploration only. Meadow bubble decorations stay hidden until the Water World; the plush feelers are shorter/narrower with body-coloured lower halves and ivory tops. During the all-Fizz celebration, the character turns toward the camera. The friends-spoken counter resets on entering the Water World.


### Desktop

- **W / A / S / D** or **arrow keys** — move freely around the meadow
- **Space** — jump; keep holding to hop repeatedly on landing. In Water World, tap Space again while airborne for a double jump, then once more for a triple jump
- **Space near a friend** — start or continue their conversation
- **E / Enter** — alternate conversation control; **M** toggles music; **P / Esc** pauses or resumes

Gravity pulls the plush back to the continuous ground automatically. There is no sink control, auto-run, or race timer. The camera keeps its fixed world-space angle as the player moves.

### Phone / tablet

- Drag the circular **MOVE** stick to move in any direction on the ground plane.
- Press and hold the single **JUMP / TALK** button to keep hopping. In Water World, press it again mid-air for a double jump and once more for a triple jump. When a friend is close, tap that same button to talk or continue their dialogue.
- Tap the music note to mute or restore the soundtrack.

## What to explore

- A rounded-rectangular mint plush with a 1.5:1 front-to-back body ratio, knitted colour and bump maps, fine instanced fibers, embroidered dark-green star eyes, broad splayed ivory-tipped head feelers, a round red felt cherry and curved stem, pale rear tail, side stitches, and a scalloped white underside.
- Eight plush friends with individually distinct, non-mint body colours, different details/accessories, names, and multi-line conversations. A first chat awards friendship points.
- Thirty fizzy mint pearls are scattered through the meadow, so the 25-pearl goal leaves room to miss a few. Reaching 25 Fizz pearls triggers a short camera zoom, a happy little dance, and a full-screen transition into the Water World; 30 Seafoam Mints support its 25-mint goal, and 36 Bridge Mints support Bridge World’s 30-mint goal across high stacked timber bridges. The minimap marks every uncollected pearl and every friend you have not spoken to; the player marker shows your current position.
- The unlocked Water World swaps meadow grass, logs, and land hazards for a textured sandy seabed, kelp forests, pastel coral, mottled rocks, rising bubbles, floating marine particles, and shafts of light from the water surface. You can keep freely roaming and chatting with the plush friends there.
- A custom synthesized soundtrack and sound effects generated locally with the Web Audio API. Boing hazards flash, push the player backward, and play a springy sound. Random light-rain and gusty-wind weather brings its own ambient sound; wind nudges the player. The sky gradient and lighting follow the browser device’s local real time. The meadow edge is lined with logs and grass; the ground stays safe beyond it.
- Your supplied references are included at `public/assets/reference-character.png`, `public/assets/references.png`, and `public/assets/reference-plushies.png`.

## Run locally

Requires Node.js 22 or newer. Three.js is imported from jsDelivr at runtime, so the browser must be online to load the 3D engine. The character textures, bump maps, and reference images are bundled in the repository.

```bash
npm ci
npm run dev
npm run check
npm run build
```

The local server prints `http://localhost:5173`. The static production site is generated into `dist/`.

## Deploy to GitHub Pages

1. Create a repository and push these project files to `main` or `master`.
2. Under **Settings → Pages**, select **GitHub Actions** as the source.
3. Push to the branch or run **Build and deploy to GitHub Pages** from the Actions tab.
4. The published URL will appear in the Actions deployment details and the `github-pages` environment.

The workflow at `.github/workflows/deploy.yml` performs syntax checks, builds the static site, and deploys `dist/` using the official GitHub Pages artifact and deploy actions.

## Meadow detail, night sky, and clock

The meadow uses a repeating high-detail grass albedo/bump texture, instanced blades and moss patches, miniature wildflowers, and hundreds of mineral-textured stones/pebbles. Fallen boundary logs now use dedicated bark grain and bump textures with cut-wood end grain; all decoration is instanced where practical for mobile performance.

The sky follows the device's local clock and gets properly dark at night. A procedurally lit moon uses the current UTC date and a standard synodic-month approximation to estimate the real lunar phase and illuminated fraction; moonlight intensity follows that fraction. This estimates phase rather than querying a live astronomy service, and moonrise/position is approximate because the game does not request GPS coordinates. The on-screen time uses a bold Japanese-broadcast-style Gothic numeral treatment and shows the estimated lunar phase/illumination.



## All Fizz finale and Water World

Collect all 25 fizzy pearls to trigger a one-time finale: the player pauses, the camera eases into a close-up, the plush does a small bouncing wiggle-dance, and a full-screen dissolve conceals the environment swap. The game then opens the Water World with textured seafloor, kelp, coral, rocks, bubbles, marine snow, overhead light shafts, and soft bubbling ambience. After the short reveal, free movement and friend conversations resume; the meadow-only obstacles and weather are hidden in the ocean biome.


## Latest update: Seafoam Mints and changing skies

- The plush body now uses a 1.5:1 front-to-back length/width ratio and elongated, flatter feelers. Each friend has a between-the-ears accessory; Momo wears a cherry to match the ‘Twinsies!’ line.
- The meadow sky uses richer time-of-day gradients, a visible daytime sun and glow, slow-moving clouds, and random clear / scattered-cloud / overcast moods. Cloud cover softens the palette and dims direct sunlight. Moon phase and night lighting continue to follow the real date and local clock.
- Collecting 25 Fizz pearls triggers the dance and Water World transition. The ocean has 30 Seafoam Mint collectibles with their own cyan/white swirl design, score reward, sound, HUD counter, and minimap markers.
- Plush friends use separate Water World dialogue. Underwater bubbles rise at varied speeds and drift sideways in gentle looping paths.

## Four-stage progression and weather

- **Meadow:** collect **25 of 30 Fizz pearls** to progress. Wind gusts carry leaves through the grass, sway small plants, play wind ambience, and gently push the character; light rain has visible droplets and its own sound.
- **Water World:** collect **25 of 30 Seafoam Mints** to progress. The mints have a glowing aqua ring and slightly more generous pickup range. Bubbly currents periodically accelerate the bubbles, play a stronger bubbling sound, and nudge the character sideways.
- **Bridge World:** collect **30 of 36 Bridge Mints** across stacked, vertical timber bridges wrapped in ivy. The final jump from Sora’s bridge to the summit deck is now a short 0.2-unit edge gap with a 0.8-unit rise. Mint-hole powerups temporarily flash the cherry red/yellow and make jumps much higher; pickups reappear after a cooldown.
- **World 4 — Blue Ridge Mountain:** collect **35 of 42 Fresh Mints** along a steep switchback hiking route with rock shelves and short ledge jumps. Strong ridge gusts are visible and audible; if the wind catches you on an exposed section, it can push you back down to the mountain base.

The build checks the Meadow and Water literal collectible lists, Bridge and Mountain runtime collectible count guards, the world-four handoff, and the measured final bridge-jump geometry. It fails rather than shipping a stage with too few progression collectibles. A canvas-textured panoramic sky gradient, time-varying palette, cloud field, and sun/moon placement are shared across the world renderer so dawn, day, sunset and night remain visibly different in every stage; the sea has underwater light rays during daytime when the sky is not overcast.

## October 17, 2026 — Sky contrast, weather forces, and progression guards
- Reworked the panoramic sky gradient over a wider vertical range because the chase camera sees near the horizon band; dawn/dusk now add warm haze, midday has a richer dark-to-light blue gradient, overcast clouds are stronger, and nighttime blends into deep indigo. Sun/moon/stars and underwater daylight rays remain tied to local time and cloud cover in all stages.
- Restored a stronger meadow wind with faster leaf gusts, clearer plant sway, wind ambience, and a noticeable but manageable movement push. Water World currents now accelerate bubbles and push the character more forcefully during periodic bubbly surges, with more audible bubble sounds.
- Added runtime object-count guards after collectible creation: 30 Meadow Fizz, 30 Water Seafoam Mints, 36 Bridge Mints, and one additional respawning mint-hole power-up per bridge plus the entrance pickup. Clear thresholds remain 25/25/30. The production build checks that these guards remain present.


### Recent interaction additions
- Friends turn toward the player during conversations; the player also turns to face them.
- Berry can hand over a one-time bonus Fizz Mint through her dialogue.
- A new world waits for a tap on its arrival card before movement resumes.
- Prominent meadow rocks can be pushed with effort; mushrooms yield and spring back because they remain rooted.
- The three biomes now have harmless, wandering wildlife (beetles/centipedes, fish/crabs, and crickets/spiders).
- Bridge rails constrain the player along bridge sides, the bridge stage starts on the first deck, and some pals now wait in nearby grass clearings.

## Latest gameplay tuning — October 17, 2026

- Boing bars and bumpy creatures now launch the character backward much farther. Recoil has a short protected window so holding movement cannot immediately cancel the impact.
- Ambient beetles, centipedes, fish, crabs, crickets, and spiders follow wider, faster roaming paths and animate their movement (including swimming and cricket hops).
- Friend interaction radius is 4.4 world units, balanced between the earlier wide and narrow settings. Friends are solid; if the player overlaps one, a small separation nudge prevents passing through them.
- If Berry's one-time gift satisfies the Meadow mint goal before the last physical pearl is collected, remaining Meadow pearls are cleared as the Water World transition begins.
- Sea currents create moving white foam streaks and rings around the character; jumping off the underwater sand produces a brief outward sand puff.
- The top Bridge World deck is positioned just beyond Sora’s deck: there is a 0.2-unit gap between the deck edges and a 0.8-unit rise. The build computes and checks this geometry. Sora stands on the launch deck. All four worlds have about 1.2× the required mints.


### Fullscreen and recent startup fix

Use the ⛶ button on the welcome screen or in the top-right HUD to enter fullscreen on supported desktop and mobile browsers; use the restore icon to exit. Browsers without the Fullscreen API use an in-app immersive fallback. The underwater particle buffer also uses the proper `new Float32Array(...)` constructor to avoid a runtime startup error.


### Latest interaction and exploration tuning
- Each world carries about 1.2× its clear goal in collectibles: 30 Meadow Fizz (goal 25), 30 Seafoam Mints (goal 25), 36 Bridge Mints (goal 30), and 42 Fresh Mints on Blue Ridge Mountain (goal 35). Extra mints are cleared when the next world loads.
- Water World has a large ribbed, collision-solid scallop shell, 176 moving bubbles, 72 animated surface ripples, and a 170-instance foam field that spreads white streaks throughout an active current.
- Beetles, centipedes, crabs, crickets, and spiders now animate their legs with alternating gait; fish tails beat while they swim. Critters receive a very small wind drift compared with the character.
- The friend interaction radius is 4.4 units. Friends collide with the player and separate gently if approached too closely.
- The uppermost Bridge World deck sits at y=25.85 and z=13.8; Sora’s deck is at y=25.05 and z=19. The build checks the 0.2-unit deck-edge gap and 0.8-unit rise.


## World 4 — Blue Ridge Mountain

Blue Ridge is a fictional, blue-coloured mountain biome, unrelated to any real place. Explore its winding hiking trail, climb sloped stone ramps and ledges, hop between shelves, and collect 35 of the 42 Fresh Mints. Gusts have visible streaks and strong audio; exposed sections can blow the character back down to the base. The production build checks the 42-spawn count and 35-mint progression threshold.

## Latest mobile and progression polish

- Touch movement and jump/talk controls remain visible in landscape orientation on coarse-pointer **or no-hover** touch devices, including wide phones with viewports over 760 CSS pixels.
- Every world-entry card explicitly states the progression goal and total available mints: 25/30 Meadow Fizz, 25/30 Seafoam Mints, 30/36 Bridge Mints, and 35/42 Fresh Mints on Blue Ridge Mountain.
- Four oversized meadow trampolines start a sequence of automatic little bounces when landed on. Press jump while bouncing to launch a massive leap.
- The local-time HUD shows the Japanese month/day format (for example `10月7日`). Weather clouds fade in/out over time rather than appearing all at once.
- Mobile rendering retains texture/model detail and full-resolution soft shadows. Cloud puffs are merged into one mesh per cluster to reduce draw calls, and the 1536px shadow map refreshes at 40 Hz to lower GPU load while the game still renders at display frame rate.

## Water World double/triple jumps and custom stage music

- In Water World, press Jump again while airborne to perform a **double jump**, then press once more for a **triple jump**. Each extra jump emits a little burst of bubbles beneath the plush. The sea has 520 moving, touchable bubbles; touching one pops it with a bubbly sound and it reappears elsewhere after a short pause.
- You can replace the generated fallback soundtrack with your own MP3s. Put these files in `public/assets/` before running `npm run build`:
  - `stage01.mp3` — Fizzy Meadow
  - `stage02.mp3` — Water World
  - `stage03.mp3` — Bridge World
  - `stage04.mp3` — Blue Ridge Mountain

  The build copies `public/assets/` into `dist/assets/`, and the game selects the matching track whenever a world loads. The files are intentionally not included in this project because you will supply your own music. If a track is missing, returns a load error, or cannot provide media data after the load timeout, the original synthesized soundtrack is used as a fallback. If you add MP3s after building, run `npm run build` again before deploying.

## After the fourth world: replay mode

Clearing Blue Ridge Mountain opens the ending screen, promises that more worlds are on the way, and offers a selector for all four stages. Replay mode doubles each mint pool: 60 Meadow Fizz, 60 Seafoam Mints, 72 Bridge Mints, and 84 Fresh Mints. Every selected replay starts its mint counter at zero. Advancing to the next world during a replay reactivates that world's expanded mint pool and resets the counter there as well.
