import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { BufferGeometry, Float32BufferAttribute, Vector3 } from 'three'

// A 2-point line from `start` to a live `getEnd()` position, updated every frame
// without re-allocating geometry (cheap enough for dozens of concurrent trails).
export function Trail({
  start,
  getEnd,
  color,
}: {
  start: Vector3
  getEnd: () => Vector3
  color: string
}) {
  const geom = useMemo(() => {
    const g = new BufferGeometry()
    g.setAttribute(
      'position',
      new Float32BufferAttribute([start.x, start.y, start.z, start.x, start.y, start.z], 3),
    )
    return g
  }, [start])

  const ref = useRef<BufferGeometry>(geom)

  useFrame(() => {
    const end = getEnd()
    const attr = ref.current.getAttribute('position') as Float32BufferAttribute
    attr.setXYZ(0, start.x, start.y, start.z)
    attr.setXYZ(1, end.x, end.y, end.z)
    attr.needsUpdate = true
  })

  return (
    // eslint-disable-next-line react/no-unknown-property
    <line>
      <primitive object={geom} ref={ref} attach="geometry" />
      <lineBasicMaterial color={color} transparent opacity={0.55} />
    </line>
  )
}
