import { useEffect, useMemo, useRef } from 'react'
import { ThreeEvent, useFrame, useThree } from '@react-three/fiber'
import { Fog, Mesh, PerspectiveCamera } from 'three'
import { FIELD, COLORS, SEA } from '../game/constants'
import { quality } from '../game/device'
import { useGameStore } from '../game/useGameStore'
import { stepShake } from '../game/shake'
import { unlockAudio, Sfx } from '../game/audio'
import { CAMERA_FOV, CameraFit, computeCameraFit, framedBox, isFitted } from './cameraFit'
import { Coastline } from './Coastline'
import { GunRig } from './GunRig'
import { BomberView, BombView, Tracers } from './Bombers'
import { SubmarineView } from './Submarine'
import { ReflectiveFloor } from './ReflectiveFloor'
import { GridFloor } from './GridFloor'
import { City } from './City'
import { Battery } from './Battery'
import { Starfield } from './Starfield'
import { IncomingView, PlayerView } from './Missiles'
import { ExplosionView } from './Explosion'
import { ShockwaveView } from './Shockwave'
import { GameLoop } from './GameLoop'

// Seconds for the camera to cover ~63% of a move. The swing out to the offshore view
// is the mode's opening statement, so it wants to be seen happening — but a resize
// mid-game has to feel immediate, and the same easing covers both because a resize
// barely moves the target.
const CAMERA_EASE = 0.75

const EASED = ['distance', 'cameraY', 'lookY', 'yaw', 'centerX', 'fogNear', 'fogFar'] as const

function CameraRig({ fit }: { fit: CameraFit }) {
  const camera = useThree((s) => s.camera)
  // The pose actually on screen, which chases `fit` rather than snapping to it.
  const shown = useRef<CameraFit>({ ...fit })

  useEffect(() => {
    const cam = camera as PerspectiveCamera
    if (cam.isPerspectiveCamera && cam.fov !== CAMERA_FOV) {
      cam.fov = CAMERA_FOV
      cam.updateProjectionMatrix()
    }
  }, [camera])

  useFrame((state, dt) => {
    const t = state.clock.elapsedTime
    const energy = stepShake(dt)
    const s = shown.current

    // Exponential ease, so the swing is smooth and independent of frame rate.
    const k = 1 - Math.exp(-dt / CAMERA_EASE)
    for (const key of EASED) s[key] += (fit[key] - s[key]) * k

    // Continuous slow parallax drift keeps the scene reading as 3D, not a flat picture.
    // Scaled by distance so it stays proportional when the camera pulls back to fit
    // a narrow screen.
    const amp = s.distance / 40
    const driftX = Math.sin(t * 0.13) * 0.9 * amp
    const driftY = Math.cos(t * 0.19) * 0.35 * amp
    const shakeX = energy > 0 ? (Math.random() - 0.5) * energy * amp : 0
    const shakeY = energy > 0 ? (Math.random() - 0.5) * energy * amp : 0

    camera.position.set(
      s.centerX + Math.sin(s.yaw) * s.distance + driftX + shakeX,
      s.cameraY + driftY + shakeY,
      Math.cos(s.yaw) * s.distance,
    )
    camera.lookAt(s.centerX, s.lookY, 0)

    // Fog is eased alongside the pose; snapping it would give the swing a hard edge.
    const fog = state.scene.fog as Fog | null
    if (fog) {
      fog.near = s.fogNear
      fog.far = s.fogFar
    }
  })
  return null
}

// Mobile stand-in for the reflective floor: the reflection pass re-renders the whole
// scene to a texture each frame, which a phone GPU cannot afford.
function PlainFloor({ distance }: { distance: number }) {
  const extent = Math.max(220, distance * 5)
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, -6]}>
      <planeGeometry args={[extent, extent]} />
      <meshStandardMaterial color="#080f1e" metalness={0.4} roughness={0.75} />
    </mesh>
  )
}

// Toggling a mesh in and out of the pointer picture has to name *both* states. Passing
// `raycast={undefined}` for "pickable" does not restore three's default — React removes
// the prop and R3F puts back whatever it was at mount, which for a plane that mounts
// disabled is the disabled function. That is how the strike aim plane came to be
// unpickable everywhere, permanently: it mounts while the interceptor is selected.
const IGNORE_POINTER = () => null
const PICKABLE = Mesh.prototype.raycast

// Both aim planes are made far larger than any frustum can cut out of them. They are
// invisible and write no depth, so size costs nothing, and the alternative is a rim of
// screen where clicking does nothing at all.
const AIM_PLANE_SPAN = 2000

function clamp(n: number, low: number, high: number): number {
  return Math.min(Math.max(n, low), high)
}

// Full-field invisible plane at z = 0 that captures aim/tap input. In an SLBM wave it
// grows to cover the whole theatre, so a warhead can be met anywhere along its arc.
function AimPlane({ active }: { active: boolean }) {
  const fireAt = useGameStore((s) => s.fireAt)
  const soundOn = useGameStore((s) => s.soundOn)
  const mode = useGameStore((s) => s.waveMode)

  // Sized well past anything the camera can frame, because a plane that stops at the
  // edge of the playfield leaves dead screen all round it — and offshore, where the
  // camera is swung round and tilted down, that dead area was most of the picture. The
  // plane catches the click; the aim point is clamped afterwards.
  const { width, height, midX, midY, bounds } = useMemo(() => {
    if (mode === 'classic') {
      const h = FIELD.skyY + 12
      return {
        width: AIM_PLANE_SPAN,
        height: AIM_PLANE_SPAN,
        midX: (FIELD.maxX + FIELD.minX) / 2,
        midY: h / 2 - 2,
        bounds: {
          minX: FIELD.minX - 6,
          maxX: FIELD.maxX + 6,
          minY: FIELD.groundY + 0.3,
          maxY: FIELD.skyY + 6,
        },
      }
    }
    const box = framedBox('slbm')
    return {
      width: AIM_PLANE_SPAN,
      height: AIM_PLANE_SPAN,
      midX: (box.maxX + box.minX) / 2,
      midY: (box.maxY + box.minY) / 2,
      bounds: {
        minX: box.minX,
        maxX: box.maxX,
        minY: FIELD.groundY + 0.3,
        maxY: box.maxY,
      },
    }
  }, [mode])

  const onDown = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation()
    unlockAudio()
    // Anywhere on the plane is a valid click; the shot itself is held to the playfield,
    // so a click low over the water becomes a low intercept rather than nothing at all.
    const x = clamp(e.point.x, bounds.minX, bounds.maxX)
    const y = clamp(e.point.y, bounds.minY, bounds.maxY)
    const fired = fireAt(x, y)
    if (soundOn) (fired ? Sfx.launch : Sfx.empty)()
  }

  return (
    <mesh
      position={[midX, midY, 0]}
      onPointerDown={onDown}
      raycast={active ? PICKABLE : IGNORE_POINTER}
    >
      <planeGeometry args={[width, height]} />
      <meshBasicMaterial transparent opacity={0} depthWrite={false} />
    </mesh>
  )
}

// The other thing you can aim at in an SLBM wave: the sea itself. A strike is thrown at
// a point on the water, so while it is selected the pointer picks the surface instead of
// the vertical engagement plane.
function SeaAimPlane({ active }: { active: boolean }) {
  const fireStrike = useGameStore((s) => s.fireStrike)
  const soundOn = useGameStore((s) => s.soundOn)
  const midX = (SEA.maxX + SEA.minX) / 2

  const onDown = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation()
    unlockAudio()
    // Held to the water the boats actually work in, so a click out towards the horizon
    // still puts the strike somewhere it could do something.
    const x = clamp(e.point.x, SEA.minX - 8, SEA.maxX + 8)
    const z = clamp(e.point.z, -SEA.halfDepth * 1.6, SEA.halfDepth * 1.6)
    const fired = fireStrike(x, z)
    if (soundOn) (fired ? Sfx.launch : Sfx.empty)()
  }

  return (
    <mesh
      rotation={[-Math.PI / 2, 0, 0]}
      position={[midX, 0.05, 0]}
      onPointerDown={onDown}
      raycast={active ? PICKABLE : IGNORE_POINTER}
    >
      {/* Every bit of water the camera can see, not just the band the boats sit in. */}
      <planeGeometry args={[AIM_PLANE_SPAN, AIM_PLANE_SPAN]} />
      <meshBasicMaterial transparent opacity={0} depthWrite={false} />
    </mesh>
  )
}

export function Scene() {
  const cities = useGameStore((s) => s.cities)
  const batteries = useGameStore((s) => s.batteries)
  const incoming = useGameStore((s) => s.incoming)
  const players = useGameStore((s) => s.players)
  const explosions = useGameStore((s) => s.explosions)
  const shockwaves = useGameStore((s) => s.shockwaves)
  const submarines = useGameStore((s) => s.submarines)
  const bombers = useGameStore((s) => s.bombers)
  const bombs = useGameStore((s) => s.bombs)
  const mode = useGameStore((s) => s.waveMode)
  const weapon = useGameStore((s) => s.weapon)

  // Re-fit whenever the viewport changes shape (rotation, resize, browser chrome) — or
  // when the war moves offshore and the camera has to swing round.
  const size = useThree((s) => s.size)
  const fit = useMemo(
    () =>
      computeCameraFit(
        size.height > 0 ? size.width / size.height : 1,
        isFitted(mode) ? mode : 'classic',
      ),
    [size.width, size.height, mode],
  )

  return (
    <>
      <color attach="background" args={[COLORS.sky]} />
      <fog attach="fog" args={[COLORS.sky, fit.fogNear, fit.fogFar]} />

      {mode === 'bombers' ? <GunRig /> : <CameraRig fit={fit} />}
      <ambientLight intensity={0.35} />
      <hemisphereLight args={['#33406a', '#0a0d18', 0.5]} />
      <directionalLight position={[10, 30, 20]} intensity={0.6} />

      <Starfield mode={mode} />
      {quality.reflections ? (
        <ReflectiveFloor distance={fit.distance} />
      ) : (
        <PlainFloor distance={fit.distance} />
      )}
      <GridFloor distance={fit.distance} mode={mode} />
      {mode === 'slbm' && <Coastline />}

      {cities.map((c) => (
        <City key={c.id} city={c} />
      ))}
      {batteries.map((b) => (
        <Battery key={b.id} battery={b} />
      ))}

      {incoming.map((m) => (
        <IncomingView key={m.id} m={m} />
      ))}
      {players.map((m) => (
        <PlayerView key={m.id} m={m} />
      ))}
      {explosions.map((e) => (
        <ExplosionView key={e.id} e={e} />
      ))}
      {shockwaves.map((s) => (
        <ShockwaveView key={s.id} s={s} />
      ))}
      {submarines.map((s) => (
        <SubmarineView key={s.id} sub={s} />
      ))}
      {bombers.map((b) => (
        <BomberView key={b.id} bomber={b} />
      ))}
      {bombs.map((b) => (
        <BombView key={b.id} bomb={b} />
      ))}
      {mode === 'bombers' && <Tracers />}

      {/* In the gun pit the pointer is the gun, so the aim planes stand down entirely. */}
      {mode !== 'bombers' && <AimPlane active={weapon !== 'strike'} />}
      {mode === 'slbm' && <SeaAimPlane active={weapon === 'strike'} />}
      <GameLoop />
    </>
  )
}
