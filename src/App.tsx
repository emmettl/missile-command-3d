import { Canvas } from '@react-three/fiber'
import { Scene } from './components/Scene'
import { HUD } from './ui/HUD'
import { Overlay } from './ui/Overlay'

export default function App() {
  return (
    <div className="app">
      <Canvas
        dpr={[1, 2]}
        gl={{ antialias: true }}
        camera={{ position: [0, 12, 36], fov: 50, near: 0.1, far: 200 }}
      >
        <Scene />
      </Canvas>
      <HUD />
      <Overlay />
    </div>
  )
}
