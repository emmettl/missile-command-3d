import { Grid } from '@react-three/drei'
import { COLORS } from '../game/constants'
import type { WaveMode } from '../game/types'

// A neon grid receding to a glowing horizon — the main depth cue for the battlefield.
// Everything is sized off the camera distance, because on a narrow screen the camera
// pulls a long way back and fixed distances would leave the grid fading out early or
// the horizon bar sitting in the middle of the frame.
//
// The horizon bar is furniture for a head-on camera: it is a line drawn across the far
// edge of the world, and it only reads as a horizon when you are looking straight at
// it. Swing round to the offshore view and it becomes a bright bar lying across the
// middle of the ocean, so out there the grid simply fades into the fog instead.
export function GridFloor({ distance, mode = 'classic' }: { distance: number; mode?: WaveMode }) {
  const horizonZ = -distance * 1.8
  if (mode === 'slbm') {
    return (
      <Grid
        position={[-40, 0.02, 0]}
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
        cellColor="#143a52"
        sectionSize={10}
        sectionThickness={1.1}
        sectionColor="#2f7fa6"
        fadeDistance={distance * 2.4}
        fadeStrength={2.2}
      />
      {/* Glowing horizon bar the grid fades toward */}
      <mesh position={[0, 0.2, horizonZ]}>
        <boxGeometry args={[Math.abs(horizonZ) * 6, distance * 0.007, distance * 0.007]} />
        <meshBasicMaterial color={COLORS.player} transparent opacity={0.85} toneMapped={false} />
      </mesh>
      {/* Soft additive halo above the horizon */}
      <mesh position={[0, distance * 0.1, horizonZ - 1]}>
        <planeGeometry args={[Math.abs(horizonZ) * 6, distance * 0.4]} />
        <meshBasicMaterial color={COLORS.player} transparent opacity={0.05} depthWrite={false} />
      </mesh>
    </group>
  )
}
