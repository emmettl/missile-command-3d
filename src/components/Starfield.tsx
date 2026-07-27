import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { BufferGeometry, Float32BufferAttribute, Points } from 'three'
import { quality } from '../game/device'
import type { WaveMode } from '../game/types'

// The stars are a backdrop, not a volume you fly through, so they are scattered through
// a box sized to sit behind whatever the camera is framing. Seen from the offshore
// view, the classic box would sit off to one side as a visible clump of points in the
// middle of the ocean — so each mode gets its own.
const BOX: Record<WaveMode, { width: number; height: number; centerX: number; depth: number }> = {
  classic: { width: 90, height: 45, centerX: 0, depth: 40 },
  slbm: { width: 240, height: 100, centerX: -40, depth: 110 },
}

export function Starfield({
  count = quality.starCount,
  mode = 'classic',
}: {
  count?: number
  mode?: WaveMode
}) {
  const ref = useRef<Points>(null)
  const geom = useMemo(() => {
    const box = BOX[mode]
    const g = new BufferGeometry()
    const pos = new Float32Array(count * 3)
    for (let i = 0; i < count; i++) {
      pos[i * 3 + 0] = box.centerX + (Math.random() - 0.5) * box.width
      pos[i * 3 + 1] = Math.random() * box.height - 2
      pos[i * 3 + 2] = -10 - Math.random() * box.depth
    }
    g.setAttribute('position', new Float32BufferAttribute(pos, 3))
    return g
  }, [count, mode])

  useFrame((_, dt) => {
    if (ref.current) ref.current.rotation.z += dt * 0.005
  })

  return (
    <points ref={ref} geometry={geom}>
      <pointsMaterial size={0.18} sizeAttenuation color="#9fb4ff" transparent opacity={0.8} />
    </points>
  )
}
