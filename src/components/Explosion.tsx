import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Mesh, PointLight } from 'three'
import { COLORS, EXPLOSION_MAX_RADIUS } from '../game/constants'
import type { Explosion } from '../game/types'

export function ExplosionView({ e }: { e: Explosion }) {
  const mesh = useRef<Mesh>(null)
  const light = useRef<PointLight>(null)
  useFrame(() => {
    const s = Math.max(0.001, e.radius)
    if (mesh.current) {
      mesh.current.scale.setScalar(s)
      const mat = mesh.current.material as any
      // Fade emissive slightly as it collapses so the last frames read as embers.
      mat.emissiveIntensity = 1.6 + (e.radius / EXPLOSION_MAX_RADIUS) * 1.4
    }
    if (light.current) {
      light.current.intensity = 18 * (e.radius / EXPLOSION_MAX_RADIUS)
    }
  })
  return (
    <group position={e.pos}>
      <mesh ref={mesh}>
        <sphereGeometry args={[1, 24, 24]} />
        <meshStandardMaterial
          color={COLORS.explosion}
          emissive={COLORS.explosion}
          emissiveIntensity={2.2}
          toneMapped={false}
        />
      </mesh>
      <pointLight ref={light} color={COLORS.explosion} distance={14} decay={2} intensity={10} />
    </group>
  )
}
