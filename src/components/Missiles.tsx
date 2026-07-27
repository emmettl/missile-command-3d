import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Mesh } from 'three'
import { ArcTrail, Trail } from './Trail'
import { COLORS } from '../game/constants'
import type { IncomingMissile, PlayerMissile } from '../game/types'

const KIND_STYLE = {
  normal: { color: COLORS.enemy, trail: COLORS.enemyTrail, radius: 0.28 },
  mirv: { color: COLORS.mirv, trail: COLORS.mirvTrail, radius: 0.34 },
  smart: { color: COLORS.smart, trail: COLORS.smartTrail, radius: 0.3 },
  // Sea-launched warheads run hotter and bigger — they are the only thing in the sky
  // during an SLBM wave, and they have to read from right across the ocean.
  slbm: { color: COLORS.enemy, trail: COLORS.enemyTrail, radius: 0.36 },
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
      {m.arc ? (
        <ArcTrail start={m.start} target={m.target} arc={m.arc} color={style.trail} />
      ) : (
        <Trail start={m.start} getEnd={() => m.pos} color={style.trail} />
      )}
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

const WEAPON_STYLE = {
  interceptor: { color: COLORS.player, trail: COLORS.playerTrail, radius: 0.22 },
  flak: { color: COLORS.flak, trail: COLORS.flak, radius: 0.26 },
  strike: { color: COLORS.strike, trail: COLORS.strike, radius: 0.3 },
} as const

export function PlayerView({ m }: { m: PlayerMissile }) {
  const head = useRef<Mesh>(null)
  const style = WEAPON_STYLE[m.weapon]
  useFrame(() => {
    if (head.current) head.current.position.copy(m.pos)
  })
  return (
    <group>
      {m.arc ? (
        <ArcTrail start={m.start} target={m.target} arc={m.arc} color={style.trail} />
      ) : (
        <Trail start={m.start} getEnd={() => m.pos} color={style.trail} />
      )}
      <mesh ref={head} position={m.pos}>
        <sphereGeometry args={[style.radius, 16, 16]} />
        <meshStandardMaterial
          color={style.color}
          emissive={style.color}
          emissiveIntensity={2.6}
          toneMapped={false}
        />
      </mesh>
    </group>
  )
}
