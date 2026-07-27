import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Group,
  LineBasicMaterial,
  Mesh,
  MeshBasicMaterial,
  Vector3,
} from 'three'
import { COLORS } from '../game/constants'
import { quality } from '../game/device'
import {
  ARC_SEGMENTS,
  type Exchange,
  arcPoint,
  inFlight,
  newExchange,
  stepExchange,
} from './globeArcs'

// Warheads crossing the globe on the attract screen. Each flight owns a line whose
// vertices are rewritten as it goes, a head, and an impact flash — all preallocated,
// because these recycle forever and the menu should cost nothing to sit on.

const FLIGHTS = quality.reflections ? 7 : 4 // fewer on phones, same as everything else

const _p = new Vector3()

interface Flight {
  ex: Exchange
  geometry: BufferGeometry
  positions: Float32Array
  line: LineBasicMaterial
  head: MeshBasicMaterial
  flash: MeshBasicMaterial
}

export function GlobeExchange({ radius }: { radius: number }) {
  const heads = useRef<(Group | null)[]>([])
  const flashes = useRef<(Mesh | null)[]>([])

  const flights = useMemo<Flight[]>(
    () =>
      Array.from({ length: FLIGHTS }, () => {
        const positions = new Float32Array((ARC_SEGMENTS + 1) * 3)
        const geometry = new BufferGeometry()
        geometry.setAttribute('position', new BufferAttribute(positions, 3))
        geometry.setDrawRange(0, 0)
        return {
          ex: newExchange(),
          geometry,
          positions,
          line: new LineBasicMaterial({
            color: COLORS.enemy,
            transparent: true,
            opacity: 0.85,
            depthWrite: false,
          }),
          head: new MeshBasicMaterial({ color: COLORS.explosion, transparent: true }),
          flash: new MeshBasicMaterial({
            color: COLORS.explosion,
            transparent: true,
            opacity: 0,
            blending: AdditiveBlending,
            depthWrite: false,
          }),
        }
      }),
    [],
  )

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05)
    for (let i = 0; i < flights.length; i++) {
      const f = flights[i]
      stepExchange(f.ex, dt)
      const head = heads.current[i]
      const flash = flashes.current[i]

      if (inFlight(f.ex)) {
        // Rewrite the flown portion of the trail. The whole path is known, so this is
        // a redraw rather than a history of where the head has been.
        const drawn = Math.max(2, Math.ceil(f.ex.progress * ARC_SEGMENTS) + 1)
        for (let s = 0; s < drawn; s++) {
          const u = Math.min(f.ex.progress, s / ARC_SEGMENTS)
          arcPoint(f.ex.from, f.ex.to, u, radius, _p)
          f.positions[s * 3] = _p.x
          f.positions[s * 3 + 1] = _p.y
          f.positions[s * 3 + 2] = _p.z
        }
        f.geometry.setDrawRange(0, drawn)
        f.geometry.attributes.position.needsUpdate = true
        f.line.opacity = 0.85

        arcPoint(f.ex.from, f.ex.to, f.ex.progress, radius, _p)
        if (head) {
          head.position.copy(_p)
          head.visible = true
        }
      } else if (head) {
        head.visible = false
      }

      if (f.ex.flash > 0) {
        // Trail burns off behind the impact rather than vanishing with it.
        f.line.opacity = 0.85 * (f.ex.flash / 1.1)
        if (flash) {
          arcPoint(f.ex.from, f.ex.to, 1, radius, _p)
          flash.position.copy(_p)
          flash.visible = true
          // Small: a strike on a whole planet, not a blot across a continent.
          const t = 1 - f.ex.flash / 1.1
          flash.scale.setScalar((0.06 + t * 0.26) * (radius / 6))
          f.flash.opacity = (1 - t) ** 1.6 * 0.7
        }
      } else {
        if (flash) flash.visible = false
        if (!inFlight(f.ex)) f.geometry.setDrawRange(0, 0)
      }
    }
  })

  return (
    <group>
      {flights.map((f, i) => (
        <group key={i}>
          {/* eslint-disable-next-line react/no-unknown-property */}
          <line>
            <primitive object={f.geometry} attach="geometry" />
            <primitive object={f.line} attach="material" />
          </line>
          <group ref={(g) => void (heads.current[i] = g)} visible={false}>
            <mesh>
              <sphereGeometry args={[0.085, 10, 10]} />
              <primitive object={f.head} attach="material" />
            </mesh>
          </group>
          <mesh ref={(m) => void (flashes.current[i] = m)} visible={false}>
            <sphereGeometry args={[1, 12, 12]} />
            <primitive object={f.flash} attach="material" />
          </mesh>
        </group>
      ))}
    </group>
  )
}
