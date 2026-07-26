import { describe, expect, it } from 'vitest'
import { CAMERA_FOV, computeCameraFit } from './cameraFit'
import { FIELD } from '../game/constants'

// Half-width/height actually visible at the playfield plane for a given fit.
function visible(aspect: number) {
  const fit = computeCameraFit(aspect)
  const t = Math.tan((CAMERA_FOV * Math.PI) / 180 / 2)
  const halfHeight = fit.distance * t
  return { fit, halfHeight, halfWidth: halfHeight * aspect }
}

const ASPECTS = {
  desktop: 1600 / 900,
  iPhonePortrait: 390 / 844,
  iPhoneLandscape: 844 / 390,
  iPadPortrait: 820 / 1180,
  square: 1,
  veryNarrow: 320 / 900,
}

describe('computeCameraFit', () => {
  it.each(Object.entries(ASPECTS))(
    'keeps the whole playfield width on screen at %s aspect',
    (_name, aspect) => {
      const { halfWidth } = visible(aspect)
      // Every missile spawn x is clamped to the field bounds, so they must all fit.
      expect(halfWidth).toBeGreaterThanOrEqual(Math.abs(FIELD.maxX))
      expect(halfWidth).toBeGreaterThanOrEqual(Math.abs(FIELD.minX))
    },
  )

  it.each(Object.entries(ASPECTS))(
    'keeps the ground and the missile spawn line in frame at %s aspect',
    (_name, aspect) => {
      const { fit, halfHeight } = visible(aspect)
      const top = fit.cameraY + halfHeight
      const bottom = fit.cameraY - halfHeight
      expect(top).toBeGreaterThanOrEqual(FIELD.skyY) // spawn line visible
      expect(bottom).toBeLessThanOrEqual(FIELD.groundY) // ground visible
    },
  )

  it('pulls the camera back as the viewport narrows', () => {
    const wide = computeCameraFit(ASPECTS.iPhoneLandscape).distance
    const narrow = computeCameraFit(ASPECTS.iPhonePortrait).distance
    expect(narrow).toBeGreaterThan(wide)
  })

  it('keeps fog behind the action so pulling back never buries the scene', () => {
    for (const aspect of Object.values(ASPECTS)) {
      const fit = computeCameraFit(aspect)
      // The far side of the playfield must sit nearer than where fog fully closes in.
      expect(fit.fogFar).toBeGreaterThan(fit.distance)
      expect(fit.fogNear).toBeLessThan(fit.fogFar)
    }
  })

  it('degrades gracefully on a zero-height viewport', () => {
    expect(Number.isFinite(computeCameraFit(0).distance)).toBe(true)
  })
})
