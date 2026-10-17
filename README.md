# クリームソーダうみうし — Fizzy Meadow

A free-roaming 3D plush-friend adventure starring **クリームソーダうみうし**. It is a static browser game made with Three.js and can be hosted on GitHub Pages; it needs no backend or game server.

## Play controls
### Latest polish
The current build uses a locally generated panoramic day/night sky texture with a strong horizon gradient, visible low sun on clear days, and time-aware moon/stars. Current weather appears in the local-time HUD, while the minimap is focused on exploration only. Meadow bubble decorations stay hidden until the Water World; the plush feelers are shorter/narrower with body-coloured lower halves and ivory tops. During the all-Fizz celebration, the character turns toward the camera. The friends-spoken counter resets on entering the Water World.


### Desktop

- **W / A / S / D** or **arrow keys** — move freely around the meadow
- **Space** — jump; keep holding to hop repeatedly on landing
- **Space near a friend** — start or continue their conversation
- **E / Enter** — alternate conversation control; **M** toggles music; **P / Esc** pauses or resumes

Gravity pulls the plush back to the continuous ground automatically. There is no sink control, auto-run, or race timer. The camera keeps its fixed world-space angle as the player moves.

### Phone / tablet

- Drag the circular **MOVE** stick to move in any direction on the ground plane.
- Press and hold the single **JUMP / TALK** button to keep hopping. When a friend is close, tap that same button to talk or continue their dialogue.
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

## Three-stage progression and weather

- **Meadow:** collect **25 of 30 Fizz pearls** to progress. Wind gusts carry leaves through the grass, sway small plants, play wind ambience, and gently push the character; light rain has visible droplets and its own sound.
- **Water World:** collect **25 of 30 Seafoam Mints** to progress. The mints have a glowing aqua ring and slightly more generous pickup range. Bubbly currents periodically accelerate the bubbles, play a stronger bubbling sound, and nudge the character sideways.
- **Bridge World:** collect **30 of 36 Bridge Mints** across stacked, vertical timber bridges wrapped in ivy. Mint-hole powerups temporarily flash the cherry red/yellow and make jumps much higher; the pickups reappear at their original locations after a cooldown.

The build now checks the Meadow and Water literal collectible lists against their progression thresholds and verifies the Bridge World runtime count guard. It fails rather than shipping a stage with too few progression collectibles. A canvas-textured panoramic sky gradient, time-varying palette, cloud field, and sun/moon placement are shared across the world renderer so dawn, day, sunset and night remain visibly different in every stage; the sea has underwater light rays during daytime when the sky is not overcast.

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
- The top Bridge World deck has been moved close to the second-highest deck, with a vertical gap of 0.7 units; Sora is on the second-highest bridge. Stage goals remain Meadow 25, Water 25, and Bridge 30, with 20% extra mints available in every world.


### Fullscreen and recent startup fix

Use the ⛶ button on the welcome screen or in the top-right HUD to enter fullscreen on supported desktop and mobile browsers; use the restore icon to exit. Browsers without the Fullscreen API use an in-app immersive fallback. The underwater particle buffer also uses the proper `new Float32Array(...)` constructor to avoid a runtime startup error.


### Latest interaction and exploration tuning
- Each world carries about 1.2× its clear goal in collectibles: 30 Meadow Fizz (goal 25), 30 Seafoam Mints (goal 25), and 36 Bridge Mints (goal 30). Extra mints are cleared when the next world loads.
- Water World has a large ribbed, collision-solid scallop shell, 176 moving bubbles, 72 animated surface ripples, and a 170-instance foam field that spreads white streaks throughout an active current.
- Beetles, centipedes, crabs, crickets, and spiders now animate their legs with alternating gait; fish tails beat while they swim. Critters receive a very small wind drift compared with the character.
- The friend interaction radius is 4.4 units. Friends collide with the player and separate gently if approached too closely.
- The uppermost Bridge World deck sits at y=25.75 close to the second-highest deck at y=25.05. Sora is now placed on the second-highest deck, making the intended final jump substantially easier.
