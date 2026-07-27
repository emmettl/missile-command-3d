import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Group, InstancedMesh, Matrix4, Mesh, Object3D, Quaternion, Vector3 } from 'three'
import { BOMBER_HITS, COLORS, SHELL_BURST_RADIUS } from '../game/constants'
import { useGameStore } from '../game/useGameStore'
import type { Bomb, Bomber } from '../game/types'

// A bomber: a dark airframe with lit engines, big enough to pick out against the sky at
// the range you first hear it and small enough that hitting it is worth something.
const UP = new Vector3(0, 1, 0)

export function BomberView({ bomber }: { bomber: Bomber }) {
  const group = useRef<Group>(null)
  const damage = useRef<Mesh>(null)

  useFrame(({ clock }) => {
    const g = group.current
    if (!g) return
    g.position.copy(bomber.pos)
    // Nose along the run.
    g.quaternion.setFromUnitVectors(new Vector3(0, 0, -1), bomber.heading)
    // A hurt aircraft flickers, so a formation you have been working reads at a glance.
    if (damage.current) {
      const hurt = 1 - bomber.hp / BOMBER_HITS
      const mat = damage.current.material as { opacity: number }
      mat.opacity = hurt <= 0 ? 0 : 0.35 + Math.abs(Math.sin(clock.elapsedTime * 9)) * 0.5 * hurt
    }
  })

  return (
    <group ref={group} position={bomber.pos}>
      {/* fuselage */}
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <capsuleGeometry args={[0.5, 3.4, 4, 10]} />
        <meshStandardMaterial color={COLORS.bomber} metalness={0.5} roughness={0.6} />
      </mesh>
      {/* wing */}
      <mesh position={[0, 0.05, 0.2]}>
        <boxGeometry args={[6.8, 0.22, 1.5]} />
        <meshStandardMaterial color={COLORS.bomber} metalness={0.5} roughness={0.6} />
      </mesh>
      {/* tailplane */}
      <mesh position={[0, 0.35, 2]}>
        <boxGeometry args={[2.6, 0.18, 0.7]} />
        <meshStandardMaterial color={COLORS.bomber} metalness={0.5} roughness={0.6} />
      </mesh>
      {/* Engine glow — what you actually pick up at range, long before the airframe. */}
      {[-2.1, 2.1].map((x) => (
        <mesh key={x} position={[x, 0, 1.1]}>
          <sphereGeometry args={[0.44, 10, 10]} />
          <meshBasicMaterial color={COLORS.bomberGlow} toneMapped={false} />
        </mesh>
      ))}
      {/* A thin lit edge along the wing, so the shape resolves as it closes rather than
          staying a pair of dots against a black sky. */}
      <mesh position={[0, 0.16, 0.2]}>
        <boxGeometry args={[6.9, 0.05, 1.6]} />
        <meshBasicMaterial color={COLORS.bomberGlow} transparent opacity={0.45} />
      </mesh>
      {/* damage flicker */}
      <mesh ref={damage} position={[0, 0.4, -0.6]}>
        <sphereGeometry args={[0.9, 10, 10]} />
        <meshBasicMaterial color={COLORS.explosion} transparent opacity={0} depthWrite={false} />
      </mesh>
    </group>
  )
}

export function BombView({ bomb }: { bomb: Bomb }) {
  const mesh = useRef<Mesh>(null)
  useFrame(() => {
    const m = mesh.current
    if (!m) return
    m.position.copy(bomb.pos)
    // Nose-down along its own velocity, so a falling stick reads as falling.
    m.quaternion.setFromUnitVectors(UP, bomb.vel.clone().normalize().negate())
  })
  return (
    <mesh ref={mesh} position={bomb.pos}>
      <capsuleGeometry args={[0.22, 0.8, 3, 8]} />
      <meshStandardMaterial
        color={COLORS.enemy}
        emissive={COLORS.enemy}
        emissiveIntensity={1.1}
        toneMapped={false}
      />
    </mesh>
  )
}

// Tracers, drawn as one instanced mesh.
//
// The gun puts out six rounds a second and each lives a couple of seconds, so a busy
// moment has thirty-odd in the air. A mesh and a trail apiece — which is how every other
// projectile in this game is drawn — would mount and unmount React nodes several times a
// second for the length of a wave. One instanced mesh draws the lot in a single call.
const MAX_SHELLS = 96
const _dummy = new Object3D()
const _hidden = new Matrix4().makeScale(0, 0, 0)
const _quat = new Quaternion()
const _dir = new Vector3()

export function Tracers() {
  const mesh = useRef<InstancedMesh>(null)
  const shells = useGameStore((s) => s.shells)
  // Read through a ref so the frame loop sees the live array without re-subscribing.
  const live = useRef(shells)
  live.current = shells

  const geometryArgs = useMemo(() => [0.09, 0.09, 1.4, 6] as const, [])

  useFrame(() => {
    const m = mesh.current
    if (!m) return
    const list = live.current
    const count = Math.min(list.length, MAX_SHELLS)
    for (let i = 0; i < count; i++) {
      const shell = list[i]
      _dir.copy(shell.vel).normalize()
      _quat.setFromUnitVectors(UP, _dir)
      _dummy.position.copy(shell.pos)
      _dummy.quaternion.copy(_quat)
      _dummy.scale.setScalar(1)
      _dummy.updateMatrix()
      m.setMatrixAt(i, _dummy.matrix)
    }
    for (let i = count; i < MAX_SHELLS; i++) m.setMatrixAt(i, _hidden)
    m.instanceMatrix.needsUpdate = true
    m.count = MAX_SHELLS
  })

  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, MAX_SHELLS]} frustumCulled={false}>
      <cylinderGeometry args={geometryArgs} />
      <meshBasicMaterial color={COLORS.tracer} toneMapped={false} />
    </instancedMesh>
  )
}

/** Radius a shell bursts at — exported so the HUD can size the crosshair honestly. */
export const TRACER_BURST = SHELL_BURST_RADIUS
