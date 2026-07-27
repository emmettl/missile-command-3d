import { Vector3 } from 'three'
import {
  FIELD,
  SEA,
  SLBM_APEX_MAX,
  SLBM_APEX_MIN,
  SLBM_APEX_RATIO,
  SUB_DIVING_TIME,
  SUB_SALVO,
  SUB_SALVO_INTERVAL,
  SUB_SUBMERGED_TIME,
  SUB_SURFACING_TIME,
  slbmSpeedForWave,
} from './constants'
import type { Arc, IncomingMissile, Submarine } from './types'

// The mechanics behind SLBM ATTACK, kept free of React and of three's scene graph so
// the interesting parts — where a lobbed warhead will be in two seconds, when a boat is
// killable — can be reasoned about and tested directly.

let nextId = 1
const genId = () => nextId++

type Rng = () => number

function between(range: readonly [number, number], rng: Rng): number {
  return range[0] + rng() * (range[1] - range[0])
}

// --- Ballistic arcs ---------------------------------------------------------------
//
// A missile on an arc is lerped from start to target while a parabola lifts it clear of
// the straight line between them. Everything about its flight is therefore a function
// of one number, `u = elapsed / duration`: no integration, no drift, and the position at
// any future moment is available for free — which is what makes leading a shot fair.

/** Height added above the straight line at progress `u` (0 at both ends, apex at ½). */
export function arcLift(apex: number, u: number): number {
  return apex * 4 * u * (1 - u)
}

/** Position along the arc at progress `u`, written into `out` to avoid allocating. */
export function arcPointAt(
  start: Vector3,
  target: Vector3,
  apex: number,
  u: number,
  out: Vector3,
): Vector3 {
  const t = Math.min(Math.max(u, 0), 1)
  out.lerpVectors(start, target, t)
  out.y += arcLift(apex, t)
  return out
}

/** Velocity along the arc at progress `u` — used to point warheads the way they fly. */
export function arcVelocityAt(
  start: Vector3,
  target: Vector3,
  arc: Arc,
  u: number,
  out: Vector3,
): Vector3 {
  const t = Math.min(Math.max(u, 0), 1)
  out.subVectors(target, start).divideScalar(arc.duration)
  out.y += (arc.apex * 4 * (1 - 2 * t)) / arc.duration
  return out
}

/**
 * An arc between two points at a given ground speed. Apex scales with the range so a
 * long shot from the horizon towers and a short one skims, within limits that keep even
 * the shortest lob visibly ballistic.
 */
export function makeArc(
  start: Vector3,
  target: Vector3,
  speed: number,
  apexRatio = SLBM_APEX_RATIO,
  apexMin = SLBM_APEX_MIN,
  apexMax = SLBM_APEX_MAX,
): Arc {
  const range = start.distanceTo(target)
  return {
    apex: Math.min(apexMax, Math.max(apexMin, range * apexRatio)),
    duration: Math.max(0.35, range / speed),
    elapsed: 0,
  }
}

/**
 * Where an arcing missile will be `lead` seconds from now — the honest answer to "what
 * should I be aiming at", and what the aim preview draws.
 */
export function positionAfter(m: IncomingMissile, lead: number, out: Vector3): Vector3 {
  if (!m.arc) return out.copy(m.pos).addScaledVector(headingOf(m, _dir), m.speed * lead)
  const u = (m.arc.elapsed + lead) / m.arc.duration
  return arcPointAt(m.start, m.target, m.arc.apex, u, out)
}

const _dir = new Vector3()
function headingOf(m: IncomingMissile, out: Vector3): Vector3 {
  return out.subVectors(m.target, m.pos).normalize()
}

// --- Submarines -------------------------------------------------------------------

/** 0 while running deep, 1 while fully surfaced; drives both the model and the risk. */
export function exposure(sub: Submarine): number {
  switch (sub.phase) {
    case 'submerged':
      return 0
    case 'surfacing':
      return 1 - Math.min(1, sub.timer / SUB_SURFACING_TIME)
    case 'firing':
      return 1
    case 'diving':
      return Math.min(1, sub.timer / SUB_DIVING_TIME)
  }
}

/**
 * Whether a strike would kill this boat. Deliberately less than fully surfaced: the
 * moment it breaks the water it has committed, and a player who reads the surfacing
 * animation and fires early deserves the kill.
 */
export const EXPOSED_THRESHOLD = 0.35
export function isExposed(sub: Submarine): boolean {
  return sub.alive && exposure(sub) >= EXPOSED_THRESHOLD
}

/** A station out at sea. Boats are spread along the band so they don't stack up. */
export function station(index: number, count: number, rng: Rng = Math.random): Vector3 {
  const slot = count > 1 ? index / (count - 1) : 0.5
  const x = SEA.minX + (SEA.maxX - SEA.minX) * (0.12 + slot * 0.76 + (rng() - 0.5) * 0.1)
  const z = (rng() - 0.5) * 2 * SEA.halfDepth
  return new Vector3(x, 0, z)
}

export function newSubmarine(index: number, count: number, rng: Rng = Math.random): Submarine {
  return {
    id: genId(),
    pos: station(index, count, rng),
    // Staggered so a wave doesn't open with every boat breaching at once.
    phase: 'submerged',
    timer: between(SUB_SUBMERGED_TIME, rng) * (0.3 + index * 0.35),
    salvoLeft: 0,
    fireTimer: 0,
    alive: true,
  }
}

/**
 * Advance one boat. Returns true on the frames it launches, leaving the caller to build
 * the missile — this file decides *when* a boat shoots, the loop decides at what.
 *
 * Mutates the submarine, in keeping with the rest of the simulation.
 */
export function stepSubmarine(sub: Submarine, dt: number, rng: Rng = Math.random): boolean {
  if (!sub.alive) return false
  sub.timer -= dt

  switch (sub.phase) {
    case 'submerged':
      if (sub.timer <= 0) {
        sub.phase = 'surfacing'
        sub.timer = SUB_SURFACING_TIME
      }
      return false

    case 'surfacing':
      if (sub.timer <= 0) {
        sub.phase = 'firing'
        sub.salvoLeft = Math.round(between(SUB_SALVO, rng))
        sub.fireTimer = 0.3
        sub.timer = Infinity // the salvo, not the clock, decides when to dive
      }
      return false

    case 'firing': {
      sub.fireTimer -= dt
      if (sub.fireTimer > 0) return false
      sub.salvoLeft -= 1
      sub.fireTimer = SUB_SALVO_INTERVAL
      if (sub.salvoLeft <= 0) {
        sub.phase = 'diving'
        sub.timer = SUB_DIVING_TIME
      }
      return true
    }

    case 'diving':
      if (sub.timer <= 0) {
        sub.phase = 'submerged'
        sub.timer = between(SUB_SUBMERGED_TIME, rng)
        // Slip away to a new station while out of sight, so kills have to be re-earned.
        sub.pos.x = SEA.minX + rng() * (SEA.maxX - SEA.minX)
        sub.pos.z = (rng() - 0.5) * 2 * SEA.halfDepth
      }
      return false
  }
}

/** How many launches a boat still owes the wave — retired when it is sunk. */
export function salvoRemaining(sub: Submarine): number {
  return sub.phase === 'firing' ? Math.max(0, sub.salvoLeft) : 0
}

// --- Launches ---------------------------------------------------------------------

/** A missile lobbed from a surfaced boat at a coastal target. */
export function newSlbm(
  wave: number,
  sub: Submarine,
  targetX: number,
  targetId: string,
): IncomingMissile {
  const start = new Vector3(sub.pos.x, 1.2, sub.pos.z)
  // Warheads converge on the engagement plane as they fly, so however far out to sea a
  // boat is sitting, the shot can be met where the player is aiming.
  const target = new Vector3(targetX, FIELD.groundY + 0.4, 0)
  const arc = makeArc(start, target, slbmSpeedForWave(wave))
  return {
    id: genId(),
    pos: start.clone(),
    start,
    target,
    targetId,
    speed: slbmSpeedForWave(wave),
    alive: true,
    kind: 'slbm',
    splitsLeft: 0,
    splitAltitude: 0,
    dodge: false,
    arc,
    subId: sub.id,
  }
}
