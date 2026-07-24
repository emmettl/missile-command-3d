import { Text } from '@react-three/drei'
import { COLORS } from '../game/constants'
import type { BatteryState } from '../game/types'

export function Battery({ battery }: { battery: BatteryState }) {
  const dead = battery.destroyed
  const color = dead ? COLORS.cityDead : COLORS.battery
  return (
    <group position={[battery.x, 0, 0]}>
      {/* base */}
      <mesh position={[0, 0.35, 0]}>
        <cylinderGeometry args={[1.1, 1.4, 0.7, 6]} />
        <meshStandardMaterial color={color} metalness={0.4} roughness={0.5} />
      </mesh>
      {/* barrel */}
      <mesh position={[0, 1.1, 0]} rotation={[0, 0, 0]}>
        <cylinderGeometry args={[0.14, 0.14, 1.2, 12]} />
        <meshStandardMaterial
          color={dead ? COLORS.cityDead : COLORS.player}
          emissive={dead ? '#000000' : COLORS.player}
          emissiveIntensity={dead ? 0 : 1.2}
          toneMapped={false}
        />
      </mesh>
      {!dead && (
        <Text
          position={[0, 2.1, 0]}
          fontSize={0.62}
          color={battery.ammo > 0 ? COLORS.battery : COLORS.enemy}
          anchorX="center"
          anchorY="middle"
        >
          {battery.ammo}
        </Text>
      )}
    </group>
  )
}
