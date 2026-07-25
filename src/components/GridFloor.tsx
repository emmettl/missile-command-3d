import { Grid } from '@react-three/drei'
import { COLORS } from '../game/constants'

// A neon grid receding to a glowing horizon — the main depth cue for the battlefield.
export function GridFloor() {
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
        fadeDistance={95}
        fadeStrength={2.2}
      />
      {/* Glowing horizon bar the grid fades toward */}
      <mesh position={[0, 0.2, -70]}>
        <boxGeometry args={[300, 0.28, 0.28]} />
        <meshBasicMaterial color={COLORS.player} transparent opacity={0.85} toneMapped={false} />
      </mesh>
      {/* Soft additive halo above the horizon */}
      <mesh position={[0, 4, -71]}>
        <planeGeometry args={[300, 16]} />
        <meshBasicMaterial color={COLORS.player} transparent opacity={0.05} depthWrite={false} />
      </mesh>
    </group>
  )
}
