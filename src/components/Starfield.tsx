import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { AdditiveBlending, BufferGeometry, Color, Float32BufferAttribute, Group } from 'three'
import { quality } from '../game/device'

// Stars sit on the inside of a dome carried along with the camera, rather than in a box
// parked somewhere in the world.
//
// The box came first and was wrong twice, in the same way both times. A star clears the
// horizon only if it is higher than the *camera*, and every camera in this game sits at
// a different height — head-on at about 13 units, offshore at 150, in the gun pit at
// eye level — so a box that sat above the horizon in one mode scattered stars across the
// ground in another. Each mode ended up with its own hand-tuned box, and classic's still
// had its floor below the camera: half its stars were speckling the grid and the cities.
//
// A dome centred on the camera cannot have that bug. "Above the camera" is what the upper
// hemisphere *means*, so the horizon cut comes out exact at any pose, in any mode, and
// there is nothing left to tune per mode.
export const DOME_RADIUS = 300

/**
 * Elevation is sampled as asin(u^BIAS). At 1 that is uniform over the hemisphere; above
 * it, stars crowd towards the horizon — which is the only part of the sky a camera that
 * is looking at the ground can see, so it is where the density is worth spending.
 */
const ELEVATION_BIAS = 2.2

/**
 * Stars come up to full brightness over this much elevation, so the dome has no hard rim
 * — but only just, because the whole sky a head-on camera can see is about eighteen
 * degrees of it. Fade over much more than a couple of degrees and the visible sky is the
 * part that has been faded out.
 */
const HAZE_BAND = 0.07 // radians

/**
 * Two layers rather than one: `PointsMaterial` sizes every point alike, so a handful of
 * larger, brighter stars over a field of small faint ones is what gives the sky any depth
 * at all. Counts are relative to the device budget.
 */
const LAYERS = [
  { scale: 6.4, size: 1.0, min: 0.16, max: 0.58 },
  { scale: 1.0, size: 1.9, min: 0.55, max: 1 },
] as const

/**
 * The stars themselves: a position on the dome and a baked colour per star.
 *
 * Exported so `Starfield.test.ts` can hold the one invariant this whole file exists for —
 * that with a horizon, no star is ever below it.
 */
export function starPoints(
  count: number,
  min: number,
  max: number,
  horizon: boolean,
): { position: Float32Array; color: Float32Array } {
  const position = new Float32Array(count * 3)
  const color = new Float32Array(count * 3)
  const tint = new Color()
  for (let i = 0; i < count; i++) {
    const u = Math.random()
    // Standing on the ground you get the upper hemisphere, crowded towards the horizon
    // and fading out into it. In orbit there is no horizon and no down, so the stars go
    // all the way round, evenly.
    const elevation = horizon ? Math.asin(Math.pow(u, ELEVATION_BIAS)) : Math.asin(u * 2 - 1)
    const azimuth = Math.random() * Math.PI * 2
    const ring = Math.cos(elevation) * DOME_RADIUS
    position[i * 3 + 0] = Math.cos(azimuth) * ring
    position[i * 3 + 1] = Math.sin(elevation) * DOME_RADIUS
    position[i * 3 + 2] = Math.sin(azimuth) * ring
    // Baked per-star brightness: a spread of magnitudes, hazed out near the horizon.
    const haze = horizon ? Math.min(1, elevation / HAZE_BAND) ** 2 : 1
    const magnitude = (min + Math.random() * (max - min)) * haze
    tint.setHSL(0.56 + Math.random() * 0.1, 0.4, 0.62)
    color[i * 3 + 0] = tint.r * magnitude
    color[i * 3 + 1] = tint.g * magnitude
    color[i * 3 + 2] = tint.b * magnitude
  }
  return { position, color }
}

function domeGeometry(count: number, min: number, max: number, horizon: boolean): BufferGeometry {
  const { position, color } = starPoints(count, min, max, horizon)
  const g = new BufferGeometry()
  g.setAttribute('position', new Float32BufferAttribute(position, 3))
  g.setAttribute('color', new Float32BufferAttribute(color, 3))
  return g
}

export function Starfield({
  count = quality.starCount,
  horizon = true,
}: {
  count?: number
  /** False in orbit, where there is no ground to cut the sky off at. */
  horizon?: boolean
}) {
  const dome = useRef<Group>(null)

  const layers = useMemo(
    () =>
      LAYERS.map((l) => ({
        size: l.size,
        geometry: domeGeometry(Math.round(count * l.scale), l.min, l.max, horizon),
      })),
    [count, horizon],
  )

  useFrame((state, dt) => {
    const g = dome.current
    if (!g) return
    // Carried with the camera, so it never resolves into geometry you could approach.
    g.position.copy(state.camera.position)
    g.rotation.y += dt * 0.004
  })

  return (
    <group ref={dome}>
      {layers.map((l) => (
        <points key={l.size} geometry={l.geometry}>
          <pointsMaterial
            size={l.size}
            sizeAttenuation
            vertexColors
            transparent
            depthWrite={false}
            fog={false}
            blending={AdditiveBlending}
          />
        </points>
      ))}
    </group>
  )
}
