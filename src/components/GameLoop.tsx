import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Vector3 } from 'three'
import {
  EXPLOSION_GROW_TIME,
  EXPLOSION_HOLD_TIME,
  EXPLOSION_MAX_RADIUS,
  EXPLOSION_SHRINK_TIME,
  FLAK_FADE_TIME,
  FLAK_GROW_TIME,
  FLAK_HOLD_TIME,
  FLAK_RADIUS,
  FLAK_SPEED,
  PLAYER_MISSILE_SPEED,
  SCORE_BY_KIND,
  SHOCKWAVE_DURATION,
  SUB_STRIKE_RADIUS,
  mirvChanceForWave,
  smartChanceForWave,
} from '../game/constants'
import type { BlastKind, IncomingKind, PlayerMissile } from '../game/types'
import { applyDodge, maybeSplit, newIncoming } from '../game/incoming'
import { arcPointAt, isExposed, newSlbm, stepSubmarine } from '../game/slbm'
import { getGame, useGameStore } from '../game/useGameStore'
import { addShake } from '../game/shake'
import { Sfx } from '../game/audio'

const EXPLOSION_TOTAL = EXPLOSION_GROW_TIME + EXPLOSION_HOLD_TIME + EXPLOSION_SHRINK_TIME
const FLAK_TOTAL = FLAK_GROW_TIME + FLAK_HOLD_TIME + FLAK_FADE_TIME

function lifetimeOf(kind: BlastKind): number {
  return kind === 'flak' ? FLAK_TOTAL : EXPLOSION_TOTAL
}

// A counter-missile blast swells and collapses in a second; a flak burst opens fast and
// then just hangs there, which is the whole point of it — you are fencing off a piece of
// sky rather than hitting something.
function radiusForAge(age: number, kind: BlastKind): number {
  if (kind === 'flak') {
    if (age < FLAK_GROW_TIME) return FLAK_RADIUS * (age / FLAK_GROW_TIME)
    if (age < FLAK_GROW_TIME + FLAK_HOLD_TIME) return FLAK_RADIUS
    return FLAK_RADIUS * (1 - (age - FLAK_GROW_TIME - FLAK_HOLD_TIME) / FLAK_FADE_TIME)
  }
  if (age < EXPLOSION_GROW_TIME) return EXPLOSION_MAX_RADIUS * (age / EXPLOSION_GROW_TIME)
  if (age < EXPLOSION_GROW_TIME + EXPLOSION_HOLD_TIME) return EXPLOSION_MAX_RADIUS
  const t = (age - EXPLOSION_GROW_TIME - EXPLOSION_HOLD_TIME) / EXPLOSION_SHRINK_TIME
  return EXPLOSION_MAX_RADIUS * (1 - t)
}

// What a player weapon does when it gets where it was going.
function detonate(g: ReturnType<typeof getGame>, m: PlayerMissile) {
  if (m.weapon === 'strike') {
    // Torpedoes only ever find a boat that is on the surface. A strike thrown at open
    // water, or at the wake of one that has already dived, is simply wasted.
    for (const sub of g.submarines) {
      if (isExposed(sub) && sub.pos.distanceTo(m.target) <= SUB_STRIKE_RADIUS) g.killSub(sub.id)
    }
    g.addShockwave(new Vector3(m.target.x, 0.02, m.target.z))
    g.addExplosion(m.target)
  } else {
    g.addExplosion(m.target, m.weapon === 'flak' ? 'flak' : 'blast')
  }
  if (g.soundOn) Sfx.explosion()
}

// Headless component: it renders nothing, it just advances the world each frame.
export function GameLoop() {
  const nextWaveIn = useRef(0)
  const spawnTimer = useRef(0)

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05) // clamp huge frames (tab switch) so nothing tunnels
    const g = getGame()
    let structuralChange = false

    // --- Explosions always animate, even after the round ends ---
    for (const e of g.explosions) {
      if (e.dead) continue
      e.age += dt
      e.radius = radiusForAge(e.age, e.kind)
      if (e.age >= lifetimeOf(e.kind)) {
        e.dead = true
        structuralChange = true
      }
    }

    // --- Ground shockwaves expand and fade ---
    for (const s of g.shockwaves) {
      if (s.dead) continue
      s.age += dt
      if (s.age >= SHOCKWAVE_DURATION) {
        s.dead = true
        structuralChange = true
      }
    }

    if (g.status === 'playing') {
      const wave = g.wave
      const offshore = g.waveMode === 'slbm'

      // --- Spawn incoming over the course of the wave ---
      // In an SLBM wave nothing arrives on a timer: warheads exist only because a boat
      // surfaced and fired one, which is what makes sinking boats worth doing.
      if (!offshore && g.spawnedThisWave < g.toSpawn) {
        spawnTimer.current -= dt
        if (spawnTimer.current <= 0) {
          const target = pickTarget()
          if (target) {
            g.addIncoming(newIncoming(wave, target.x, target.id, chooseKind(wave)))
            useGameStore.setState({ spawnedThisWave: g.spawnedThisWave + 1 })
          }
          const interval = Math.max(0.35, 1.4 - wave * 0.08) * (0.6 + Math.random() * 0.8)
          spawnTimer.current = interval
        }
      }

      // --- Submarines: surface, empty a salvo, dive, move on ---
      let exposed = 0
      for (const sub of g.submarines) {
        if (!sub.alive) continue
        const fired = stepSubmarine(sub, dt)
        if (isExposed(sub)) exposed++
        if (!fired) continue
        const live = getGame()
        if (live.spawnedThisWave >= live.toSpawn) continue
        const target = pickTarget()
        if (!target) continue
        g.addIncoming(newSlbm(wave, sub, target.x, target.id))
        useGameStore.setState({ spawnedThisWave: live.spawnedThisWave + 1 })
        if (g.soundOn) Sfx.launch()
      }
      // Published only on change: phases turn over a handful of times a wave, so this
      // costs nothing, and it lets the UI prompt at the moment there is a target.
      if (offshore && exposed !== g.subsExposed) useGameStore.setState({ subsExposed: exposed })

      // --- Advance player counter-missiles ---
      for (const m of g.players) {
        if (!m.alive) continue
        let arrived: boolean
        if (m.arc) {
          m.arc.elapsed += dt
          arcPointAt(m.start, m.target, m.arc.apex, m.arc.elapsed / m.arc.duration, m.pos)
          arrived = m.arc.elapsed >= m.arc.duration
        } else {
          const step = (m.weapon === 'flak' ? FLAK_SPEED : PLAYER_MISSILE_SPEED) * dt
          arrived = m.pos.distanceTo(m.target) <= step
          if (arrived) m.pos.copy(m.target)
          else m.pos.addScaledVector(dirTo(m.pos, m.target), step)
        }
        if (arrived) {
          m.alive = false
          structuralChange = true
          detonate(g, m)
        }
      }

      // --- Advance incoming enemy missiles ---
      for (const m of g.incoming) {
        if (!m.alive) continue

        // MIRV release: fan out into several warheads at the split altitude.
        const kids = maybeSplit(m, pickTarget)
        if (kids.length > 0) {
          for (const kid of kids) g.addIncoming(kid)
          structuralChange = true
          if (g.soundOn) Sfx.launch()
        }

        // Smart-bomb evasion: veer away from the nearest active blast.
        applyDodge(m, g.explosions, dt)

        let impacted: boolean
        if (m.arc) {
          // A lobbed warhead is entirely described by how far through its arc it is.
          m.arc.elapsed += dt
          arcPointAt(m.start, m.target, m.arc.apex, m.arc.elapsed / m.arc.duration, m.pos)
          impacted = m.arc.elapsed >= m.arc.duration
        } else {
          const step = m.speed * dt
          impacted = m.pos.distanceTo(m.target) <= step
          if (impacted) m.pos.copy(m.target)
          else m.pos.addScaledVector(dirTo(m.pos, m.target), step)
        }

        if (impacted) {
          m.alive = false
          structuralChange = true
          g.addExplosion(m.target)
          g.addShockwave(new Vector3(m.target.x, 0.02, m.target.z))
          g.destroyTarget(m.targetId)
          addShake(0.7)
          if (g.soundOn) Sfx.cityHit()
        }
      }

      // --- Explosions vs incoming: intercept + chain reactions ---
      for (const e of g.explosions) {
        if (e.dead) continue
        for (const m of g.incoming) {
          if (!m.alive) continue
          if (m.pos.distanceTo(e.pos) <= e.radius + 0.28) {
            m.alive = false
            structuralChange = true
            g.addScore(SCORE_BY_KIND[m.kind])
            g.addExplosion(m.pos) // chain reaction
            if (g.soundOn) Sfx.explosion()
          }
        }
      }

      // --- End-of-round checks ---
      const cityAlive = g.cities.some((c) => c.alive)
      const batteryUsable = g.batteries.some((b) => !b.destroyed)
      const live = getGame()
      // Offshore, the wave is also over when there is nobody left to fire it — a boat
      // sunk while surfacing takes an unlaunched salvo down with it.
      const salvoSpent =
        live.spawnedThisWave >= live.toSpawn || (offshore && live.submarines.length === 0)
      if (!cityAlive || !batteryUsable) {
        g.setStatus('gameover')
        addShake(1.6)
        if (g.soundOn) Sfx.gameOver()
      } else if (salvoSpent && !g.incoming.some((m) => m.alive)) {
        g.awardWaveBonus()
        g.setStatus('wave-clear')
        nextWaveIn.current = 3.0
        if (g.soundOn) Sfx.waveClear()
      }
    } else if (g.status === 'wave-clear') {
      nextWaveIn.current -= dt
      if (nextWaveIn.current <= 0) {
        spawnTimer.current = 1.0
        g.beginWave(g.wave + 1)
      }
    }

    if (structuralChange) g.commitPrune()
  })

  return null
}

function pickTarget() {
  const g = getGame()
  const targets = [
    ...g.cities.filter((c) => c.alive),
    ...g.batteries.filter((b) => !b.destroyed),
  ]
  if (targets.length === 0) return null
  return targets[Math.floor(Math.random() * targets.length)]
}

function chooseKind(wave: number): IncomingKind {
  const r = Math.random()
  if (r < smartChanceForWave(wave)) return 'smart'
  if (r < smartChanceForWave(wave) + mirvChanceForWave(wave)) return 'mirv'
  return 'normal'
}

const _dir = new Vector3()
function dirTo(from: Vector3, to: Vector3): Vector3 {
  return _dir.subVectors(to, from).normalize()
}
