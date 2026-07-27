import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { BufferGeometry, Float32BufferAttribute, Vector3 } from 'three'
import { arcPointAt } from '../game/slbm'
import type { Arc } from '../game/types'

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

// A straight trail is a lie about a missile that flew a parabola — it would cut the
// chord across its own arc. This one is the arc: the whole flight path is known the
// moment the missile launches, so the polyline is built once at launch and simply
// revealed as far as the missile has travelled.
const ARC_SEGMENTS = 40

export function ArcTrail({
  start,
  target,
  arc,
  color,
}: {
  start: Vector3
  target: Vector3
  arc: Arc
  color: string
}) {
  const geom = useMemo(() => {
    const points: number[] = []
    const p = new Vector3()
    for (let i = 0; i <= ARC_SEGMENTS; i++) {
      arcPointAt(start, target, arc.apex, i / ARC_SEGMENTS, p)
      points.push(p.x, p.y, p.z)
    }
    const g = new BufferGeometry()
    g.setAttribute('position', new Float32BufferAttribute(points, 3))
    g.setDrawRange(0, 2)
    return g
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [start, target, arc.apex])

  useFrame(() => {
    const u = Math.min(1, Math.max(0, arc.elapsed / arc.duration))
    geom.setDrawRange(0, Math.max(2, Math.min(ARC_SEGMENTS + 1, Math.floor(u * ARC_SEGMENTS) + 2)))
  })

  return (
    // eslint-disable-next-line react/no-unknown-property
    <line>
      <primitive object={geom} attach="geometry" />
      <lineBasicMaterial color={color} transparent opacity={0.5} />
    </line>
  )
}
