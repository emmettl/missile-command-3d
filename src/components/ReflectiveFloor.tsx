import { MeshReflectorMaterial } from '@react-three/drei'

// A dark, softly-blurred reflective plane under the grid. The emissive cities,
// missiles, and explosions cast glowing reflections that ground them on the floor.
export function ReflectiveFloor({ distance }: { distance: number }) {
  // Big enough that its edge never comes into frame, however far the camera pulls back.
  const extent = Math.max(220, distance * 5)
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, -6]}>
      <planeGeometry args={[extent, extent]} />
      <MeshReflectorMaterial
        resolution={1024}
        mirror={0.75}
        mixStrength={3.4}
        blur={[300, 140]}
        mixBlur={1}
        roughness={0.85}
        depthScale={1.1}
        minDepthThreshold={0.3}
        maxDepthThreshold={1.4}
        color="#0a1426"
        metalness={0.6}
      />
    </mesh>
  )
}
