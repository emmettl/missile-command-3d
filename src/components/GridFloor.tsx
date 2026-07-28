import { useMemo, useRef } from 'react'
import { Grid } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { AdditiveBlending, Color, Group, Mesh, PerspectiveCamera } from 'three'
import { COLORS } from '../game/constants'
import type { WaveMode } from '../game/types'

// A neon grid receding to a glowing horizon — the main depth cue for the battlefield.
// Everything is sized off the camera distance, because on a narrow screen the camera
// pulls a long way back and fixed distances would leave the grid fading out early or
// the horizon sitting in the middle of the frame.
//
// The horizon is furniture for a head-on camera: it is a line drawn across the far edge
// of the world, and it only reads as a horizon when you are looking straight at it. Swing
// round to the offshore view and it becomes a bright bar lying across the middle of the
// ocean; stand up in the gun pit and turn round and it is a wall in one direction and
// missing in every other. Both of those modes let the grid fade into the fog instead.

/**
 * How far out the classic grid fades to nothing, in camera distances. It is matched to
 * the mode's fog (see `cameraFit`): the grid can never outrun the fog, since the fog has
 * already flattened everything to the sky colour, so the two are raised together or the
 * work is wasted.
 */
const GRID_FADE = 5.5

/**
 * The horizon is carried with the camera and drawn at its eye level, which is where a
 * horizon is: the ground plane runs out to a line at exactly the height you are looking
 * from, and no nearer.
 *
 * It used to be a bar parked at a fixed z, chosen by eye. That put it well short of the
 * real horizon, so it sat *across* the ground with sky above it and dark ground below —
 * a strip laid over the scene rather than the far edge of it, with the stars beginning a
 * good way above it and nothing in between. Pinned to eye level it lands exactly on the
 * join between the fogged-out ground and the sky, at any camera height or aspect ratio,
 * which is also where the starfield's own horizon cut falls.
 */
const HORIZON_RADIUS = 220

const HORIZON_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

// The old horizon was a hard-edged box for the line, plus a flat quad at one uniform
// opacity for the glow above it. A constant fill has a top edge, and an edge is exactly
// what a glow must not have — it read as a band of lighter paint across the sky.
//
// This is the same shape done as falloffs instead: exponential away from the line, faster
// downward than up, so the light sits on the horizon rather than floating above it, and
// tapering towards the ends so the line does not run the full width of the world like a
// rule. The line itself is the same falloff at a much tighter radius.
const HORIZON_FRAG = /* glsl */ `
  uniform vec3 uColor;
  uniform float uBase;
  varying vec2 vUv;
  void main() {
    float d = vUv.y - uBase;
    float away = d > 0.0 ? d : -d * 2.6;
    float halo = exp(-away * 6.0) * 0.4;
    float line = exp(-away * 170.0);
    // Dying at the ends, so the horizon has a middle rather than being a bar of even light.
    float ends = pow(max(0.0, 1.0 - abs(vUv.x * 2.0 - 1.0)), 1.2);
    float a = (halo + line * 0.5) * ends;
    gl_FragColor = vec4(uColor * a, a);
  }
`

/** Where along the quad's height the line itself falls. */
const HORIZON_BASE = 0.34

/**
 * How much wider than the visible frame the quad is drawn. The taper at its ends has to
 * happen *inside* the picture to be seen at all — drawn far wider than the frustum, as it
 * was at first, the frame only ever shows the flat middle of it.
 */
const HORIZON_OVERSHOOT = 1.9

function HorizonGlow() {
  const rig = useRef<Group>(null)
  const quad = useRef<Mesh>(null)
  const height = HORIZON_RADIUS * 0.45
  const uniforms = useMemo(
    () => ({ uColor: { value: new Color(COLORS.player) }, uBase: { value: HORIZON_BASE } }),
    [],
  )

  // Position only, never rotation: the quad stays square to the world so its base holds
  // at eye level however far the camera tilts down. Its width tracks the frustum, so the
  // ends taper off at the edges of the frame at any aspect ratio.
  useFrame((state) => {
    rig.current?.position.copy(state.camera.position)
    const cam = state.camera as PerspectiveCamera
    if (!quad.current || !cam.isPerspectiveCamera) return
    const halfV = (cam.fov * Math.PI) / 360
    const halfH = Math.atan(Math.tan(halfV) * cam.aspect)
    const visible = HORIZON_RADIUS * Math.tan(halfH)
    quad.current.scale.x = (visible * HORIZON_OVERSHOOT * 2) / HORIZON_RADIUS
  })

  return (
    <group ref={rig}>
      <mesh ref={quad} position={[0, height * (0.5 - HORIZON_BASE), -HORIZON_RADIUS]}>
        <planeGeometry args={[HORIZON_RADIUS, height]} />
        <shaderMaterial
          vertexShader={HORIZON_VERT}
          fragmentShader={HORIZON_FRAG}
          uniforms={uniforms}
          transparent
          depthWrite={false}
          blending={AdditiveBlending}
          toneMapped={false}
        />
      </mesh>
    </group>
  )
}

export function GridFloor({ distance, mode = 'classic' }: { distance: number; mode?: WaveMode }) {
  if (mode !== 'classic') {
    return (
      <Grid
        position={[mode === 'slbm' ? -40 : 0, 0.02, 0]}
        infiniteGrid
        followCamera={false}
        cellSize={6}
        cellThickness={0.5}
        cellColor="#123043"
        sectionSize={30}
        sectionThickness={1}
        sectionColor="#2a6f92"
        fadeDistance={distance * 1.9}
        fadeStrength={1.6}
      />
    )
  }
  return (
    <group>
      <Grid
        position={[0, 0.02, -20]}
        infiniteGrid
        followCamera={false}
        cellSize={2}
        cellThickness={0.5}
        cellColor="#102c40"
        sectionSize={10}
        sectionThickness={1.1}
        sectionColor="#256b8e"
        fadeDistance={distance * GRID_FADE}
        fadeStrength={2.6}
      />
      <HorizonGlow />
    </group>
  )
}
