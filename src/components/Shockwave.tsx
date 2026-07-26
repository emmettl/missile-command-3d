import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Mesh } from 'three'
import { COLORS, SHOCKWAVE_DURATION, SHOCKWAVE_MAX_RADIUS } from '../game/constants'
import type { ShockWave } from '../game/types'
import { Sparks } from './Sparks'

// A thin ring lying flat on the ground that expands outward and fades, cast where
// a warhead strikes the surface.
export function ShockwaveView({ s }: { s: ShockWave }) {
  const ring = useRef<Mesh>(null)
  useFrame(() => {
    if (!ring.current) return
    const t = Math.min(1, s.age / SHOCKWAVE_DURATION)
    const r = Math.sqrt(t) * SHOCKWAVE_MAX_RADIUS // fast then easing outward
    ring.current.scale.set(r, r, r)
    const mat = ring.current.material as { opacity: number }
    mat.opacity = (1 - t) * 0.8
  })
  return (
    <group position={s.pos}>
      <mesh ref={ring} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.82, 1, 48]} />
        <meshBasicMaterial color={COLORS.enemy} transparent opacity={0.8} depthWrite={false} />
      </mesh>
      {/* Debris kicked up off the ground by the strike — slower and longer-lived
          than blast embers, so the impact reads as heavier. */}
      <Sparks
        color={COLORS.enemy}
        age={() => s.age}
        count={34}
        speed={11}
        life={SHOCKWAVE_DURATION}
        size={0.85}
      />
    </group>
  )
}
