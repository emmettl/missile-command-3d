import { useMemo } from 'react'
import { COLORS } from '../game/constants'
import type { CityState } from '../game/types'

// A little cluster of towers. When destroyed it collapses to dark rubble.
export function City({ city }: { city: CityState }) {
  const towers = useMemo(() => {
    // Deterministic pseudo-random layout seeded from the city id so it's stable.
    const seed = city.id.split('').reduce((s, c) => s + c.charCodeAt(0), 0)
    const rand = (i: number) => {
      const v = Math.sin(seed * 12.9898 + i * 78.233) * 43758.5453
      return v - Math.floor(v)
    }
    return Array.from({ length: 5 }, (_, i) => ({
      dx: (i - 2) * 0.62 + (rand(i) - 0.5) * 0.2,
      h: 0.9 + rand(i + 10) * 1.7,
      w: 0.42 + rand(i + 20) * 0.16,
    }))
  }, [city.id])

  return (
    <group position={[city.x, 0, 0]}>
      {towers.map((t, i) => (
        <mesh key={i} position={[t.dx, city.alive ? t.h / 2 : 0.12, 0]}>
          <boxGeometry args={[t.w, city.alive ? t.h : 0.24, t.w]} />
          {city.alive ? (
            <meshStandardMaterial
              color={COLORS.city}
              emissive={COLORS.city}
              emissiveIntensity={0.35}
              metalness={0.3}
              roughness={0.4}
            />
          ) : (
            <meshStandardMaterial color={COLORS.cityDead} roughness={1} />
          )}
        </mesh>
      ))}
    </group>
  )
}
