# Missile Command 3D

A 3D take on the arcade classic, built with **React Three Fiber** / **Three.js**.
Defend six cities from incoming warheads by detonating counter-missiles in their path.

> **Deploying:** pushes to `main` publish to GitHub Pages via
> [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml). It needs the repo to be
> **public** (Pages on private repos requires a paid plan) and **Settings → Pages → Source**
> set to **GitHub Actions**. The build is served from a subpath, handled by the `BASE_PATH`
> env var the workflow passes to Vite.

## Play

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
- The missile flies to the click point and detonates into an expanding blast.
- Any incoming warhead caught in a blast is destroyed — blasts chain-react.
- Watch for **MIRVs** (orange, wave 2+) that split into several warheads, and **smart bombs**
  (magenta, wave 3+) that dodge your blasts and must be hit directly.
- Protect your cities. Batteries reload each wave; unused ammo and surviving cities score bonuses.
- Every 3,000 points earns a **reserve city** that rebuilds a destroyed one at the next wave.
- The game ends when all cities — or all batteries — are gone.

## Tech

- **React 19 + TypeScript 7**, bundled with **Vite 8** (Rolldown)
- **@react-three/fiber 9** + **@react-three/drei 10** over **three.js**
- **zustand 5** for game state; a single `useFrame` loop (`components/GameLoop.tsx`) runs the simulation
- **Bloom** post-processing (`@react-three/postprocessing`) makes every emissive element glow
- Procedural **WebAudio** sound (no audio assets); 8-bit title set in **Press Start 2P**,
  self-hosted (`src/fonts/`, SIL OFL) so the page makes no third-party requests
- Intro globe outlines the **real Earth** — Natural Earth coastlines (`world-atlas`) projected
  onto the sphere as glowing lines; the defended city is pinned to actual land
- **oxlint** for linting, **vitest** for the game-logic tests — both gated in CI

## Structure

```
src/
  game/        constants, types, zustand store, incoming (MIRV/dodge), audio, shake
  components/   IntroScene (globe dive), Scene, GameLoop, GridFloor, ReflectiveFloor,
                City, Battery, Missiles, Explosion, Shockwave, Starfield, Trail
  ui/           HUD, IntroOverlay, Overlay, GameBanners (wave/bonus/flash)
```

## Architecture note

Fast-moving entities (missiles, explosions) store a mutable `THREE.Vector3` position
that `GameLoop` advances every frame **in place**. React only re-renders the entity
lists when entities are *added or removed* — movement never triggers a re-render.
