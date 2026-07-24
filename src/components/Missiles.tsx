import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Mesh } from 'three'
import { Trail } from './Trail'
import { COLORS } from '../game/constants'
import type { IncomingMissile, PlayerMissile } from '../game/types'

const KIND_STYLE = {
  normal: { color: COLORS.enemy, trail: COLORS.enemyTrail, radius: 0.28 },
  mirv: { color: COLORS.mirv, trail: COLORS.mirvTrail, radius: 0.34 },
  smart: { color: COLORS.smart, trail: COLORS.smartTrail, radius: 0.3 },
} as const

export function IncomingView({ m }: { m: IncomingMissile }) {
  const head = useRef<Mesh>(null)
  const style = KIND_STYLE[m.kind]
  useFrame(({ clock }) => {
    if (!head.current) return
    head.current.position.copy(m.pos)
    // Smart bombs pulse so they read as the priority threat.
    if (m.kind === 'smart') {
      const s = 1 + Math.sin(clock.elapsedTime * 12) * 0.25
      head.current.scale.setScalar(s)
    }
  })
  return (
    <group>
      <Trail start={m.start} getEnd={() => m.pos} color={style.trail} />
      <mesh ref={head} position={m.pos}>
        <sphereGeometry args={[style.radius, 16, 16]} />
        <meshStandardMaterial
          color={style.color}
          emissive={style.color}
          emissiveIntensity={2.4}
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
