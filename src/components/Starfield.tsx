import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { BufferGeometry, Float32BufferAttribute, Points } from 'three'
import { quality } from '../game/device'

export function Starfield({ count = quality.starCount }: { count?: number }) {
  const ref = useRef<Points>(null)
  const geom = useMemo(() => {
    const g = new BufferGeometry()
    const pos = new Float32Array(count * 3)
    for (let i = 0; i < count; i++) {
      pos[i * 3 + 0] = (Math.random() - 0.5) * 90
      pos[i * 3 + 1] = Math.random() * 45 - 2
      pos[i * 3 + 2] = -10 - Math.random() * 40
    }
    g.setAttribute('position', new Float32BufferAttribute(pos, 3))
    return g
  }, [count])

  useFrame((_, dt) => {
    if (ref.current) ref.current.rotation.z += dt * 0.005
  })

  return (
    <points ref={ref} geometry={geom}>
      <pointsMaterial size={0.18} sizeAttenuation color="#9fb4ff" transparent opacity={0.8} />
    </points>
  )
}
