import { Vector3 } from 'three'
import {
  FIELD,
  MIRV_CHILDREN_MAX,
  MIRV_CHILDREN_MIN,
  SMART_DODGE_RANGE,
  SMART_DODGE_SPEED,
  incomingSpeedForWave,
} from './constants'
import type { Explosion, IncomingKind, IncomingMissile } from './types'

let nextId = 1
const genId = () => nextId++

export function newIncoming(
  wave: number,
  targetX: number,
  targetId: string,
  kind: IncomingKind = 'normal',
): IncomingMissile {
  const startX = targetX + (Math.random() - 0.5) * 18
  const clampedStartX = Math.max(FIELD.minX, Math.min(FIELD.maxX, startX))
  const start = new Vector3(clampedStartX, FIELD.skyY, 0)
  const target = new Vector3(targetX, FIELD.groundY + 0.4, 0)
  return {
    id: genId(),
    pos: start.clone(),
    start,
    target,
    targetId,
    speed: incomingSpeedForWave(wave) * (kind === 'smart' ? 1.15 : 1),
    alive: true,
    kind,
    splitsLeft: kind === 'mirv' ? 1 : 0,
    // MIRVs release their warheads in the upper-middle band of the sky.
    splitAltitude: FIELD.skyY * (0.45 + Math.random() * 0.2),
    dodge: kind === 'smart',
  }
}

// A MIRV warhead released mid-air: starts at the parent's position, keeps its
// downward momentum, and cannot split again.
export function splitChild(
  from: Vector3,
  targetX: number,
  targetId: string,
  speed: number,
): IncomingMissile {
  const start = from.clone()
  return {
    id: genId(),
    pos: start.clone(),
    start,
    target: new Vector3(targetX, FIELD.groundY + 0.4, 0),
    targetId,
    speed,
    alive: true,
    kind: 'normal',
    splitsLeft: 0,
    splitAltitude: 0,
    dodge: false,
  }
}

export interface TargetPick {
  x: number
  id: string
}

// If this MIRV has reached its split altitude, release 2–3 child warheads and
// return them (also flips splitsLeft to 0 so it can't split again). Pure aside
// from mutating the passed missile and calling the target picker.
export function maybeSplit(m: IncomingMissile, pick: () => TargetPick | null): IncomingMissile[] {
  if (m.splitsLeft <= 0 || m.pos.y > m.splitAltitude) return []
  m.splitsLeft = 0
  const n =
    MIRV_CHILDREN_MIN + Math.floor(Math.random() * (MIRV_CHILDREN_MAX - MIRV_CHILDREN_MIN + 1))
  const kids: IncomingMissile[] = []
  for (let i = 0; i < n; i++) {
    const t = pick()
    if (t) kids.push(splitChild(m.pos, t.x, t.id, m.speed * 1.05))
  }
  return kids
}

// Nudge a smart bomb horizontally away from the nearest active blast so it must
// be hit more directly. Mutates the missile's x position; no-op for non-dodgers.
export function applyDodge(m: IncomingMissile, explosions: Explosion[], dt: number): void {
  if (!m.dodge) return
  let near: Explosion | null = null
  let nd = SMART_DODGE_RANGE
  for (const e of explosions) {
    if (e.dead) continue
    const d = m.pos.distanceTo(e.pos)
    if (d < nd) {
      nd = d
      near = e
    }
  }
  if (!near) return
  const away = m.pos.x - near.pos.x
  const sign = away === 0 ? (Math.random() < 0.5 ? -1 : 1) : Math.sign(away)
  m.pos.x = Math.max(FIELD.minX, Math.min(FIELD.maxX, m.pos.x + sign * SMART_DODGE_SPEED * dt))
}
