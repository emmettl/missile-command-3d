import { useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { AdditiveBlending, BackSide, Group, Mesh, Vector3 } from 'three'
import { COLORS } from '../game/constants'
import { getGame } from '../game/useGameStore'
import { Starfield } from './Starfield'
import { coastlineGeometry, graticuleGeometry, latLonDir } from './earth'

const GLOBE_R = 6
const DIVE_DURATION = 1.9 // seconds for the camera to plunge to the city

// Far enough back that the globe plus its halo always fits the viewport width —
// on a narrow phone screen a fixed distance would crop the sides off.
const GLOBE_HALF_WIDTH = GLOBE_R * 1.25
function menuDistance(aspect: number): number {
  const t = Math.tan((50 * Math.PI) / 180 / 2)
  return Math.max(22, aspect > 0 ? GLOBE_HALF_WIDTH / (t * aspect) : 22)
}

// The defended city sits on real land — Switzerland (the game's home).
const CITY_DIR = latLonDir(46.8, 8.2)
const CITY_LOCAL = CITY_DIR.clone().multiplyScalar(GLOBE_R)

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
}

// Wraps an angle delta to [-π, π] so the globe spins the short way into alignment.
function shortestDelta(from: number, to: number): number {
  let d = (to - from) % (Math.PI * 2)
  if (d > Math.PI) d -= Math.PI * 2
  if (d < -Math.PI) d += Math.PI * 2
  return d
}

export function IntroScene() {
  const camera = useThree((s) => s.camera)
  const globe = useRef<Group>(null)
  const marker = useRef<Mesh>(null)

  const coastline = useMemo(() => coastlineGeometry(GLOBE_R * 1.004), [])
  const graticule = useMemo(() => graticuleGeometry(GLOBE_R * 1.001), [])

  const size = useThree((s) => s.size)
  const menuCam = useMemo(
    () => new Vector3(0, 2.4, menuDistance(size.height > 0 ? size.width / size.height : 1)),
    [size.width, size.height],
  )

  // Launch-dive bookkeeping (mutated across frames, no re-renders).
  const started = useRef(false)
  const committed = useRef(false)
  const progress = useRef(0)
  const startRotY = useRef(0)
  const targetRotY = useRef(0)
  const startPos = useRef(new Vector3())
  const endPos = useRef(new Vector3())
  const lookAt = useRef(new Vector3())

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05)
    const status = getGame().status
    const g = globe.current
    if (!g) return

    if (status === 'menu') {
      g.rotation.y += dt * 0.12
      g.rotation.x = -0.3
      camera.position.lerp(menuCam, 0.06)
      camera.lookAt(0, 0.5, 0)
      started.current = false
      committed.current = false
      progress.current = 0
      return
    }

    if (status !== 'launching') return

    if (!started.current) {
      started.current = true
      progress.current = 0
      startRotY.current = g.rotation.y
      // Rotate the globe so the city ends front-and-centre (azimuth 0).
      const cityAzimuth = Math.atan2(CITY_LOCAL.x, CITY_LOCAL.z)
      targetRotY.current = startRotY.current + shortestDelta(startRotY.current, -cityAzimuth)
      // The city's world position once alignment completes.
      const horizontal = Math.hypot(CITY_LOCAL.x, CITY_LOCAL.z)
      const cityWorld = new Vector3(0, CITY_LOCAL.y, horizontal)
        .applyAxisAngle(new Vector3(1, 0, 0), g.rotation.x)
      lookAt.current.copy(cityWorld)
      startPos.current.copy(camera.position)
      // End just above the surface, along the outward normal.
      endPos.current
        .copy(cityWorld)
        .add(cityWorld.clone().normalize().multiplyScalar(1.6))
    }

    progress.current = Math.min(1, progress.current + dt / DIVE_DURATION)
    const e = easeInOutCubic(progress.current)
    g.rotation.y = startRotY.current + (targetRotY.current - startRotY.current) * e
    camera.position.lerpVectors(startPos.current, endPos.current, e)
    camera.lookAt(lookAt.current)

    if (progress.current >= 1 && !committed.current) {
      committed.current = true
      getGame().startGame()
    }
  })

  return (
    <>
      <color attach="background" args={[COLORS.sky]} />
      <ambientLight intensity={0.4} />
      <directionalLight position={[8, 10, 12]} intensity={1.1} color="#bcd0ff" />
      <Starfield count={600} />

      <group ref={globe}>
        {/* Dark solid core so only the front (near-side) lines read */}
        <mesh>
          <sphereGeometry args={[GLOBE_R - 0.04, 48, 48]} />
          <meshStandardMaterial color="#0a1326" metalness={0.3} roughness={0.7} />
        </mesh>
        {/* Faint lat/long graticule */}
        <lineSegments geometry={graticule}>
          <lineBasicMaterial color={COLORS.player} transparent opacity={0.12} depthWrite={false} />
        </lineSegments>
        {/* Real continent outlines */}
        <lineSegments geometry={coastline}>
          <lineBasicMaterial color={COLORS.player} transparent opacity={0.95} />
        </lineSegments>
        {/* Atmosphere glow */}
        <mesh>
          <sphereGeometry args={[GLOBE_R * 1.14, 48, 48]} />
          <meshBasicMaterial
            color={COLORS.player}
            transparent
            opacity={0.12}
            side={BackSide}
            blending={AdditiveBlending}
            depthWrite={false}
          />
        </mesh>

        {/* City marker pinned to the surface */}
        <group position={CITY_LOCAL.toArray()}>
          <mesh ref={marker}>
            <sphereGeometry args={[0.22, 16, 16]} />
            <meshStandardMaterial
              color={COLORS.explosion}
              emissive={COLORS.explosion}
              emissiveIntensity={3}
              toneMapped={false}
            />
          </mesh>
          <MarkerPulse />
        </group>
      </group>
    </>
  )
}

// A ring that expands and fades outward from the city marker, like a radar ping.
function MarkerPulse() {
  const ring = useRef<Mesh>(null)
  useFrame(({ clock }) => {
    if (!ring.current) return
    const t = (clock.elapsedTime % 1.6) / 1.6
    const s = 0.3 + t * 2.4
    ring.current.scale.set(s, s, s)
    const mat = ring.current.material as { opacity: number }
    mat.opacity = (1 - t) * 0.7
    // Orient the ring flat against the sphere surface (face outward).
    ring.current.lookAt(0, 0, 0)
  })
  return (
    <mesh ref={ring}>
      <ringGeometry args={[0.5, 0.62, 32]} />
      <meshBasicMaterial color={COLORS.explosion} transparent opacity={0.6} side={2} depthWrite={false} />
    </mesh>
  )
}
