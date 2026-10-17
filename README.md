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
- Twenty-five fizzy mint pearls are scattered through the meadow. Collecting all 25 Fizz pearls triggers a short camera zoom, a happy little dance, and a full-screen transition into the Water World; collecting all 25 Seafoam Mints then opens Bridge World, where 30 Bridge Mints are spread across high stacked timber bridges. The minimap marks every uncollected pearl and every friend you have not spoken to; the player marker shows your current position.
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
- Collecting all 25 Fizz pearls triggers the dance and Water World transition. The ocean has 25 additional Seafoam Mint collectibles with their own cyan/white swirl design, score reward, sound, HUD counter, and minimap markers.
- Plush friends use separate Water World dialogue. Underwater bubbles rise at varied speeds and drift sideways in gentle looping paths.

## Three-stage progression and weather

- **Meadow:** collect all **25 Fizz pearls**. Wind gusts carry leaves through the grass, sway small plants, play wind ambience, and gently push the character; light rain has visible droplets and its own sound.
- **Water World:** collect all **25 Seafoam Mints**. The mints have a glowing aqua ring and slightly more generous pickup range. Bubbly currents periodically accelerate the bubbles, play a stronger bubbling sound, and nudge the character sideways.
- **Bridge World:** collect all **30 Bridge Mints** across stacked, vertical timber bridges wrapped in ivy. Mint-hole powerups temporarily flash the cherry red/yellow and make jumps much higher; the pickups reappear at their original locations after a cooldown.

The build now checks the Meadow and Water literal collectible lists against their progression thresholds and verifies the Bridge World runtime count guard. It fails rather than shipping a stage with too few progression collectibles. A canvas-textured panoramic sky gradient, time-varying palette, cloud field, and sun/moon placement are shared across the world renderer so dawn, day, sunset and night remain visibly different in every stage; the sea has underwater light rays during daytime when the sky is not overcast.

## October 17, 2026 — Sky contrast, weather forces, and progression guards
- Reworked the panoramic sky gradient over a wider vertical range because the chase camera sees near the horizon band; dawn/dusk now add warm haze, midday has a richer dark-to-light blue gradient, overcast clouds are stronger, and nighttime blends into deep indigo. Sun/moon/stars and underwater daylight rays remain tied to local time and cloud cover in all stages.
- Restored a stronger meadow wind with faster leaf gusts, clearer plant sway, wind ambience, and a noticeable but manageable movement push. Water World currents now accelerate bubbles and push the character more forcefully during periodic bubbly surges, with more audible bubble sounds.
- Added runtime object-count guards after collectible creation: 25 Meadow Fizz, 25 Water Seafoam Mints, 30 Bridge Mints, and one additional respawning mint-hole power-up per bridge plus the entrance pickup. The production build checks that these guards remain present.
