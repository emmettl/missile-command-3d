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
import { quality } from '../game/device'
import {
  type CoastPoint,
  coastGlowStrip,
  coastPath,
  contourPaths,
  islandPaths,
  landStrip,
  stripIndices,
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

// Heights for the stacked chart layers, and the reason they are as far apart as they are.
//
// These were originally a hundredth of a unit apart, which looked fine and was very
// nearly broken. Depth precision falls off with the square of distance: seen from the
// ~150 units the offshore camera sits at, with a 0.1 near plane, a 24-bit depth buffer
// resolves about 0.013 units — so layers 0.01 apart were inside the noise. Desktop mostly
// won those coin flips; an iPhone did not, and the coast came apart into a sawtooth of
// flickering triangles. (The grid showing through the land, which looked like the same
// bug, was a separate one — see `landStrip`.)
//
// Three things fix it and all three are here, because any one alone is thin: the layers
// are spaced properly, the near plane has been pulled out (see App.tsx), and each layer
// carries a polygon offset so the winner is decided in depth-buffer units rather than by
// whatever precision the device happens to have.
const SEA_LEVEL = 0.4 // the outlines, clear of everything below them
const GLOW_Y = 0.3
const LAND_Y = 0.2
const SEA_Y = 0.1

/** Pulls a layer towards the camera in depth units — the standard fix for coplanar art. */
function decal(order: number) {
  return { polygonOffset: true, polygonOffsetFactor: -order, polygonOffsetUnits: -order * 2 }
}

const CONTOUR_OPACITY = [0.3, 0.2, 0.12]
const SHORE_OPACITY = 0.95
const ISLAND_OPACITY = 0.7
// Bloom makes far more of a large additive area on a phone than it does on a desktop
// panel, where this reads as a bleed rather than a bar of light.
const GLOW_STRENGTH = quality.reflections ? 0.62 : 0.4
const SEA_OPACITY = 0.86
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
    material: new LineBasicMaterial({
      color,
      transparent: true,
      opacity: 0,
      depthWrite,
      ...decal(4),
    }),
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
      material: new MeshBasicMaterial({ color: new Color(COLORS.sky), ...decal(2) }),
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
        ...decal(3),
      }),
    },
    sea: new MeshBasicMaterial({
      color: new Color(COLORS.sea),
      transparent: true,
      opacity: 0,
      depthWrite: false,
      ...decal(1),
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
