import { Vector3 } from 'three'
import {
  BATTERIES,
  GUN_COOL_PER_SECOND,
  GUN_HEAT_PER_SHOT,
  GUN_LOCKOUT_BELOW,
  SHELL_INTERVAL,
  SHELL_LIFETIME,
  SHELL_SPEED,
} from './constants'
import type { GunState, Shell } from './types'

// The thing you are stood behind: where it points, and whether it will fire.
//
// Both halves are here because both are answers to "what happens when the player holds
// the button and drags the mouse", and neither needs anything from the scene graph.

/** Eye height above the emplacement. */
export const EYE_HEIGHT = 2.6

/** Pitch limits. You are looking up at aircraft; there is nothing to shoot at your feet. */
export const PITCH_MIN = -0.18 // radians, a little below level
export const PITCH_MAX = 1.4 // not quite straight up, so the horizon never inverts

export const LOOK_PER_PIXEL = 0.0027

let nextId = 1
const genId = () => nextId++

function clamp(n: number, low: number, high: number): number {
  return Math.min(Math.max(n, low), high)
}

export function newGun(position = 1): GunState {
  return { heat: 0, jammed: false, cadence: 0, position, yaw: 0, pitch: 0.35 }
}

/** Where the manned emplacement is, at eye height. */
export function eyePosition(position: number, out: Vector3): Vector3 {
  const battery = BATTERIES[clamp(position, 0, BATTERIES.length - 1)]
  return out.set(battery.x, EYE_HEIGHT, 0)
}

/**
 * Turn the gun by a pointer movement. Yaw runs free — you can spin all the way round,
 * which is the whole point of the mode — while pitch is clamped.
 */
export function look(gun: GunState, dxPixels: number, dyPixels: number): void {
  gun.yaw -= dxPixels * LOOK_PER_PIXEL
  gun.pitch = clamp(gun.pitch - dyPixels * LOOK_PER_PIXEL, PITCH_MIN, PITCH_MAX)
}

/** Unit vector the barrel is pointing along. Yaw 0 looks down -z, as the camera does. */
export function aimDirection(gun: GunState, out: Vector3): Vector3 {
  const cosPitch = Math.cos(gun.pitch)
  return out
    .set(-Math.sin(gun.yaw) * cosPitch, Math.sin(gun.pitch), -Math.cos(gun.yaw) * cosPitch)
    .normalize()
}

/**
 * Advance the gun for a frame and say whether a round leaves the barrel.
 *
 * Heat rather than ammunition: it climbs with every shot and falls whenever you are not
 * shooting, and once it reaches the limit the gun locks out until it has cooled *well*
 * below — far enough that feathering the trigger at the limit is not a strategy.
 */
export function stepGun(gun: GunState, dt: number, firing: boolean): boolean {
  gun.cadence = Math.max(0, gun.cadence - dt)

  if (gun.jammed) {
    gun.heat = Math.max(0, gun.heat - GUN_COOL_PER_SECOND * dt)
    if (gun.heat <= GUN_LOCKOUT_BELOW) gun.jammed = false
    return false
  }

  if (!firing || gun.cadence > 0) {
    gun.heat = Math.max(0, gun.heat - GUN_COOL_PER_SECOND * dt)
    return false
  }

  gun.heat += GUN_HEAT_PER_SHOT
  gun.cadence = SHELL_INTERVAL
  if (gun.heat >= 1) {
    gun.heat = 1
    gun.jammed = true
  }
  return true
}

export function newShell(from: Vector3, direction: Vector3): Shell {
  return {
    id: genId(),
    pos: from.clone(),
    vel: direction.clone().normalize().multiplyScalar(SHELL_SPEED),
    age: 0,
    alive: true,
  }
}

/** Advance a shell. Returns true once it is spent and should be dropped. */
export function stepShell(shell: Shell, dt: number): boolean {
  shell.age += dt
  shell.pos.addScaledVector(shell.vel, dt)
  if (shell.age >= SHELL_LIFETIME || shell.pos.y < 0) {
    shell.alive = false
    return true
  }
  return false
}

/**
 * Where to aim to hit something crossing in front of you: the point the target reaches
 * at the same moment a shell fired now would arrive. Solved rather than approximated,
 * because the lead is the whole skill and it should be honestly gettable.
 *
 * Returns null when nothing catches it — a target running away faster than the shell.
 */
export function leadPoint(
  from: Vector3,
  targetPos: Vector3,
  targetVel: Vector3,
  out: Vector3,
  shellSpeed = SHELL_SPEED,
): Vector3 | null {
  // |targetPos + targetVel t - from| = shellSpeed t  →  quadratic in t.
  const rx = targetPos.x - from.x
  const ry = targetPos.y - from.y
  const rz = targetPos.z - from.z
  const a = targetVel.lengthSq() - shellSpeed * shellSpeed
  const b = 2 * (rx * targetVel.x + ry * targetVel.y + rz * targetVel.z)
  const c = rx * rx + ry * ry + rz * rz

  let t: number
  if (Math.abs(a) < 1e-6) {
    if (Math.abs(b) < 1e-6) return null
    t = -c / b
  } else {
    const disc = b * b - 4 * a * c
    if (disc < 0) return null
    const root = Math.sqrt(disc)
    const t1 = (-b + root) / (2 * a)
    const t2 = (-b - root) / (2 * a)
    // The soonest arrival that is actually in the future.
    const candidates = [t1, t2].filter((v) => v > 0)
    if (candidates.length === 0) return null
    t = Math.min(...candidates)
  }
  if (!Number.isFinite(t) || t <= 0) return null
  return out.copy(targetPos).addScaledVector(targetVel, t)
}
