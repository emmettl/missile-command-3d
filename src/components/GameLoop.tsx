import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Vector3 } from 'three'
import {
  EXPLOSION_GROW_TIME,
  EXPLOSION_HOLD_TIME,
  EXPLOSION_MAX_RADIUS,
  EXPLOSION_SHRINK_TIME,
  PLAYER_MISSILE_SPEED,
  SCORE_BY_KIND,
  SHOCKWAVE_DURATION,
  mirvChanceForWave,
  smartChanceForWave,
} from '../game/constants'
import type { IncomingKind } from '../game/types'
import { applyDodge, maybeSplit, newIncoming } from '../game/incoming'
import { getGame, useGameStore } from '../game/useGameStore'
import { addShake } from '../game/shake'
import { Sfx } from '../game/audio'

const EXPLOSION_TOTAL = EXPLOSION_GROW_TIME + EXPLOSION_HOLD_TIME + EXPLOSION_SHRINK_TIME

function radiusForAge(age: number): number {
  if (age < EXPLOSION_GROW_TIME) return EXPLOSION_MAX_RADIUS * (age / EXPLOSION_GROW_TIME)
  if (age < EXPLOSION_GROW_TIME + EXPLOSION_HOLD_TIME) return EXPLOSION_MAX_RADIUS
  const t = (age - EXPLOSION_GROW_TIME - EXPLOSION_HOLD_TIME) / EXPLOSION_SHRINK_TIME
  return EXPLOSION_MAX_RADIUS * (1 - t)
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
      e.radius = radiusForAge(e.age)
      if (e.age >= EXPLOSION_TOTAL) {
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

      // --- Spawn incoming over the course of the wave ---
      if (g.spawnedThisWave < g.toSpawn) {
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

      // --- Advance player counter-missiles ---
      for (const m of g.players) {
        if (!m.alive) continue
        const step = PLAYER_MISSILE_SPEED * dt
        if (m.pos.distanceTo(m.target) <= step) {
          m.pos.copy(m.target)
          m.alive = false
          structuralChange = true
          g.addExplosion(m.target)
          if (g.soundOn) Sfx.explosion()
        } else {
          m.pos.addScaledVector(dirTo(m.pos, m.target), step)
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

        const step = m.speed * dt
        if (m.pos.distanceTo(m.target) <= step) {
          m.pos.copy(m.target)
          m.alive = false
          structuralChange = true
          g.addExplosion(m.target)
          g.addShockwave(new Vector3(m.target.x, 0.02, 0))
          g.destroyTarget(m.targetId)
          addShake(0.7)
          if (g.soundOn) Sfx.cityHit()
        } else {
          m.pos.addScaledVector(dirTo(m.pos, m.target), step)
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
      if (!cityAlive || !batteryUsable) {
        g.setStatus('gameover')
        addShake(1.6)
        if (g.soundOn) Sfx.gameOver()
      } else if (g.spawnedThisWave >= g.toSpawn && !g.incoming.some((m) => m.alive)) {
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
