import { useEffect, useMemo } from 'react'
import { ThreeEvent, useFrame, useThree } from '@react-three/fiber'
import { PerspectiveCamera } from 'three'
import { FIELD, COLORS } from '../game/constants'
import { quality } from '../game/device'
import { useGameStore } from '../game/useGameStore'
import { stepShake } from '../game/shake'
import { unlockAudio, Sfx } from '../game/audio'
import { CAMERA_FOV, CameraFit, computeCameraFit } from './cameraFit'
import { ReflectiveFloor } from './ReflectiveFloor'
import { GridFloor } from './GridFloor'
import { City } from './City'
import { Battery } from './Battery'
import { Starfield } from './Starfield'
import { IncomingView, PlayerView } from './Missiles'
import { ExplosionView } from './Explosion'
import { ShockwaveView } from './Shockwave'
import { GameLoop } from './GameLoop'

function CameraRig({ fit }: { fit: CameraFit }) {
  const camera = useThree((s) => s.camera)

  useEffect(() => {
    const cam = camera as PerspectiveCamera
    if (cam.isPerspectiveCamera && cam.fov !== CAMERA_FOV) {
      cam.fov = CAMERA_FOV
      cam.updateProjectionMatrix()
    }
    camera.position.set(0, fit.cameraY, fit.distance)
    camera.lookAt(0, fit.lookY, 0)
  }, [camera, fit])

  useFrame((state, dt) => {
    const t = state.clock.elapsedTime
    const energy = stepShake(dt)
    // Continuous slow parallax drift keeps the scene reading as 3D, not a flat picture.
    // Scaled by distance so it stays proportional when the camera pulls back to fit
    // a narrow screen.
    const amp = fit.distance / 40
    const driftX = Math.sin(t * 0.13) * 0.9 * amp
    const driftY = Math.cos(t * 0.19) * 0.35 * amp
    const shakeX = energy > 0 ? (Math.random() - 0.5) * energy * amp : 0
    const shakeY = energy > 0 ? (Math.random() - 0.5) * energy * amp : 0
    camera.position.set(driftX + shakeX, fit.cameraY + driftY + shakeY, fit.distance)
    camera.lookAt(0, fit.lookY, 0)
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

// Full-field invisible plane at z = 0 that captures aim/tap input.
function AimPlane() {
  const fireAt = useGameStore((s) => s.fireAt)
  const soundOn = useGameStore((s) => s.soundOn)
  const width = FIELD.maxX - FIELD.minX + 20
  const height = FIELD.skyY + 12
  const midX = (FIELD.maxX + FIELD.minX) / 2

  const onDown = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation()
    unlockAudio()
    const fired = fireAt(e.point.x, e.point.y)
    if (soundOn) (fired ? Sfx.launch : Sfx.empty)()
  }

  return (
    <mesh position={[midX, height / 2 - 2, 0]} onPointerDown={onDown}>
      <planeGeometry args={[width, height]} />
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

  // Re-fit whenever the viewport changes shape (rotation, resize, browser chrome).
  const size = useThree((s) => s.size)
  const fit = useMemo(
    () => computeCameraFit(size.height > 0 ? size.width / size.height : 1),
    [size.width, size.height],
  )

  return (
    <>
      <color attach="background" args={[COLORS.sky]} />
      <fog attach="fog" args={[COLORS.sky, fit.fogNear, fit.fogFar]} />

      <CameraRig fit={fit} />
      <ambientLight intensity={0.35} />
      <hemisphereLight args={['#33406a', '#0a0d18', 0.5]} />
      <directionalLight position={[10, 30, 20]} intensity={0.6} />

      <Starfield />
      {quality.reflections ? (
        <ReflectiveFloor distance={fit.distance} />
      ) : (
        <PlainFloor distance={fit.distance} />
      )}
      <GridFloor distance={fit.distance} />

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

      <AimPlane />
      <GameLoop />
    </>
  )
}
