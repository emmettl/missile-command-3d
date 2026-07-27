import { Vector3 } from 'three'
import {
  BOMBER_ALTITUDE,
  BOMBER_HALF_SPAN,
  BOMBER_HITS,
  BOMBER_RUN_RADIUS,
  BOMBS_PER_BOMBER,
  BOMB_GRAVITY,
  SHELL_BURST_RADIUS,
  bomberSpeedForWave,
} from './constants'
import type { Bomb, Bomber, Shell } from './types'

// The other side of BOMBERS INCOMING: what comes over, from where, and when it lets go.
//
// A run is deliberately simple — straight line, fixed altitude, one assigned target —
// because the difficulty of the mode is meant to live in *finding* the formation and
// leading it, not in second-guessing what it will do next.

let nextId = 1
const genId = () => nextId++

type Rng = () => number

/** Aircraft in a flight, and how far apart they sit across the formation. */
export const FLIGHT_SIZE = 3
const FLIGHT_SPACING = 7
const FLIGHT_STAGGER = 5 // metres of trail, so a formation reads as a wedge

/**
 * How far short of the target a bomb must be released.
 *
 * A bomb keeps the aircraft's forward speed, so it travels while it falls: the fall
 * takes sqrt(2h/g), and it covers speed × that in the meantime. Getting this right is
 * what makes an un-engaged bomber actually destroy the city it was aimed at, and what
 * makes one knocked off its line miss.
 */
export function releaseDistance(altitude: number, speed: number, gravity = BOMB_GRAVITY): number {
  return speed * Math.sqrt((2 * altitude) / gravity)
}

export interface TargetPick {
  x: number
  id: string
}

/**
 * A flight, inbound on a bearing. Each aircraft is given the same target and a place in
 * the formation; the bearing is the wave's business, so it is passed in rather than
 * rolled here — that is what lets a wave put two flights on opposite sides of you.
 */
export function newFlight(
  wave: number,
  bearing: number,
  target: TargetPick,
  rng: Rng = Math.random,
): Bomber[] {
  const speed = bomberSpeedForWave(wave)
  const altitude = BOMBER_ALTITUDE[0] + rng() * (BOMBER_ALTITUDE[1] - BOMBER_ALTITUDE[0])

  // Inbound from `bearing`, flying straight at the target so the run passes over it.
  const entry = new Vector3(
    target.x + Math.sin(bearing) * BOMBER_RUN_RADIUS,
    altitude,
    Math.cos(bearing) * BOMBER_RUN_RADIUS,
  )
  const heading = new Vector3(target.x - entry.x, 0, -entry.z).normalize()
  // Across the formation, at right angles to the run.
  const across = new Vector3(-heading.z, 0, heading.x)

  return Array.from({ length: FLIGHT_SIZE }, (_, i) => {
    const lane = i - (FLIGHT_SIZE - 1) / 2
    const pos = entry
      .clone()
      .addScaledVector(across, lane * FLIGHT_SPACING)
      .addScaledVector(heading, -Math.abs(lane) * FLIGHT_STAGGER)
    return {
      id: genId(),
      pos,
      heading: heading.clone(),
      speed,
      hp: BOMBER_HITS,
      alive: true,
      bombsLeft: BOMBS_PER_BOMBER,
      stickTimer: 0,
      released: false,
      targetId: target.id,
      targetX: target.x,
    }
  })
}

/** The least a new flight's bearing may sit from the last one's. */
export const BEARING_SEPARATION = 1.5 // radians, a little under a quarter turn

/**
 * Where the next flight comes in from. Deliberately kept away from the last one: the
 * mode is about facing the wrong way, and a wave that queues everything up on one
 * bearing is just a shooting gallery you never have to turn round in.
 */
export function nextBearing(previous: number | null, rng: Rng = Math.random): number {
  const bearing = (rng() * Math.PI * 2) % (Math.PI * 2)
  if (previous === null) return bearing
  if (Math.abs(angleDelta(previous, bearing)) >= BEARING_SEPARATION) return bearing
  // Too close to the last one: push it round to the far side instead.
  return (previous + Math.PI + (rng() - 0.5) * (Math.PI - BEARING_SEPARATION)) % (Math.PI * 2)
}

/** Horizontal distance from an aircraft to the point it is aiming at. */
export function distanceToTarget(b: Bomber): number {
  return Math.hypot(b.targetX - b.pos.x, b.pos.z)
}

/**
 * Fly a bomber on for a frame. Returns true on the frames it lets a bomb go: once when
 * it reaches its release point, then again at intervals until the stick is empty.
 */
export function stepBomber(b: Bomber, dt: number): boolean {
  if (!b.alive) return false
  b.pos.addScaledVector(b.heading, b.speed * dt)

  if (b.bombsLeft <= 0) return false

  if (!b.released) {
    // Release only on the way in — once it is past, the moment has gone.
    const closing = b.heading.x * (b.targetX - b.pos.x) + b.heading.z * -b.pos.z > 0
    if (closing && distanceToTarget(b) <= releaseDistance(b.pos.y, b.speed)) {
      b.released = true
      b.bombsLeft -= 1
      b.stickTimer = 0.55
      return true
    }
    return false
  }

  b.stickTimer -= dt
  if (b.stickTimer <= 0) {
    b.bombsLeft -= 1
    b.stickTimer = 0.55
    return true
  }
  return false
}

/** Has this aircraft finished its business and left? */
export function isGone(b: Bomber): boolean {
  return b.pos.length() > BOMBER_RUN_RADIUS * 1.6
}

export function newBomb(b: Bomber): Bomb {
  return {
    id: genId(),
    pos: b.pos.clone(),
    // It leaves with the aircraft's velocity — that is the whole reason for the lead.
    vel: b.heading.clone().multiplyScalar(b.speed),
    alive: true,
    targetId: b.targetId,
  }
}

/** Advance a bomb. Returns true on the frame it reaches the ground. */
export function stepBomb(bomb: Bomb, dt: number, gravity = BOMB_GRAVITY): boolean {
  bomb.vel.y -= gravity * dt
  bomb.pos.addScaledVector(bomb.vel, dt)
  if (bomb.pos.y <= 0.3) {
    bomb.pos.y = 0.3
    bomb.alive = false
    return true
  }
  return false
}

/** Burst radius plus the target's own size — a near miss counts. */
export function shellHits(shell: Shell, at: Vector3, halfSpan = BOMBER_HALF_SPAN): boolean {
  return shell.pos.distanceTo(at) <= SHELL_BURST_RADIUS + halfSpan
}

/** Bearing of something, in radians, measured the way the gun's yaw is. */
export function bearingTo(from: Vector3, to: Vector3): number {
  return Math.atan2(-(to.x - from.x), -(to.z - from.z))
}

/** Shortest signed angle from `a` to `b`, wrapped to [-π, π]. */
export function angleDelta(a: number, b: number): number {
  let d = (b - a) % (Math.PI * 2)
  if (d > Math.PI) d -= Math.PI * 2
  if (d < -Math.PI) d += Math.PI * 2
  return d
}
