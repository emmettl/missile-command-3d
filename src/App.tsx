import { Canvas } from '@react-three/fiber'
import { Bloom, EffectComposer } from '@react-three/postprocessing'
import { Scene } from './components/Scene'
import { IntroScene } from './components/IntroScene'
import { HUD } from './ui/HUD'
import { Overlay } from './ui/Overlay'
import { IntroOverlay } from './ui/IntroOverlay'
import { BonusToast, FlashOverlay, WaveBanner } from './ui/GameBanners'
import { useGameStore } from './game/useGameStore'

export default function App() {
  const status = useGameStore((s) => s.status)
  const inIntro = status === 'menu' || status === 'launching'

  return (
    <div className="app">
      <Canvas
        dpr={[1, 2]}
        gl={{ antialias: true }}
        camera={{ position: [0, 2.4, 22], fov: 50, near: 0.1, far: 200 }}
      >
        {inIntro ? <IntroScene /> : <Scene />}
        <EffectComposer>
          <Bloom
            mipmapBlur
            intensity={0.9}
            luminanceThreshold={0.25}
            luminanceSmoothing={0.9}
          />
        </EffectComposer>
      </Canvas>
      <HUD />
      <IntroOverlay />
      <Overlay />
      <WaveBanner />
      <BonusToast />
      <FlashOverlay />
    </div>
  )
}
