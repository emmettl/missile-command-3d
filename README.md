# Missile Command 3D

A 3D take on the arcade classic, built with **React Three Fiber** / **Three.js**.
Defend six cities from incoming warheads by detonating counter-missiles in their path.

## Play

```bash
npm install
npm run dev
```

Open http://localhost:5173.

## How to play

- **Click anywhere** to fire a counter-missile from your nearest battery.
- The missile flies to the click point and detonates into an expanding blast.
- Any incoming warhead caught in a blast is destroyed — blasts chain-react.
- Protect your cities. Batteries reload each wave; unused ammo and surviving cities score bonuses.
- The game ends when all cities — or all batteries — are gone.

## Tech

- **React 18 + TypeScript**, bundled with **Vite**
- **@react-three/fiber** + **@react-three/drei** over **three.js**
- **zustand** for game state; a single `useFrame` loop (`components/GameLoop.tsx`) runs the simulation
- Procedural **WebAudio** sound (no audio assets)

## Structure

```
src/
  game/        constants, types, zustand store, audio engine
  components/   Scene, GameLoop, Ground, City, Battery, Missiles, Explosion, Starfield, Trail
  ui/           HUD, Overlay (menu / wave-clear / game-over)
```

## Architecture note

Fast-moving entities (missiles, explosions) store a mutable `THREE.Vector3` position
that `GameLoop` advances every frame **in place**. React only re-renders the entity
lists when entities are *added or removed* — movement never triggers a re-render.
