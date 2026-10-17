# クリームソーダうみうし — Fizzy Meadow

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

## Build locally

Requires Node.js 22 or newer. Three.js is loaded from jsDelivr at runtime, so the browser needs an internet connection to load the engine.

```bash
npm ci
npm run dev
npm run check
npm run build
```

The development server prints `http://localhost:5173`. The static site is built into `dist/`.

The build has regression checks for the standard and replay mint counts, underwater bubble count and turtle/triple-jump systems, adaptive render scale and LOD culling, the final Bridge World jump, Blue Ridge ridge collision, supported safe friend placement, and continuous mountain ramps across five lanes and all eight segments. It checks that ramp height changes stay below 0.15 world units per sampled step; the current maximum is 0.141.

## Deploy to GitHub Pages

1. Push this project to a GitHub repository on `main` or `master`.
2. Open **Settings → Pages** and choose **GitHub Actions** as the source.
3. Push to the branch or run the **Build and deploy to GitHub Pages** workflow manually.
4. The deployment URL appears in the Actions run and `github-pages` environment.

The workflow in `.github/workflows/deploy.yml` checks JavaScript syntax, builds the site, and deploys `dist/`.
