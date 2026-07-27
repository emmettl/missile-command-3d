import { Text } from '@react-three/drei'
import { COLORS } from '../game/constants'
import type { BatteryState } from '../game/types'
import pixelFont from '../fonts/press-start-2p-latin-400.woff'

// Given no font, troika downloads one from a CDN at runtime and resolves glyph coverage
// against a second CDN request — a third-party dependency on every play, and a hard one:
// if either fetch fails the rejection is uncaught and the render loop stops. So the
// ammo counter is drawn with the same self-hosted face as the rest of the game.
//
// It has to be the .woff rather than the .woff2 the stylesheet uses: troika's parser
// converts wOFF but throws outright on wOF2. Both are the same Latin subset, generated
// from the same source (src/fonts/OFL.txt).
const AMMO_GLYPHS = '0123456789'

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
          font={pixelFont}
          characters={AMMO_GLYPHS}
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
