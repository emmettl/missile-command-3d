import { describe, expect, it } from 'vitest'
import { Vector3 } from 'three'
import { CAMERA_FOV, cameraPosition, computeCameraFit, framedBox } from './cameraFit'
import { FIELD, SEA, SLBM_APEX_MAX } from '../game/constants'

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

// --- Offshore framing --------------------------------------------------------------
// The classic view is head-on, so "does it fit" is one-dimensional. The SLBM view is
// swung round and tilted down, so the only honest check is the real one: build the
// camera basis the rig will build, and project the corners of the promised volume
// through it.

function seesPoint(aspect: number, p: Vector3): boolean {
  const fit = computeCameraFit(aspect, 'slbm')
  const cam = new Vector3().copy(cameraPosition(fit, new Vector3()))
  const forward = new Vector3(fit.centerX, fit.lookY, 0).sub(cam).normalize()
  const right = forward.clone().cross(new Vector3(0, 1, 0)).normalize()
  const up = right.clone().cross(forward).normalize()

  const rel = p.clone().sub(cam)
  const depth = rel.dot(forward)
  if (depth <= 0) return false // behind the camera
  const tan = Math.tan((CAMERA_FOV * Math.PI) / 180 / 2)
  return Math.abs(rel.dot(up)) <= tan * depth && Math.abs(rel.dot(right)) <= tan * aspect * depth
}

const ASPECTS_WIDE = [21 / 9, 16 / 9, 16 / 10, 4 / 3, 1, 3 / 4, 390 / 844]

describe('offshore camera fit', () => {
  it.each(ASPECTS_WIDE)('keeps the whole theatre on screen at aspect %f', (aspect) => {
    const box = framedBox('slbm')
    for (const x of [box.minX, box.maxX]) {
      for (const y of [box.minY, box.maxY]) {
        for (const z of [-box.halfDepth, box.halfDepth]) {
          expect(seesPoint(aspect, new Vector3(x, y, z))).toBe(true)
        }
      }
    }
  })

  it.each(ASPECTS_WIDE)('holds the water, the coast and the top of an arc at %f', (aspect) => {
    // The three things the mode is actually about.
    expect(seesPoint(aspect, new Vector3(SEA.minX, 0, SEA.halfDepth))).toBe(true)
    expect(seesPoint(aspect, new Vector3(FIELD.maxX, 0, 0))).toBe(true)
    expect(seesPoint(aspect, new Vector3(-40, SLBM_APEX_MAX, 0))).toBe(true)
  })

  it('swings the camera round so the coast sits to the right of the ocean', () => {
    const fit = computeCameraFit(16 / 9, 'slbm')
    const cam = new Vector3().copy(cameraPosition(fit, new Vector3()))
    const forward = new Vector3(fit.centerX, fit.lookY, 0).sub(cam).normalize()
    const right = forward.clone().cross(new Vector3(0, 1, 0)).normalize()

    const coast = new Vector3(FIELD.maxX, 0, 0).sub(cam).dot(right)
    const ocean = new Vector3(SEA.minX, 0, 0).sub(cam).dot(right)
    expect(coast).toBeGreaterThan(0) // right of frame
    expect(ocean).toBeLessThan(0) // left of frame
    expect(coast).toBeGreaterThan(ocean)
  })

  it('puts the coast nearer the camera than the open sea', () => {
    const fit = computeCameraFit(16 / 9, 'slbm')
    const cam = new Vector3().copy(cameraPosition(fit, new Vector3()))
    // Perspective is what stops a 130-unit ocean squashing the cities into nothing.
    expect(cam.distanceTo(new Vector3(FIELD.maxX, 0, 0))).toBeLessThan(
      cam.distanceTo(new Vector3(SEA.minX, 0, 0)),
    )
  })

  it('looks down on the water rather than along it', () => {
    const fit = computeCameraFit(16 / 9, 'slbm')
    expect(fit.cameraY).toBeGreaterThan(fit.lookY)
    expect(fit.cameraY).toBeGreaterThan(computeCameraFit(16 / 9).cameraY)
  })

  it('leaves the classic view exactly as it was', () => {
    const classic = computeCameraFit(16 / 9)
    expect(classic.yaw).toBe(0)
    expect(classic.centerX).toBe(0)
    expect(classic.cameraY).toBeCloseTo(10 + classic.distance * 0.09)
    expect(classic.lookY).toBeCloseTo(8.5)
  })
})
