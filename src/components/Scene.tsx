import { useEffect, useMemo, useRef } from 'react'
import { ThreeEvent, useFrame, useThree } from '@react-three/fiber'
import { Fog, PerspectiveCamera } from 'three'
import { FIELD, COLORS, SEA } from '../game/constants'
import { quality } from '../game/device'
import { useGameStore } from '../game/useGameStore'
import { stepShake } from '../game/shake'
import { unlockAudio, Sfx } from '../game/audio'
import { CAMERA_FOV, CameraFit, computeCameraFit, framedBox } from './cameraFit'
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

const IGNORE_POINTER = () => null

// Full-field invisible plane at z = 0 that captures aim/tap input. In an SLBM wave it
// grows to cover the whole theatre, so a warhead can be met anywhere along its arc.
function AimPlane({ active }: { active: boolean }) {
  const fireAt = useGameStore((s) => s.fireAt)
  const soundOn = useGameStore((s) => s.soundOn)
  const mode = useGameStore((s) => s.waveMode)

  const { width, height, midX, midY } = useMemo(() => {
    if (mode === 'classic') {
      const h = FIELD.skyY + 12
      return {
        width: FIELD.maxX - FIELD.minX + 20,
        height: h,
        midX: (FIELD.maxX + FIELD.minX) / 2,
        midY: h / 2 - 2,
      }
    }
    const box = framedBox('slbm')
    return {
      width: box.maxX - box.minX,
      height: box.maxY - box.minY,
      midX: (box.maxX + box.minX) / 2,
      midY: (box.maxY + box.minY) / 2,
    }
  }, [mode])

  const onDown = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation()
    unlockAudio()
    const fired = fireAt(e.point.x, e.point.y)
    if (soundOn) (fired ? Sfx.launch : Sfx.empty)()
  }

  return (
    <mesh
      position={[midX, midY, 0]}
      onPointerDown={onDown}
      raycast={active ? undefined : IGNORE_POINTER}
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
  const width = SEA.maxX - SEA.minX + 40
  const depth = SEA.halfDepth * 4
  const midX = (SEA.maxX + SEA.minX) / 2

  const onDown = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation()
    unlockAudio()
    const fired = fireStrike(e.point.x, e.point.z)
    if (soundOn) (fired ? Sfx.launch : Sfx.empty)()
  }

  return (
    <mesh
      rotation={[-Math.PI / 2, 0, 0]}
      position={[midX, 0.05, 0]}
      onPointerDown={onDown}
      raycast={active ? undefined : IGNORE_POINTER}
    >
      <planeGeometry args={[width, depth]} />
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
  const mode = useGameStore((s) => s.waveMode)
  const weapon = useGameStore((s) => s.weapon)

  // Re-fit whenever the viewport changes shape (rotation, resize, browser chrome) — or
  // when the war moves offshore and the camera has to swing round.
  const size = useThree((s) => s.size)
  const fit = useMemo(
    () => computeCameraFit(size.height > 0 ? size.width / size.height : 1, mode),
    [size.width, size.height, mode],
  )

  return (
    <>
      <color attach="background" args={[COLORS.sky]} />
      <fog attach="fog" args={[COLORS.sky, fit.fogNear, fit.fogFar]} />

      <CameraRig fit={fit} />
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

      <AimPlane active={weapon !== 'strike'} />
      {mode === 'slbm' && <SeaAimPlane active={weapon === 'strike'} />}
      <GameLoop />
    </>
  )
}
