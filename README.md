# Missile Command 3D

A 3D take on the arcade classic, built with **React Three Fiber** / **Three.js**.
Defend six cities from incoming warheads by detonating counter-missiles in their path.

### ▶ [Play it here](https://emmettl.github.io/missile-command-3d/)

## Running it locally

```bash
npm install
npm run dev
```

Open http://localhost:5173.

```bash
npm run lint     # oxlint
npm test         # vitest (game logic)
npm run build    # type-check + production build
```

## How to play

- **Click anywhere** to fire a counter-missile from your nearest battery.
- Press **START** on the globe intro — the camera dives into your city and the battle begins.
  Leave it alone and the globe keeps turning under a nuclear exchange tracing great circles
  between real cities; a finished game returns here on its own.
- The missile flies to the click point and detonates into an expanding blast.
- Any incoming warhead caught in a blast is destroyed — blasts chain-react.
- Watch for **MIRVs** (orange, wave 2+) that split into several warheads, and **smart bombs**
  (magenta, wave 3+) that dodge your blasts and must be hit directly.
- Protect your cities. Batteries reload each wave; unused ammo and surviving cities score bonuses.

### SLBM ATTACK

Every third wave from the third, the war moves offshore and the camera swings round to an
oblique view of the ocean — the coast compressed against the right of the screen, open
water receding away to the left.

- The tail of the wave before carries a red **SLBM ATTACK INCOMING** warning, so the mode
  change is something you see coming rather than something that happens to you.
- The water is charted: a **vector coastline** with depth contours and islands, generated
  procedurally but deterministically (`game/coastline.ts`), so the shore is in the same
  place every wave and every session. Land is filled, sea keeps the grid.
- Missile submarines hold station out at sea, hidden except for a **sonar return** on the
  water. They surface to fire, launching warheads on long, high **ballistic arcs**.
- A surfaced boat is the only killable one, and only for the few seconds it is up.
- **1 INTERCEPT** — your counter-missile lobs out here, so you have to aim where the
  warhead is *going*, not where it is.
- **2 FLAK** — a burst that hangs in the sky for a few seconds killing whatever flies into
  it. Good for fencing off a corridor; smart bombs steer around it.
- **3 STRIKE** — thrown at a point on the water rather than the sky. Sinks a surfaced boat,
  and takes the rest of its salvo out of the wave with it.

The bar sits at the edge of vision while the fight is in the middle of the screen, so a
weapon you have never fired keeps advertising itself, and the moment a boat breaks the
surface the bar says so — the one time a strike is worth anything.
- Every 3,000 points earns a **reserve city** that rebuilds a destroyed one at the next wave.
- The game ends when all cities — or all batteries — are gone.

## Tech

- **React 19 + TypeScript 7**, bundled with **Vite 8** (Rolldown)
- **@react-three/fiber 9** + **@react-three/drei 10** over **three.js**
- **zustand 5** for game state; a single `useFrame` loop (`components/GameLoop.tsx`) runs the simulation
- **Bloom** post-processing (`@react-three/postprocessing`) makes every emissive element glow
- Procedural **WebAudio** sound (no audio assets); 8-bit title set in **Press Start 2P**,
  self-hosted (`src/fonts/`, SIL OFL) so the page makes no third-party requests — shipped
  twice, as `.woff2` for the stylesheet and `.woff` for the in-scene text, because troika
  (behind drei's `<Text>`) converts wOFF but throws on wOF2, and left to itself would
  fetch a font from a CDN on every play
- Intro globe outlines the **real Earth** — Natural Earth coastlines (`world-atlas`) projected
  onto the sphere as glowing lines; the defended city is pinned to actual land
- **oxlint** for linting, **vitest** for the game-logic tests — both gated in CI
- Plays on phones: the camera distance is derived from the viewport so the whole
  battlefield fits any aspect ratio, and rendering cost (reflections, particle counts)
  scales down on touch devices
- Frame size is capped against a pixel budget (`game/renderScale.ts`) rather than taken
  from `devicePixelRatio`: fill cost grows with window area *and* the square of the
  pixel ratio, so a maximised window on a dense laptop panel would otherwise ask for
  four times the frame integrated graphics can fill. The ratio is re-derived whenever
  the window resizes or changes display
- That budget is only an opening guess at the GPU, so measured frame rate has the last
  word: `components/AdaptiveRenderScale.tsx` (drei's `PerformanceMonitor`) walks the
  ratio down towards a 0.6 floor on a machine that drops frames, or back up to the
  display's native ratio on one that never needed the help

## Structure

```
src/
  game/        constants, types, zustand store, incoming (MIRV/dodge), slbm (arcs/subs),
               renderScale, audio, shake
  components/   IntroScene (globe dive), Scene, GameLoop, GridFloor, ReflectiveFloor,
                City, Battery, Submarine, Missiles, Explosion, Shockwave, Starfield, Trail
  ui/           HUD, WeaponBar, IntroOverlay, Overlay, GameBanners (wave/bonus/flash)
```

## Architecture note

Fast-moving entities (missiles, explosions) store a mutable `THREE.Vector3` position
that `GameLoop` advances every frame **in place**. React only re-renders the entity
lists when entities are *added or removed* — movement never triggers a re-render.

## Deployment

Pushes to `main` publish to GitHub Pages via
[`.github/workflows/deploy.yml`](.github/workflows/deploy.yml), alongside the CI workflow
(lint · type-check · test · build). The site is served from a `/<repo>/` subpath, so the
workflow passes `BASE_PATH` to Vite; local dev and previews stay at the root.
