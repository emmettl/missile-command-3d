import { describe, expect, it } from 'vitest'
import { Vector3 } from 'three'
import { applyDodge, maybeSplit, newIncoming, splitChild } from './incoming'
import { EXPLOSION_MAX_RADIUS } from './constants'
import type { Explosion } from './types'

const pick = () => ({ x: 8, id: 'city-2' })

describe('newIncoming', () => {
  it('builds a MIRV that can split once and does not dodge', () => {
    const m = newIncoming(3, 5, 'city-1', 'mirv')
    expect(m.kind).toBe('mirv')
    expect(m.splitsLeft).toBe(1)
    expect(m.dodge).toBe(false)
  })

  it('builds a smart bomb that dodges, never splits, and flies faster', () => {
    const smart = newIncoming(1, -5, 'bat-c', 'smart')
    const plain = newIncoming(1, -5, 'bat-c')
    expect(smart.dodge).toBe(true)
    expect(smart.splitsLeft).toBe(0)
    expect(smart.speed).toBeGreaterThan(plain.speed)
  })

  it('keeps the incoming depth band within the explosion radius (fair interception)', () => {
    let maxStartZ = 0
    let maxTargetZ = 0
    for (let i = 0; i < 4000; i++) {
      const m = newIncoming(3, 5, 'city-1', i % 3 === 0 ? 'smart' : 'normal')
      maxStartZ = Math.max(maxStartZ, Math.abs(m.start.z))
      maxTargetZ = Math.max(maxTargetZ, Math.abs(m.target.z))
    }
    expect(maxStartZ).toBeLessThanOrEqual(2.5)
    expect(maxTargetZ).toBeLessThanOrEqual(1)
    // The deepest lane must still be reachable by a z=0 blast.
    expect(maxStartZ).toBeLessThan(EXPLOSION_MAX_RADIUS)
  })
})

describe('maybeSplit', () => {
  it('does not split above the split altitude', () => {
    const m = newIncoming(2, 0, 'city-0', 'mirv')
    m.pos.y = m.splitAltitude + 2
    expect(maybeSplit(m, pick)).toHaveLength(0)
  })

  it('releases 2-3 plain warheads at the parent position, then is spent', () => {
    const m = newIncoming(2, 0, 'city-0', 'mirv')
    m.pos.set(3, m.splitAltitude - 0.5, 1.2)
    const kids = maybeSplit(m, pick)
    expect(kids.length).toBeGreaterThanOrEqual(2)
    expect(kids.length).toBeLessThanOrEqual(3)
    expect(kids.every((k) => k.kind === 'normal' && k.splitsLeft === 0)).toBe(true)
    expect(kids.every((k) => k.pos.equals(m.pos))).toBe(true)
    expect(m.splitsLeft).toBe(0)
    expect(maybeSplit(m, pick)).toHaveLength(0) // cannot split again
  })
})

describe('splitChild', () => {
  it('inherits the parent position and is a plain warhead', () => {
    const from = new Vector3(3, 12, 1.7)
    const kid = splitChild(from, 8, 'city-2', 4)
    expect(kid.pos.equals(from)).toBe(true)
    expect(kid.kind).toBe('normal')
    expect(kid.splitsLeft).toBe(0)
  })
})

describe('applyDodge', () => {
  const blast = (x: number): Explosion => ({
    id: 1,
    pos: new Vector3(x, 10, 0),
    age: 0,
    radius: 1,
    dead: false,
    kind: 'blast',
  })

  it('veers a smart bomb away from a nearby blast', () => {
    const m = newIncoming(3, 0, 'city-0', 'smart')
    m.pos.set(0, 10, 0)
    applyDodge(m, [blast(-2)], 0.1) // blast to the left → move right
    expect(m.pos.x).toBeGreaterThan(0)
  })

  it('leaves a plain warhead unaffected', () => {
    const m = newIncoming(3, 0, 'city-0')
    m.pos.set(0, 10, 0)
    applyDodge(m, [blast(-2)], 0.1)
    expect(m.pos.x).toBe(0)
  })

  it('is a no-op when no blast is in range', () => {
    const m = newIncoming(3, 0, 'city-0', 'smart')
    m.pos.set(0, 10, 0)
    applyDodge(m, [blast(20)], 0.1)
    expect(m.pos.x).toBe(0)
  })
})
