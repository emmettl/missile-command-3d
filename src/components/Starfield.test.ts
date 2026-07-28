import { describe, expect, it } from 'vitest'
import { DOME_RADIUS, starPoints } from './Starfield'

// The starfield was wrong twice in the same way, and it is the sort of wrong you only see
// in a screenshot: stars scattered across the ground, mistakable for grain or for lights
// on the map. Both times the cause was a star sitting below the camera. On a dome carried
// with the camera that is a geometric impossibility rather than a tuning problem, which
// is worth a test precisely because there is nothing left in the code to read.

const each = (a: Float32Array, i: number) => [a[i * 3], a[i * 3 + 1], a[i * 3 + 2]] as const

describe('star dome', () => {
  it('puts no star below the horizon', () => {
    const { position } = starPoints(4000, 0.2, 1, true)
    for (let i = 0; i < 4000; i++) expect(each(position, i)[1]).toBeGreaterThanOrEqual(0)
  })

  it('goes all the way round in orbit, where there is no horizon', () => {
    const { position } = starPoints(4000, 0.2, 1, false)
    let below = 0
    for (let i = 0; i < 4000; i++) if (each(position, i)[1] < 0) below++
    // Uniform over the sphere, so about half — loose bounds, this is only asserting that
    // the lower half is populated at all.
    expect(below).toBeGreaterThan(1500)
    expect(below).toBeLessThan(2500)
  })

  it('keeps every star on the dome, so none is close enough to read as an object', () => {
    const { position } = starPoints(500, 0.2, 1, true)
    for (let i = 0; i < 500; i++) {
      expect(Math.hypot(...each(position, i))).toBeCloseTo(DOME_RADIUS, 2)
    }
  })

  it('hazes the lowest stars out rather than cutting them off at the horizon', () => {
    const { position, color } = starPoints(6000, 0.6, 1, true)
    let lowest = { y: Infinity, brightness: 0 }
    let highest = { y: -Infinity, brightness: 0 }
    for (let i = 0; i < 6000; i++) {
      const y = each(position, i)[1]
      const brightness = Math.max(...each(color, i))
      if (y < lowest.y) lowest = { y, brightness }
      if (y > highest.y) highest = { y, brightness }
    }
    // The floor of the magnitude range is 0.6, so a star dimmer than that has been hazed.
    expect(lowest.brightness).toBeLessThan(0.2)
    expect(highest.brightness).toBeGreaterThan(0.3)
  })
})
