import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  Float32BufferAttribute,
  LineBasicMaterial,
  MeshBasicMaterial,
  ShaderMaterial,
} from 'three'
import { COLORS } from '../game/constants'
import {
  type CoastPoint,
  coastGlowStrip,
  coastPath,
  contourPaths,
  islandPaths,
  landStrip,
} from '../game/coastline'

// The chart the offshore wave is fought over: a lit sea, dark land, and the coastline
// between them with its light bleeding out into the water.
//
// The bleed is the part that matters. An outline alone is a hard join between two flat
// fills; the glow running off it is what gives the coast something to sit in and the
// water something to be lit by, and it is most of what the look being chased is made of.
//
// The paths are deterministic and never change, so geometry and materials are built once
// for the life of the page rather than per wave: an SLBM wave every third wave would
// otherwise leave a trail of orphaned buffers behind it, and — the reason this is
// materials too and not just geometry — the Scene re-renders every time a missile is
// added or removed. Anything this component owned per render would be reset by that,
// several times a second, in the middle of the fade.

const SEA_LEVEL = 0.08 // the outlines, clear of everything below them
const GLOW_Y = 0.06
const LAND_Y = 0.04
const SEA_Y = 0.03

const CONTOUR_OPACITY = [0.3, 0.2, 0.12]
const SHORE_OPACITY = 0.95
const ISLAND_OPACITY = 0.7
const GLOW_STRENGTH = 0.62
const SEA_OPACITY = 0.86
const FADE_IN = 1.1 // seconds, roughly the length of the camera's swing

function lineGeometry(points: CoastPoint[]): BufferGeometry {
  const flat: number[] = []
  for (const p of points) flat.push(p.x, SEA_LEVEL, p.z)
  const g = new BufferGeometry()
  g.setAttribute('position', new Float32BufferAttribute(flat, 3))
  return g
}

/** Indices that wind a two-row vertex strip (a, b, a, b …) into a continuous band. */
function stripIndices(vertexCount: number): number[] {
  const index: number[] = []
  for (let i = 0; i + 3 < vertexCount; i += 2) index.push(i, i + 1, i + 2, i + 1, i + 3, i + 2)
  return index
}

interface Chart {
  geometry: BufferGeometry
  material: LineBasicMaterial
  opacity: number
}

const GLOW_VERT = /* glsl */ `
  attribute float aAlpha;
  varying float vAlpha;
  void main() {
    vAlpha = aAlpha;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

const GLOW_FRAG = /* glsl */ `
  uniform vec3 uColor;
  uniform float uStrength;
  varying float vAlpha;
  void main() {
    // Curved rather than linear, so the light hugs the coast and thins out quickly
    // instead of reading as a flat ribbon laid alongside it.
    float a = pow(clamp(vAlpha, 0.0, 1.0), 2.2);
    gl_FragColor = vec4(uColor * a * uStrength, a * uStrength);
  }
`

let cached: {
  outlines: Chart[]
  land: { geometry: BufferGeometry; material: MeshBasicMaterial }
  glow: { geometry: BufferGeometry; material: ShaderMaterial }
  sea: MeshBasicMaterial
} | null = null

function chart() {
  if (cached) return cached
  const shore = coastPath()

  const outline = (points: CoastPoint[], color: string, opacity: number, depthWrite = true) => ({
    geometry: lineGeometry(points),
    material: new LineBasicMaterial({ color, transparent: true, opacity: 0, depthWrite }),
    opacity,
  })

  // Land: opaque, so the sea grid stops at the shore and nothing behind the world shows
  // through it. It fades in by colour rather than by alpha for exactly that reason —
  // a translucent landmass lets the starfield through.
  const landGeometry = new BufferGeometry()
  const landVerts = landStrip(shore)
  for (let i = 1; i < landVerts.length; i += 3) landVerts[i] = LAND_Y
  landGeometry.setAttribute('position', new BufferAttribute(landVerts, 3))
  landGeometry.setIndex(stripIndices(landVerts.length / 3))

  const glowGeometry = new BufferGeometry()
  const { positions, alphas } = coastGlowStrip(shore)
  for (let i = 1; i < positions.length; i += 3) positions[i] = GLOW_Y
  glowGeometry.setAttribute('position', new BufferAttribute(positions, 3))
  glowGeometry.setAttribute('aAlpha', new BufferAttribute(alphas, 1))
  glowGeometry.setIndex(stripIndices(positions.length / 3))

  cached = {
    outlines: [
      outline(shore, COLORS.coast, SHORE_OPACITY),
      ...contourPaths().map((p, i) => outline(p, COLORS.contour, CONTOUR_OPACITY[i] ?? 0.1, false)),
      ...islandPaths().map((p) => outline(p, COLORS.coast, ISLAND_OPACITY)),
    ],
    land: {
      geometry: landGeometry,
      material: new MeshBasicMaterial({ color: new Color(COLORS.sky) }),
    },
    glow: {
      geometry: glowGeometry,
      material: new ShaderMaterial({
        vertexShader: GLOW_VERT,
        fragmentShader: GLOW_FRAG,
        uniforms: {
          uColor: { value: new Color(COLORS.coastGlow) },
          uStrength: { value: 0 },
        },
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
      }),
    },
    sea: new MeshBasicMaterial({
      color: new Color(COLORS.sea),
      transparent: true,
      opacity: 0,
      depthWrite: false,
    }),
  }
  return cached
}

const SKY = new Color(COLORS.sky)
const LAND = new Color(COLORS.land)

export function Coastline() {
  const { outlines, land, glow, sea } = chart()
  const age = useRef(0)

  // Drawn in as the camera comes round, rather than snapping into existence under it.
  // Everything is written every frame: the fade owns these outright, so nothing else can
  // be left holding a stale value.
  useFrame((_, dt) => {
    age.current = Math.min(FADE_IN, age.current + dt)
    const t = age.current / FADE_IN
    for (const part of outlines) part.material.opacity = t * part.opacity
    land.material.color.lerpColors(SKY, LAND, t)
    glow.material.uniforms.uStrength.value = t * GLOW_STRENGTH
    sea.opacity = t * SEA_OPACITY
  })

  return (
    <group>
      {/* The water, lit. Sits under the land, which covers where the two overlap. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[-140, SEA_Y, 0]}>
        <planeGeometry args={[560, 640]} />
        <primitive object={sea} attach="material" />
      </mesh>

      <mesh>
        <primitive object={glow.geometry} attach="geometry" />
        <primitive object={glow.material} attach="material" />
      </mesh>

      <mesh>
        <primitive object={land.geometry} attach="geometry" />
        <primitive object={land.material} attach="material" />
      </mesh>

      {outlines.map((part, i) => (
        // eslint-disable-next-line react/no-unknown-property
        <line key={i}>
          <primitive object={part.geometry} attach="geometry" />
          <primitive object={part.material} attach="material" />
        </line>
      ))}
    </group>
  )
}
