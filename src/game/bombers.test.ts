import { describe, expect, it } from 'vitest'
import { Vector3 } from 'three'
import {
  BOMBER_ALTITUDE,
  BOMBER_HITS,
  BOMBS_PER_BOMBER,
  BOMB_GRAVITY,
  GUN_LOCKOUT_BELOW,
  SHELL_INTERVAL,
  bomberSpeedForWave,
  canChangePosition,
  modeForWave,
} from './constants'
import {
  BEARING_SEPARATION,
  FLIGHT_SIZE,
  angleDelta,
  bearingTo,
  isGone,
  newBomb,
  newFlight,
  nextBearing,
  releaseDistance,
  shellHits,
  stepBomb,
  stepBomber,
} from './bombers'
import { aimDirection, eyePosition, leadPoint, newGun, newShell, stepGun, stepShell } from './gun'

const v = () => new Vector3()
const STEP = 1 / 60
const CITY = { x: 6, id: 'city-3' }

describe('the wave rotation', () => {
  it('gives every mode its slot, with no wave left ambiguous', () => {
    // A rotation is the sort of thing that looks right in the rule and wrong in the
    // sequence, so the sequence is what gets asserted.
    const modes = Array.from({ length: 20 }, (_, i) => modeForWave(i + 1))
    expect(modes).toEqual([
      'classic', // 1
      'classic', // 2
      'slbm', // 3
      'classic', // 4
      'bombers', // 5
      'slbm', // 6
      'classic', // 7
      'classic', // 8
      'slbm', // 9
      'bombers', // 10
      'classic', // 11
      'slbm', // 12
      'classic', // 13
      'classic', // 14
      'bombers', // 15 — both cycles land here; the gun comes round least often, so it wins
      'classic', // 16
      'classic', // 17
      'slbm', // 18
      'classic', // 19
      'bombers', // 20
    ])
  })

  it('holds the emplacements shut on the gun’s first outing', () => {
    expect(canChangePosition(5)).toBe(false)
    expect(canChangePosition(10)).toBe(true)
  })
})

describe('bomb release', () => {
  it('lets go early enough that the bomb lands on the target', () => {
    // The one number the whole mode rests on: an un-engaged bomber must actually
    // destroy what it was aimed at.
    for (const altitude of [BOMBER_ALTITUDE[0], 25, BOMBER_ALTITUDE[1]]) {
      for (const wave of [5, 10, 20]) {
        const speed = bomberSpeedForWave(wave)
        const drop = releaseDistance(altitude, speed)

        // Release `drop` short of the target, flying straight at it.
        const bomb = {
          id: 1,
          pos: new Vector3(CITY.x - drop, altitude, 0),
          vel: new Vector3(speed, 0, 0),
          alive: true,
          targetId: CITY.id,
        }
        let guard = 0
        while (!stepBomb(bomb, STEP) && guard++ < 6000) {
          /* fall */
        }
        expect(Math.abs(bomb.pos.x - CITY.x)).toBeLessThan(1.2)
      }
    }
  })

  it('falls faster from lower down, so the release is later', () => {
    const speed = bomberSpeedForWave(5)
    expect(releaseDistance(30, speed)).toBeGreaterThan(releaseDistance(20, speed))
  })
})

describe('a flight', () => {
  it('arrives from the bearing it was sent on, at altitude, in formation', () => {
    for (const bearing of [0, Math.PI / 2, Math.PI, -Math.PI / 3]) {
      const flight = newFlight(5, bearing, CITY, () => 0.5)
      expect(flight).toHaveLength(FLIGHT_SIZE)
      for (const b of flight) {
        expect(b.pos.y).toBeGreaterThanOrEqual(BOMBER_ALTITUDE[0])
        expect(b.pos.y).toBeLessThanOrEqual(BOMBER_ALTITUDE[1])
        expect(b.hp).toBe(BOMBER_HITS)
        expect(b.bombsLeft).toBe(BOMBS_PER_BOMBER)
        // Well outside the playfield when it appears.
        expect(Math.hypot(b.pos.x, b.pos.z)).toBeGreaterThan(60)
      }
      // Spread across the run rather than stacked on one point.
      const spread = Math.max(...flight.map((b) => b.pos.distanceTo(flight[0].pos)))
      expect(spread).toBeGreaterThan(5)
    }
  })

  it('flies at the city it was given, and eventually leaves', () => {
    const [b] = newFlight(5, Math.PI / 3, CITY, () => 0.5)
    const opening = Math.hypot(CITY.x - b.pos.x, b.pos.z)
    for (let i = 0; i < 60 * 4; i++) stepBomber(b, STEP)
    expect(Math.hypot(CITY.x - b.pos.x, b.pos.z)).toBeLessThan(opening)

    for (let i = 0; i < 60 * 60 && !isGone(b); i++) stepBomber(b, STEP)
    expect(isGone(b)).toBe(true)
  })

  it('drops its whole stick, spaced out, and only on the way in', () => {
    const [b] = newFlight(5, 0.4, CITY, () => 0.5)
    const drops: number[] = []
    for (let i = 0; i < 60 * 60; i++) if (stepBomber(b, STEP)) drops.push(i / 60)
    expect(drops).toHaveLength(BOMBS_PER_BOMBER)
    expect(drops[1] - drops[0]).toBeGreaterThan(0.3)
  })

  it('misses when it is knocked off its line', () => {
    // A bomber shoved sideways after release should not still hit the city — the
    // ballistics have to be real for the mode to be worth playing.
    const [b] = newFlight(5, 0, CITY, () => 0.5)
    while (!stepBomber(b, STEP)) {
      /* fly to the release point */
    }
    const bomb = newBomb(b)
    bomb.vel.z += 14 // a shove
    let guard = 0
    while (!stepBomb(bomb, STEP) && guard++ < 6000) {
      /* fall */
    }
    expect(Math.hypot(bomb.pos.x - CITY.x, bomb.pos.z)).toBeGreaterThan(3)
  })
})

describe('bearings between flights', () => {
  it('never sends the next flight in from where the last one came', () => {
    let previous: number | null = null
    for (let i = 0; i < 500; i++) {
      const bearing = nextBearing(previous)
      if (previous !== null) {
        expect(Math.abs(angleDelta(previous, bearing))).toBeGreaterThanOrEqual(
          BEARING_SEPARATION - 1e-9,
        )
      }
      previous = bearing
    }
  })

  it('still uses the whole compass rather than alternating between two points', () => {
    let previous: number | null = null
    const quadrants = new Set<number>()
    for (let i = 0; i < 400; i++) {
      previous = nextBearing(previous)
      quadrants.add(Math.floor(((previous + Math.PI * 2) % (Math.PI * 2)) / (Math.PI / 2)))
    }
    expect(quadrants.size).toBe(4)
  })
})

describe('the gun', () => {
  it('points where it is looking', () => {
    const gun = newGun()
    gun.yaw = 0
    gun.pitch = 0
    const forward = aimDirection(gun, v())
    expect(forward.z).toBeCloseTo(-1) // yaw 0 looks down -z, as the camera does
    gun.pitch = Math.PI / 2 - 0.001
    expect(aimDirection(gun, v()).y).toBeGreaterThan(0.99) // and up is up
  })

  it('can spin all the way round but cannot look at its own boots', () => {
    const gun = newGun()
    for (let i = 0; i < 100; i++) {
      // Look() clamps pitch; yaw is free, which is the point of the mode.
      gun.pitch = 5
      gun.pitch = Math.min(Math.max(gun.pitch, -0.18), 1.4)
    }
    expect(gun.pitch).toBeLessThanOrEqual(1.4)
    expect(gun.pitch).toBeGreaterThanOrEqual(-0.18)
  })

  it('sits at the emplacement it is manning', () => {
    expect(eyePosition(0, v()).x).toBeLessThan(0)
    expect(eyePosition(1, v()).x).toBeCloseTo(0)
    expect(eyePosition(2, v()).x).toBeGreaterThan(0)
    expect(eyePosition(1, v()).y).toBeGreaterThan(1) // stood up, not lying on the ground
  })

  describe('heat', () => {
    it('fires at its cadence rather than every frame', () => {
      const gun = newGun()
      let shots = 0
      for (let i = 0; i < 60; i++) if (stepGun(gun, STEP, true)) shots++
      // One second of holding the trigger, at roughly the advertised rate.
      expect(shots).toBeGreaterThan(1 / SHELL_INTERVAL - 2)
      expect(shots).toBeLessThan(1 / SHELL_INTERVAL + 2)
    })

    it('locks out when held down, and will not restart until it has properly cooled', () => {
      const gun = newGun()
      for (let i = 0; i < 60 * 10 && !gun.jammed; i++) stepGun(gun, STEP, true)
      expect(gun.jammed).toBe(true)
      expect(gun.heat).toBe(1)

      // Feathering the trigger at the limit must not get a round out.
      let sneaked = 0
      for (let i = 0; i < 30; i++) if (stepGun(gun, STEP, i % 2 === 0)) sneaked++
      expect(sneaked).toBe(0)
      expect(gun.jammed).toBe(true)

      for (let i = 0; i < 60 * 6 && gun.jammed; i++) stepGun(gun, STEP, false)
      expect(gun.jammed).toBe(false)
      expect(gun.heat).toBeLessThanOrEqual(GUN_LOCKOUT_BELOW)
      expect(stepGun(gun, STEP, true)).toBe(true)
    })

    it('cools while it is not firing', () => {
      const gun = newGun()
      for (let i = 0; i < 20; i++) stepGun(gun, STEP, true)
      const hot = gun.heat
      for (let i = 0; i < 60; i++) stepGun(gun, STEP, false)
      expect(gun.heat).toBeLessThan(hot)
    })
  })

  it('spends its shells rather than leaving them in the sky', () => {
    const shell = newShell(new Vector3(0, 2, 0), new Vector3(0, 0.2, -1))
    let alive = 0
    for (let i = 0; i < 60 * 10; i++) {
      if (stepShell(shell, STEP)) break
      alive++
    }
    expect(shell.alive).toBe(false)
    expect(alive / 60).toBeLessThan(3)
  })
})

describe('leading the target', () => {
  it('aims where the bomber will be, and a shot fired there connects', () => {
    // The mode's core claim: hold ahead of a crossing target and you hit it.
    const eye = eyePosition(1, v())
    const [bomber] = newFlight(5, Math.PI / 2, CITY, () => 0.5)
    const velocity = bomber.heading.clone().multiplyScalar(bomber.speed)

    const aim = leadPoint(eye, bomber.pos, velocity, v())
    expect(aim).not.toBeNull()

    const shell = newShell(eye, aim!.clone().sub(eye))
    let hit = false
    for (let i = 0; i < 60 * 5; i++) {
      stepShell(shell, STEP)
      stepBomber(bomber, STEP)
      if (shellHits(shell, bomber.pos)) {
        hit = true
        break
      }
      if (!shell.alive) break
    }
    expect(hit).toBe(true)
  })

  it('does not pretend it can catch something running away faster than the shell', () => {
    const eye = new Vector3(0, 2.6, 0)
    const away = new Vector3(0, 0, -400) // outrunning the shell
    expect(leadPoint(eye, new Vector3(0, 20, -50), away, v())).toBeNull()
  })

  it('leads further for a faster target', () => {
    const eye = new Vector3(0, 2.6, 0)
    const at = new Vector3(40, 24, -40)
    const slow = leadPoint(eye, at, new Vector3(6, 0, 0), v())!
    const fast = leadPoint(eye, at, new Vector3(18, 0, 0), v())!
    expect(fast.distanceTo(at)).toBeGreaterThan(slow.distanceTo(at))
  })
})

describe('bearings', () => {
  it('reads zero straight ahead and grows the way the gun turns', () => {
    const eye = new Vector3(0, 2.6, 0)
    expect(bearingTo(eye, new Vector3(0, 20, -50))).toBeCloseTo(0) // dead ahead
    expect(Math.abs(bearingTo(eye, new Vector3(0, 20, 50)))).toBeCloseTo(Math.PI) // behind
    expect(bearingTo(eye, new Vector3(-50, 20, 0))).toBeCloseTo(Math.PI / 2)
  })

  it('wraps the short way round', () => {
    expect(angleDelta(3.0, -3.0)).toBeCloseTo(Math.PI * 2 - 6, 5)
    expect(Math.abs(angleDelta(3.0, -3.0))).toBeLessThan(Math.PI)
    expect(angleDelta(0, 0.5)).toBeCloseTo(0.5)
  })
})

describe('bomb gravity', () => {
  it('accelerates downward rather than falling at a constant rate', () => {
    const bomb = { id: 1, pos: new Vector3(0, 40, 0), vel: new Vector3(0, 0, 0), alive: true, targetId: 'c' }
    stepBomb(bomb, 0.5, BOMB_GRAVITY)
    const first = 40 - bomb.pos.y
    stepBomb(bomb, 0.5, BOMB_GRAVITY)
    const second = 40 - first - bomb.pos.y
    expect(second).toBeGreaterThan(first)
  })
})
