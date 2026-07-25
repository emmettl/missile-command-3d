import { useEffect } from 'react'
import { ThreeEvent, useFrame, useThree } from '@react-three/fiber'
import { Vector3 } from 'three'
import { FIELD, COLORS } from '../game/constants'
import { useGameStore } from '../game/useGameStore'
import { stepShake } from '../game/shake'
import { unlockAudio, Sfx } from '../game/audio'
import { Ground } from './Ground'
import { GridFloor } from './GridFloor'
import { City } from './City'
import { Battery } from './Battery'
import { Starfield } from './Starfield'
import { IncomingView, PlayerView } from './Missiles'
import { ExplosionView } from './Explosion'
import { ShockwaveView } from './Shockwave'
import { GameLoop } from './GameLoop'

// Pulled back and tilted down a touch so the grid floor reads as depth, while the
// missile spawn line (y = FIELD.skyY) stays just inside the top of frame.
const BASE_CAM = new Vector3(0, 14, 40)
const LOOK = new Vector3(0, 8.5, 0)

function CameraRig() {
  const camera = useThree((s) => s.camera)
  useEffect(() => {
    camera.position.copy(BASE_CAM)
    camera.lookAt(LOOK)
  }, [camera])
  useFrame((state, dt) => {
    const t = state.clock.elapsedTime
    const energy = stepShake(dt)
    // Continuous slow parallax drift keeps the scene reading as 3D, not a flat picture.
    const driftX = Math.sin(t * 0.13) * 0.9
    const driftY = Math.cos(t * 0.19) * 0.35
    const shakeX = energy > 0 ? (Math.random() - 0.5) * energy : 0
    const shakeY = energy > 0 ? (Math.random() - 0.5) * energy : 0
    camera.position.set(BASE_CAM.x + driftX + shakeX, BASE_CAM.y + driftY + shakeY, BASE_CAM.z)
    camera.lookAt(LOOK)
  })
  return null
}

// Full-field invisible plane at z = 0 that captures aim clicks.
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

  return (
    <>
      <color attach="background" args={[COLORS.sky]} />
      <fog attach="fog" args={[COLORS.sky, 70, 165]} />

      <CameraRig />
      <ambientLight intensity={0.35} />
      <hemisphereLight args={['#33406a', '#0a0d18', 0.5]} />
      <directionalLight position={[10, 30, 20]} intensity={0.6} />

      <Starfield />
      <GridFloor />
      <Ground />

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
