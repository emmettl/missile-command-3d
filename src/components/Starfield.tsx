import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { BufferGeometry, Float32BufferAttribute, Points } from 'three'
import { quality } from '../game/device'
import type { WaveMode } from '../game/types'

// The stars are a backdrop, not a volume you fly through, so they are scattered through
// a box sized to sit behind whatever the camera is framing. Seen from the offshore
// view, the classic box would sit off to one side as a visible clump of points in the
// middle of the ocean — so each mode gets its own.
//
// `baseY` is the one that matters offshore. A star clears the horizon only if it is
// higher than the camera itself, and that camera rides high and looks down at the water
// — so a box starting near ground level scatters stars across the sea in the middle of
// the frame, which is precisely where sky is not.
interface StarBox {
  minX: number
  maxX: number
  minY: number
  maxY: number
  minZ: number
  maxZ: number
}

const BOX: Record<WaveMode, StarBox> = {
  classic: { minX: -45, maxX: 45, minY: -2, maxY: 43, minZ: -50, maxZ: -10 },
  slbm: { minX: -240, maxX: 180, minY: 95, maxY: 245, minZ: -240, maxZ: -10 },
  // In the pit you can look anywhere, so the sky has to be all round rather than a
  // backdrop hung behind one view.
  bombers: { minX: -220, maxX: 220, minY: 25, maxY: 260, minZ: -220, maxZ: 220 },
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
      pos[i * 3 + 0] = box.minX + Math.random() * (box.maxX - box.minX)
      pos[i * 3 + 1] = box.minY + Math.random() * (box.maxY - box.minY)
      pos[i * 3 + 2] = box.minZ + Math.random() * (box.maxZ - box.minZ)
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
