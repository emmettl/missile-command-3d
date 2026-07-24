import { create } from 'zustand'
import { Vector3 } from 'three'
import {
  AMMO_PER_BATTERY,
  BATTERIES,
  CITIES,
  FIELD,
  SCORE_PER_AMMO_BONUS,
  SCORE_PER_CITY_BONUS,
} from './constants'
import type {
  BatteryState,
  CityState,
  Explosion,
  GameStatus,
  IncomingMissile,
  PlayerMissile,
} from './types'

let nextId = 1
const genId = () => nextId++

function freshCities(): CityState[] {
  return CITIES.map((c) => ({ id: c.id, x: c.x, alive: true }))
}

function freshBatteries(): BatteryState[] {
  return BATTERIES.map((b) => ({ id: b.id, x: b.x, ammo: AMMO_PER_BATTERY, destroyed: false }))
}

interface GameState {
  status: GameStatus
  score: number
  highScore: number
  wave: number
  soundOn: boolean

  cities: CityState[]
  batteries: BatteryState[]

  incoming: IncomingMissile[]
  players: PlayerMissile[]
  explosions: Explosion[]

  // wave spawn bookkeeping (managed by the game loop)
  toSpawn: number
  spawnedThisWave: number
  spawnTimer: number

  // actions
  startGame: () => void
  beginWave: (wave: number) => void
  fireAt: (x: number, y: number) => boolean
  addIncoming: (m: IncomingMissile) => void
  addExplosion: (pos: Vector3) => void
  destroyTarget: (id: string) => void
  addScore: (n: number) => void
  commitPrune: () => void
  setStatus: (s: GameStatus) => void
  toggleSound: () => void
  awardWaveBonus: () => void
}

export const useGameStore = create<GameState>()((set, get) => ({
  status: 'menu',
  score: 0,
  highScore: Number(localStorage.getItem('mc3d-highscore') ?? 0),
  wave: 1,
  soundOn: true,

  cities: freshCities(),
  batteries: freshBatteries(),

  incoming: [],
  players: [],
  explosions: [],

  toSpawn: 0,
  spawnedThisWave: 0,
  spawnTimer: 0,

  startGame: () => {
    set({
      status: 'playing',
      score: 0,
      wave: 1,
      cities: freshCities(),
      batteries: freshBatteries(),
      incoming: [],
      players: [],
      explosions: [],
    })
    get().beginWave(1)
  },

  beginWave: (wave: number) => {
    // Refill surviving batteries at the start of each wave.
    const batteries = get().batteries.map((b) =>
      b.destroyed ? b : { ...b, ammo: AMMO_PER_BATTERY },
    )
    const count = 8 + wave * 2
    set({
      status: 'playing',
      wave,
      batteries,
      incoming: [],
      players: [],
      explosions: [],
      toSpawn: count,
      spawnedThisWave: 0,
      spawnTimer: 1.0, // small breather before the first missile
    })
  },

  fireAt: (x: number, y: number) => {
    const { batteries, status } = get()
    if (status !== 'playing') return false
    // Choose the nearest battery that still has ammo and isn't destroyed.
    let best: BatteryState | undefined
    let bestDist = Infinity
    for (const b of batteries) {
      if (b.destroyed || b.ammo <= 0) continue
      const d = Math.abs(b.x - x)
      if (d < bestDist) {
        bestDist = d
        best = b
      }
    }
    if (!best) return false

    const newBatteries = batteries.map((b) =>
      b.id === best!.id ? { ...b, ammo: b.ammo - 1 } : b,
    )
    const start = new Vector3(best.x, FIELD.groundY + 0.6, 0)
    const missile: PlayerMissile = {
      id: genId(),
      pos: start.clone(),
      start,
      target: new Vector3(x, y, 0),
      alive: true,
    }
    set({ batteries: newBatteries, players: [...get().players, missile] })
    return true
  },

  addIncoming: (m) => set({ incoming: [...get().incoming, m] }),

  addExplosion: (pos: Vector3) => {
    const e: Explosion = { id: genId(), pos: pos.clone(), age: 0, radius: 0.01, dead: false }
    set({ explosions: [...get().explosions, e] })
  },

  destroyTarget: (id: string) => {
    const cities = get().cities.map((c) => (c.id === id ? { ...c, alive: false } : c))
    const batteries = get().batteries.map((b) =>
      b.id === id ? { ...b, destroyed: true, ammo: 0 } : b,
    )
    set({ cities, batteries })
  },

  addScore: (n) => set({ score: get().score + n }),

  commitPrune: () => {
    // Rebuild entity arrays dropping dead entities. Called by the loop only when
    // something actually died, so we don't churn references every frame.
    set({
      incoming: get().incoming.filter((m) => m.alive),
      players: get().players.filter((m) => m.alive),
      explosions: get().explosions.filter((e) => !e.dead),
    })
  },

  setStatus: (s) => {
    if (s === 'gameover') {
      const { score, highScore } = get()
      if (score > highScore) {
        localStorage.setItem('mc3d-highscore', String(score))
        set({ highScore: score })
      }
    }
    set({ status: s })
  },

  toggleSound: () => set({ soundOn: !get().soundOn }),

  awardWaveBonus: () => {
    const { cities, batteries } = get()
    const cityBonus = cities.filter((c) => c.alive).length * SCORE_PER_CITY_BONUS
    const ammoBonus = batteries.reduce((s, b) => s + b.ammo, 0) * SCORE_PER_AMMO_BONUS
    set({ score: get().score + cityBonus + ammoBonus })
  },
}))

// Non-reactive helpers for the game loop (avoids subscribing components to fast state).
export const getGame = useGameStore.getState
