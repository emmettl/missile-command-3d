import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Mesh } from 'three'
import { Trail } from './Trail'
import { COLORS } from '../game/constants'
import type { IncomingMissile, PlayerMissile } from '../game/types'

export function IncomingView({ m }: { m: IncomingMissile }) {
  const head = useRef<Mesh>(null)
  useFrame(() => {
    if (head.current) head.current.position.copy(m.pos)
  })
  return (
    <group>
      <Trail start={m.start} getEnd={() => m.pos} color={COLORS.enemyTrail} />
      <mesh ref={head} position={m.pos}>
        <sphereGeometry args={[0.28, 16, 16]} />
        <meshStandardMaterial
          color={COLORS.enemy}
          emissive={COLORS.enemy}
          emissiveIntensity={2.2}
          toneMapped={false}
        />
      </mesh>
    </group>
  )
}

export function PlayerView({ m }: { m: PlayerMissile }) {
  const head = useRef<Mesh>(null)
  useFrame(() => {
    if (head.current) head.current.position.copy(m.pos)
  })
  return (
    <group>
      <Trail start={m.start} getEnd={() => m.pos} color={COLORS.playerTrail} />
      <mesh ref={head} position={m.pos}>
        <sphereGeometry args={[0.22, 16, 16]} />
        <meshStandardMaterial
          color={COLORS.player}
          emissive={COLORS.player}
          emissiveIntensity={2.6}
          toneMapped={false}
        />
      </mesh>
    </group>
  )
}
