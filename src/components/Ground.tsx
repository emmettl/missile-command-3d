import { FIELD, COLORS } from '../game/constants'

// The cosmetic ground slab plus a subtle grid glow. The invisible click/aim plane
// is separate (see AimPlane in Scene) so it can span the full sky.
export function Ground() {
  const width = FIELD.maxX - FIELD.minX + 8
  const midX = (FIELD.maxX + FIELD.minX) / 2
  return (
    <group>
      <mesh position={[midX, FIELD.groundY - 0.75, 0]}>
        <boxGeometry args={[width, 1.5, FIELD.depth * 2]} />
        <meshStandardMaterial color={COLORS.ground} metalness={0.1} roughness={0.85} />
      </mesh>
      {/* Glowing top edge line where the ground meets the sky */}
      <mesh position={[midX, FIELD.groundY + 0.01, FIELD.depth]}>
        <boxGeometry args={[width, 0.06, 0.06]} />
        <meshStandardMaterial
          color={COLORS.player}
          emissive={COLORS.player}
          emissiveIntensity={1.5}
          toneMapped={false}
        />
      </mesh>
    </group>
  )
}
