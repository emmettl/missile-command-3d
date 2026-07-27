import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Group, Mesh, MeshBasicMaterial, MeshStandardMaterial } from 'three'
import { COLORS, SUB_HULL_LENGTH } from '../game/constants'
import { EXPOSED_THRESHOLD, exposure } from '../game/slbm'
import type { Submarine } from '../game/types'

// How far under the surface the hull sits when it is running deep. The sea is opaque,
// so a submerged boat is simply hidden by it — surfacing is the hull rising through the
// water, not a visibility toggle.
const DRAFT = 4.5
const PING_RADIUS = 9

export function SubmarineView({ sub }: { sub: Submarine }) {
  const hull = useRef<Group>(null)
  const hullMat = useRef<MeshStandardMaterial>(null)
  const towerMat = useRef<MeshStandardMaterial>(null)
  const ping = useRef<Mesh>(null)
  const pingMat = useRef<MeshBasicMaterial>(null)

  useFrame(({ clock }) => {
    const up = exposure(sub)

    if (hull.current) {
      hull.current.position.set(sub.pos.x, -DRAFT * (1 - up), sub.pos.z)
      // A slow roll on the swell, only once there is a hull above water to roll.
      hull.current.rotation.z = Math.sin(clock.elapsedTime * 0.8 + sub.id) * 0.05 * up
    }
    // The boat lights up as it breaks the surface — the cue that it is now killable.
    if (hullMat.current) hullMat.current.emissiveIntensity = 0.05 + up * 0.8
    if (towerMat.current) towerMat.current.emissiveIntensity = 0.1 + up * 2.4

    // Sonar return: a ring that opens and fades on the water. Strong while the boat is
    // hidden — it is the only way to know where to look — and almost gone once it is up
    // and speaking for itself.
    if (ping.current && pingMat.current) {
      const cycle = (clock.elapsedTime * 0.45 + sub.id * 0.37) % 1
      ping.current.position.set(sub.pos.x, 0.06, sub.pos.z)
      ping.current.scale.setScalar(0.6 + cycle * PING_RADIUS)
      pingMat.current.opacity = (1 - cycle) ** 2 * (up < EXPOSED_THRESHOLD ? 0.55 : 0.12)
    }
  })

  return (
    <group>
      <group ref={hull} position={[sub.pos.x, -DRAFT, sub.pos.z]}>
        <mesh rotation={[0, 0, Math.PI / 2]}>
          <capsuleGeometry args={[1.05, SUB_HULL_LENGTH, 4, 12]} />
          <meshStandardMaterial
            ref={hullMat}
            color={COLORS.subHull}
            emissive={COLORS.sub}
            emissiveIntensity={0.05}
            roughness={0.55}
            metalness={0.5}
          />
        </mesh>
        {/* Conning tower — the part that reads at this distance. */}
        <mesh position={[-0.6, 1.15, 0]}>
          <boxGeometry args={[2.1, 1.5, 0.9]} />
          <meshStandardMaterial
            ref={towerMat}
            color={COLORS.sub}
            emissive={COLORS.sub}
            emissiveIntensity={0.1}
            toneMapped={false}
          />
        </mesh>
      </group>

      <mesh ref={ping} rotation={[-Math.PI / 2, 0, 0]} position={[sub.pos.x, 0.06, sub.pos.z]}>
        <ringGeometry args={[0.88, 1, 40]} />
        <meshBasicMaterial
          ref={pingMat}
          color={COLORS.subPing}
          transparent
          opacity={0.4}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>
    </group>
  )
}
