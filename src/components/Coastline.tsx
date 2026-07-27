import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import {
  BufferAttribute,
  BufferGeometry,
  Float32BufferAttribute,
  LineBasicMaterial,
  MeshBasicMaterial,
} from 'three'
import { COLORS } from '../game/constants'
import {
  type CoastPoint,
  coastPath,
  contourPaths,
  islandPaths,
  landStrip,
} from '../game/coastline'

// The shore, the depth contours and the islands, drawn as a chart would draw them.
//
// The paths are deterministic and never change, so geometry and materials are built once
// for the life of the page rather than per wave: an SLBM wave every third wave would
// otherwise leave a trail of orphaned buffers behind it, and — the reason this is
// materials too and not just geometry — the Scene re-renders every time a missile is
// added or removed. Anything this component owned per render would be reset by that,
// several times a second, in the middle of the fade.

const SEA_LEVEL = 0.08 // clear of the grid at y = 0.02, and of the water itself

// Contours fade with depth, so the chart reads as stepping away into deep water.
const CONTOUR_OPACITY = [0.26, 0.17, 0.1]
const SHORE_OPACITY = 0.9
const ISLAND_OPACITY = 0.62
const FADE_IN = 1.1 // seconds, roughly the length of the camera's swing

function lineGeometry(points: CoastPoint[]): BufferGeometry {
  const flat: number[] = []
  for (const p of points) flat.push(p.x, SEA_LEVEL, p.z)
  const g = new BufferGeometry()
  g.setAttribute('position', new Float32BufferAttribute(flat, 3))
  return g
}

interface Chart {
  geometry: BufferGeometry
  material: LineBasicMaterial
  /** Opacity once fully drawn in. */
  opacity: number
}

let cached: Chart[] | null = null

function chart(): Chart[] {
  if (cached) return cached
  const make = (points: CoastPoint[], color: string, opacity: number, depthWrite = true): Chart => ({
    geometry: lineGeometry(points),
    material: new LineBasicMaterial({ color, transparent: true, opacity: 0, depthWrite }),
    opacity,
  })
  cached = [
    make(coastPath(), COLORS.coast, SHORE_OPACITY),
    ...contourPaths().map((p, i) =>
      make(p, COLORS.contour, CONTOUR_OPACITY[i] ?? 0.1, false),
    ),
    ...islandPaths().map((p) => make(p, COLORS.coast, ISLAND_OPACITY)),
  ]
  return cached
}

// The land itself: dark, so the grid reads as water and stops at the shore. Sits just
// under the outline and just over the grid.
const LAND_Y = 0.05
const LAND_OPACITY = 0.92

let landCache: { geometry: BufferGeometry; material: MeshBasicMaterial } | null = null

function land() {
  if (!landCache) {
    const geometry = new BufferGeometry()
    const verts = landStrip()
    for (let i = 1; i < verts.length; i += 3) verts[i] = LAND_Y
    geometry.setAttribute('position', new BufferAttribute(verts, 3))
    // Strip order: shore, inland, shore, inland… so consecutive triples already wind
    // into a continuous band.
    const count = verts.length / 3
    const index: number[] = []
    for (let i = 0; i + 3 < count; i += 2) {
      index.push(i, i + 1, i + 2, i + 1, i + 3, i + 2)
    }
    geometry.setIndex(index)
    landCache = {
      geometry,
      material: new MeshBasicMaterial({
        color: COLORS.land,
        transparent: true,
        opacity: 0,
        depthWrite: false,
      }),
    }
  }
  return landCache
}

export function Coastline() {
  const parts = chart()
  const { geometry: landGeometry, material: landMaterial } = land()
  const age = useRef(0)

  // Drawn in as the camera comes round, rather than snapping into existence under it.
  // Opacity is written every frame: the fade owns it outright, so nothing else can be
  // left holding a stale value.
  useFrame((_, dt) => {
    age.current = Math.min(FADE_IN, age.current + dt)
    const t = age.current / FADE_IN
    for (const part of parts) part.material.opacity = t * part.opacity
    landMaterial.opacity = t * LAND_OPACITY
  })

  return (
    <group>
      <mesh>
        <primitive object={landGeometry} attach="geometry" />
        <primitive object={landMaterial} attach="material" />
      </mesh>
      {parts.map((part, i) => (
        // eslint-disable-next-line react/no-unknown-property
        <line key={i}>
          <primitive object={part.geometry} attach="geometry" />
          <primitive object={part.material} attach="material" />
        </line>
      ))}
    </group>
  )
}
