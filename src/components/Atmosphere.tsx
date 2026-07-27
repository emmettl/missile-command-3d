import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { AdditiveBlending, BackSide, Color, Mesh, ShaderMaterial } from 'three'

// A flat translucent shell is the same brightness everywhere, so it reads as a sheet of
// coloured cellophane laid over the planet rather than as air. Real limb glow is a
// function of how much atmosphere you are looking through: nothing through the middle,
// where you are looking straight down, and a bright band around the edge where the line
// of sight grazes the surface. That is a fresnel term, and it is the whole fix.
//
// The colour then drifts slowly between two hues. Nothing in the scene changes, but the
// light on it never quite settles — which is most of what makes the look it is after
// feel analogue rather than drawn.

const VERT = /* glsl */ `
  varying vec3 vNormalW;
  varying vec3 vViewW;
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vNormalW = normalize(mat3(modelMatrix) * normal);
    vViewW = normalize(cameraPosition - world.xyz);
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`

const FRAG = /* glsl */ `
  uniform vec3 uInner;
  uniform vec3 uOuter;
  uniform float uPower;
  uniform float uStrength;
  varying vec3 vNormalW;
  varying vec3 vViewW;
  void main() {
    // Rendered on the inside of the shell, so the normal faces away from the camera —
    // hence the abs() rather than a one-sided dot.
    float facing = abs(dot(normalize(vNormalW), normalize(vViewW)));
    float rim = pow(clamp(1.0 - facing, 0.0, 1.0), uPower);
    vec3 col = mix(uInner, uOuter, rim);
    gl_FragColor = vec4(col * rim * uStrength, rim * uStrength);
  }
`

export interface AtmosphereProps {
  radius: number
  /** Higher tightens the glow to the very edge of the disc. */
  power?: number
  strength?: number
  /** Hue endpoints the colour wanders between, in turns (0..1). */
  hueFrom?: number
  hueTo?: number
  /** Seconds for a full there-and-back drift. */
  period?: number
  saturation?: number
  lightness?: number
}

export function Atmosphere({
  radius,
  power = 3,
  strength = 1,
  hueFrom = 0.5, // cyan
  hueTo = 0.6, // indigo
  period = 19,
  saturation = 0.85,
  lightness = 0.55,
}: AtmosphereProps) {
  const inner = useMemo(() => new Color(), [])
  const outer = useMemo(() => new Color(), [])

  const material = useMemo(
    () =>
      new ShaderMaterial({
        vertexShader: VERT,
        fragmentShader: FRAG,
        uniforms: {
          uInner: { value: inner },
          uOuter: { value: outer },
          uPower: { value: power },
          uStrength: { value: strength },
        },
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
        side: BackSide,
      }),
    [inner, outer, power, strength],
  )

  const ref = useRef(material)
  ref.current = material

  useFrame(({ clock }) => {
    // Two hues sliding against each other at slightly different rates, so the pair never
    // repeats on a beat you can count.
    const t = clock.elapsedTime / period
    const a = 0.5 - Math.cos(t * Math.PI * 2) * 0.5
    const b = 0.5 - Math.cos(t * Math.PI * 2 * 0.61 + 1.2) * 0.5
    inner.setHSL(hueFrom + (hueTo - hueFrom) * a, saturation, lightness)
    outer.setHSL(hueFrom + (hueTo - hueFrom) * b, saturation * 0.9, lightness * 1.15)
  })

  return (
    <mesh>
      <sphereGeometry args={[radius, 48, 48]} />
      <primitive object={material} attach="material" />
    </mesh>
  )
}

// --- Outer bloom -------------------------------------------------------------------
//
// The limb shader above cannot do the wider glow: a fresnel term on a bigger shell is
// brightest where *that* shell turns away from the camera, so it comes out as a fat ring
// hanging in space with a hard outer edge, rather than as light spilling off the planet.
//
// What that wants instead is a screen-space falloff — brightest against the edge of the
// disc, fading outward into nothing — which is a camera-facing quad with a radial ramp.
// The planet occludes the middle of it, so only the spill is ever seen.

const HALO_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

const HALO_FRAG = /* glsl */ `
  uniform vec3 uInner;
  uniform vec3 uOuter;
  uniform float uEdge;    // where the planet's disc ends, as a fraction of the quad
  uniform float uFalloff;
  uniform float uStrength;
  varying vec2 vUv;
  void main() {
    float d = length(vUv - 0.5) * 2.0;
    float t = clamp((d - uEdge) / max(0.0001, 1.0 - uEdge), 0.0, 1.0);
    float glow = pow(1.0 - t, uFalloff);
    // Ease it in across the last of the disc so the join is not a step.
    glow *= smoothstep(uEdge - 0.06, uEdge + 0.01, d);
    vec3 col = mix(uInner, uOuter, t);
    gl_FragColor = vec4(col * glow * uStrength, glow * uStrength);
  }
`

export function AtmosphereHalo({
  radius,
  spread = 2.7,
  falloff = 3.2,
  strength = 0.5,
  hueFrom = 0.505,
  hueTo = 0.645,
  period = 26,
}: {
  /** Planet radius; the quad is `spread` times this across. */
  radius: number
  spread?: number
  falloff?: number
  strength?: number
  hueFrom?: number
  hueTo?: number
  period?: number
}) {
  const mesh = useRef<Mesh>(null)
  const inner = useMemo(() => new Color(), [])
  const outer = useMemo(() => new Color(), [])

  const material = useMemo(
    () =>
      new ShaderMaterial({
        vertexShader: HALO_VERT,
        fragmentShader: HALO_FRAG,
        uniforms: {
          uInner: { value: inner },
          uOuter: { value: outer },
          uEdge: { value: 1 / spread },
          uFalloff: { value: falloff },
          uStrength: { value: strength },
        },
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
      }),
    [inner, outer, spread, falloff, strength],
  )

  useFrame(({ clock, camera }) => {
    // Billboard: the ramp is radial in screen space, so the quad has to stay square-on.
    if (mesh.current) mesh.current.quaternion.copy(camera.quaternion)
    const t = clock.elapsedTime / period
    const a = 0.5 - Math.cos(t * Math.PI * 2) * 0.5
    const b = 0.5 - Math.cos(t * Math.PI * 2 * 0.61 + 1.2) * 0.5
    inner.setHSL(hueFrom + (hueTo - hueFrom) * a, 0.7, 0.46)
    outer.setHSL(hueFrom + (hueTo - hueFrom) * b, 0.62, 0.3)
  })

  return (
    <mesh ref={mesh}>
      <planeGeometry args={[radius * spread * 2, radius * spread * 2]} />
      <primitive object={material} attach="material" />
    </mesh>
  )
}
