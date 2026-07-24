import { useEffect } from 'react'
import { ThreeEvent, useFrame, useThree } from '@react-three/fiber'
import { FIELD, COLORS } from '../game/constants'
import { useGameStore } from '../game/useGameStore'
import { stepShake } from '../game/shake'
import { unlockAudio, Sfx } from '../game/audio'
import { Ground } from './Ground'
import { City } from './City'
import { Battery } from './Battery'
import { Starfield } from './Starfield'
import { IncomingView, PlayerView } from './Missiles'
import { ExplosionView } from './Explosion'
import { GameLoop } from './GameLoop'

const BASE_CAM = [0, 12, 36] as const

function CameraRig() {
  const camera = useThree((s) => s.camera)
  useEffect(() => {
    camera.position.set(...BASE_CAM)
    camera.lookAt(0, 10, 0)
  }, [camera])
  useFrame((_, dt) => {
    const energy = stepShake(dt)
    if (energy <= 0) {
      camera.position.set(...BASE_CAM)
    } else {
      camera.position.set(
        BASE_CAM[0] + (Math.random() - 0.5) * energy,
        BASE_CAM[1] + (Math.random() - 0.5) * energy,
        BASE_CAM[2],
      )
    }
    camera.lookAt(0, 10, 0)
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

  return (
    <>
      <color attach="background" args={[COLORS.sky]} />
      <fog attach="fog" args={[COLORS.sky, 45, 80]} />

      <CameraRig />
      <ambientLight intensity={0.35} />
      <hemisphereLight args={['#33406a', '#0a0d18', 0.5]} />
      <directionalLight position={[10, 30, 20]} intensity={0.6} />

      <Starfield />
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

      <AimPlane />
      <GameLoop />
    </>
  )
}
