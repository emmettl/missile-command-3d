import { useRef } from 'react'
import { Vector2 } from 'three'
import {
  Bloom,
  ChromaticAberration,
  EffectComposer,
  HueSaturation,
  Noise,
  Vignette,
} from '@react-three/postprocessing'
import { BlendFunction } from 'postprocessing'
import { quality } from '../game/device'
import { START_FACTOR } from '../game/renderScale'

// The colour grade for the whole game.
//
// Bloom on its own gives clean, bright neon on flat black, which is a different look
// from the one this is after: a backlit tactical display, where the colour is soft and
// slightly bled and the corners fall away into the dark. The rest of the stack is what
// does that — a little more saturation so the hues have somewhere to bleed to, a lens
// offset that separates the channels by well under a pixel, grain, and a vignette.
//
// Kept deliberately just-noticeable. Every one of these is a full-screen pass over a
// frame whose size is already budgeted (see renderScale.ts), and the point is a haze
// over the picture, not an effect on top of it.

const ABERRATION = new Vector2(0.00055, 0.00042)

/**
 * @param factor Measured performance from `AdaptiveRenderScale`. Below the opening
 * guess the machine has already been caught dropping frames, and the softer half of the
 * grade is the first thing that should go — a vignette and a little saturation carry
 * most of the look, and neither costs anything worth measuring.
 */
export function Grade({ factor = START_FACTOR }: { factor?: number }) {
  // Latched: once a machine has shown it cannot afford the extras, they stay off. The
  // composer rebuilds its passes when this list changes, so it must not be able to
  // oscillate — a hitch every time the frame rate wobbles would cost more than it saves.
  const dropped = useRef(false)
  if (factor < START_FACTOR) dropped.current = true
  const rich = quality.richGrade && !dropped.current

  return (
    <EffectComposer>
      <Bloom
        mipmapBlur
        intensity={quality.bloomIntensity}
        luminanceThreshold={0.25}
        luminanceSmoothing={0.9}
      />
      {/* Pushes the cyans and reds apart a little so the wash reads as colour rather
          than as brightness. */}
      <HueSaturation saturation={0.14} hue={0} />
      {rich ? (
        <ChromaticAberration
          offset={ABERRATION}
          radialModulation
          modulationOffset={0.35}
          blendFunction={BlendFunction.NORMAL}
        />
      ) : (
        <></>
      )}
      {rich ? <Noise premultiply opacity={0.035} blendFunction={BlendFunction.OVERLAY} /> : <></>}
      <Vignette offset={0.26} darkness={0.72} eskil={false} />
    </EffectComposer>
  )
}
