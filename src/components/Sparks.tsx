import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import {
  AdditiveBlending,
  BufferGeometry,
  Float32BufferAttribute,
  Points,
  PointsMaterial,
} from 'three'
import { quality } from '../game/device'

const GRAVITY = -14 // units / s², pulls sparks into a ballistic arc
const DRAG = 0.72 // velocity retained per second

// A one-shot burst of embers thrown outward from a detonation. Each spark gets a
// fixed initial velocity at mount; positions are integrated analytically from the
// burst's age, so there is no per-frame state to keep in sync.
export function Sparks({
  count = quality.sparkCount,
  // Fast enough that embers clearly escape the fireball rather than being lost inside it.
  speed = 17,
  life = 1.1,
  // World units: with sizeAttenuation the on-screen size shrinks with distance, and
  // the battlefield camera sits ~40 units back, so these need to be generous.
  size = 0.75,
  color,
  age,
}: {
  count?: number
  speed?: number
  life?: number
  size?: number
  color: string
  age: () => number
}) {
  const points = useRef<Points>(null)

  const { geometry, velocities } = useMemo(() => {
    const vel = new Float32Array(count * 3)
    const pos = new Float32Array(count * 3)
    for (let i = 0; i < count; i++) {
      // Random direction on a sphere, biased upward so the burst reads as a plume.
      const theta = Math.random() * Math.PI * 2
      const phi = Math.acos(2 * Math.random() - 1)
      const s = speed * (0.35 + Math.random() * 0.65)
      vel[i * 3 + 0] = Math.sin(phi) * Math.cos(theta) * s
      vel[i * 3 + 1] = Math.abs(Math.cos(phi)) * s * 0.9 + s * 0.25
      vel[i * 3 + 2] = Math.sin(phi) * Math.sin(theta) * s
    }
    const g = new BufferGeometry()
    g.setAttribute('position', new Float32BufferAttribute(pos, 3))
    return { geometry: g, velocities: vel }
  }, [count, speed])

  useFrame(() => {
    const p = points.current
    if (!p) return
    const t = Math.min(age(), life)
    const attr = p.geometry.getAttribute('position') as Float32BufferAttribute
    // Integrated position under linear drag + gravity.
    const damp = (1 - Math.pow(DRAG, t)) / -Math.log(DRAG)
    for (let i = 0; i < count; i++) {
      attr.setXYZ(
        i,
        velocities[i * 3 + 0] * damp,
        velocities[i * 3 + 1] * damp + 0.5 * GRAVITY * t * t,
        velocities[i * 3 + 2] * damp,
      )
    }
    attr.needsUpdate = true

    const k = Math.max(0, 1 - t / life)
    const mat = p.material as PointsMaterial
    mat.opacity = k * k // fade out, quickest at the end
    mat.size = size * (0.5 + k * 0.5)
  })

  return (
    <points ref={points} geometry={geometry}>
      <pointsMaterial
        color={color}
        size={size}
        sizeAttenuation
        transparent
        opacity={1}
        depthWrite={false}
        blending={AdditiveBlending}
        toneMapped={false}
      />
    </points>
  )
}
