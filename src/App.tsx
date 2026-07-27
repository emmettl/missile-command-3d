import { useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { Bloom, EffectComposer } from '@react-three/postprocessing'
import { Scene } from './components/Scene'
import { IntroScene } from './components/IntroScene'
import { AdaptiveRenderScale } from './components/AdaptiveRenderScale'
import { HUD } from './ui/HUD'
import { Overlay } from './ui/Overlay'
import { IntroOverlay } from './ui/IntroOverlay'
import { BonusToast, FlashOverlay, WaveBanner } from './ui/GameBanners'
import { RotateHint } from './ui/RotateHint'
import { isMobile, quality } from './game/device'
import { START_FACTOR } from './game/renderScale'
import { useRenderDpr } from './game/useRenderDpr'
import { useGameStore } from './game/useGameStore'

export default function App() {
  const status = useGameStore((s) => s.status)
  const inIntro = status === 'menu' || status === 'launching'
  // Rendering opens at a pixel-budget cap, so a maximised window on a dense display
  // never asks the GPU for four times the frame it can fill, and then follows the frame
  // rate this machine actually achieves — down if it struggles, back up towards the
  // display's native ratio if it doesn't. See renderScale.ts.
  const [factor, setFactor] = useState(START_FACTOR)
  const dpr = useRenderDpr(factor)

  return (
    <div className="app">
      <Canvas
        dpr={dpr}
        gl={{ antialias: !isMobile, powerPreference: 'high-performance' }}
        camera={{ position: [0, 2.4, 22], fov: 50, near: 0.1, far: 600 }}
      >
        {inIntro ? <IntroScene /> : <Scene />}
        <AdaptiveRenderScale onFactor={setFactor} />
        <EffectComposer>
          <Bloom
            mipmapBlur
            intensity={quality.bloomIntensity}
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
      <RotateHint />
    </div>
  )
}
