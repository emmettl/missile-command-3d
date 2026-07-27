import { create } from 'zustand'
import { Vector3 } from 'three'
import {
  AMMO_PER_BATTERY,
  BATTERIES,
  BONUS_CITY_SCORE,
  CITIES,
  FIELD,
  FLAK_ROUNDS,
  INTERCEPTOR_ARC_RATIO,
  INTERCEPTOR_ARC_SPEED,
  SCORE_PER_AMMO_BONUS,
  SCORE_PER_CITY_BONUS,
  SUB_KILL_SCORE,
  SUB_STRIKE_ROUNDS,
  SUB_STRIKE_SPEED,
  modeForWave,
  slbmCountForWave,
  subCountForWave,
} from './constants'
import { makeArc, newSubmarine, salvoRemaining } from './slbm'
import type {
  BatteryState,
  BlastKind,
  CityState,
  Explosion,
  GameStatus,
  IncomingMissile,
  PlayerMissile,
  ShockWave,
  Submarine,
  WaveMode,
  WeaponKind,
} from './types'

let nextId = 1
const genId = () => nextId++

function freshCities(): CityState[] {
  return CITIES.map((c) => ({ id: c.id, x: c.x, alive: true }))
}

function freshBatteries(): BatteryState[] {
  return BATTERIES.map((b) => ({ id: b.id, x: b.x, ammo: AMMO_PER_BATTERY, destroyed: false }))
}

// Guard localStorage so the store is usable under SSR / tests (no `window`).
const persistentStore: Storage | null =
  typeof window !== 'undefined' && typeof window.localStorage !== 'undefined'
    ? window.localStorage
    : null

interface GameState {
  status: GameStatus
  score: number
  highScore: number
  wave: number
  soundOn: boolean
  bonusCities: number // reserve cities earned by score, spent to rebuild at wave start
  waveBannerId: number // bumped each wave so the intro banner re-triggers

  cities: CityState[]
  batteries: BatteryState[]

  incoming: IncomingMissile[]
  players: PlayerMissile[]
  explosions: Explosion[]
  shockwaves: ShockWave[]

  // SLBM ATTACK
  waveMode: WaveMode
  submarines: Submarine[]
  weapon: WeaponKind
  flakRounds: number
  strikeRounds: number

  // wave spawn bookkeeping (managed by the game loop)
  toSpawn: number
  spawnedThisWave: number
  spawnTimer: number

  // actions
  launch: () => void
  startGame: () => void
  beginWave: (wave: number) => void
  fireAt: (x: number, y: number) => boolean
  fireStrike: (x: number, z: number) => boolean
  setWeapon: (w: WeaponKind) => void
  addIncoming: (m: IncomingMissile) => void
  addExplosion: (pos: Vector3, kind?: BlastKind) => void
  addShockwave: (pos: Vector3) => void
  destroyTarget: (id: string) => void
  killSub: (id: number) => void
  addScore: (n: number) => void
  commitPrune: () => void
  setStatus: (s: GameStatus) => void
  toggleSound: () => void
  awardWaveBonus: () => void
}

/** The battery that answers a call for fire: nearest to x, still standing. */
function nearestBattery(batteries: BatteryState[], x: number, needsAmmo: boolean) {
  let best: BatteryState | undefined
  let bestDist = Infinity
  for (const b of batteries) {
    if (b.destroyed || (needsAmmo && b.ammo <= 0)) continue
    const d = Math.abs(b.x - x)
    if (d < bestDist) {
      bestDist = d
      best = b
    }
  }
  return best
}

export const useGameStore = create<GameState>()((set, get) => ({
  status: 'menu',
  score: 0,
  highScore: Number(persistentStore?.getItem('mc3d-highscore') ?? 0),
  wave: 1,
  soundOn: true,
  bonusCities: 0,
  waveBannerId: 0,

  cities: freshCities(),
  batteries: freshBatteries(),

  incoming: [],
  players: [],
  explosions: [],
  shockwaves: [],

  waveMode: 'classic',
  submarines: [],
  weapon: 'interceptor',
  flakRounds: 0,
  strikeRounds: 0,

  toSpawn: 0,
  spawnedThisWave: 0,
  spawnTimer: 0,

  launch: () => set({ status: 'launching' }),

  startGame: () => {
    set({
      status: 'playing',
      score: 0,
      wave: 1,
      bonusCities: 0,
      cities: freshCities(),
      batteries: freshBatteries(),
      incoming: [],
      players: [],
      explosions: [],
      shockwaves: [],
      submarines: [],
      waveMode: 'classic',
      weapon: 'interceptor',
    })
    get().beginWave(1)
  },

  beginWave: (wave: number) => {
    // Refill surviving batteries at the start of each wave.
    const batteries = get().batteries.map((b) =>
      b.destroyed ? b : { ...b, ammo: AMMO_PER_BATTERY },
    )
    // Spend reserve cities to rebuild destroyed ones.
    let bonus = get().bonusCities
    const cities = get().cities.map((c) => {
      if (!c.alive && bonus > 0) {
        bonus -= 1
        return { ...c, alive: true }
      }
      return c
    })
    // Every third wave from the third is fought offshore against submarines, which
    // deliver fewer warheads but on long, slow, high arcs.
    const mode = modeForWave(wave)
    const subCount = mode === 'slbm' ? subCountForWave(wave) : 0
    set({
      status: 'playing',
      wave,
      cities,
      batteries,
      bonusCities: bonus,
      waveBannerId: get().waveBannerId + 1,
      incoming: [],
      players: [],
      explosions: [],
      shockwaves: [],
      waveMode: mode,
      submarines: Array.from({ length: subCount }, (_, i) => newSubmarine(i, subCount)),
      weapon: 'interceptor',
      flakRounds: mode === 'slbm' ? FLAK_ROUNDS : 0,
      strikeRounds: mode === 'slbm' ? SUB_STRIKE_ROUNDS : 0,
      toSpawn: mode === 'slbm' ? slbmCountForWave(wave) : 8 + wave * 2,
      spawnedThisWave: 0,
      spawnTimer: 1.0, // small breather before the first missile
    })
  },

  fireAt: (x: number, y: number) => {
    const { batteries, status, weapon, waveMode, flakRounds } = get()
    if (status !== 'playing') return false
    if (weapon === 'flak' && flakRounds <= 0) return false

    // Flak comes off a launcher rather than out of the missile magazine, so it only
    // needs a battery still standing — but it does still need one.
    const usesMagazine = weapon !== 'flak'
    const best = nearestBattery(batteries, x, usesMagazine)
    if (!best) return false

    const start = new Vector3(best.x, FIELD.groundY + 0.6, 0)
    const target = new Vector3(x, y, 0)
    const missile: PlayerMissile = {
      id: genId(),
      pos: start.clone(),
      start,
      target,
      alive: true,
      weapon: weapon === 'flak' ? 'flak' : 'interceptor',
      // Interceptors lob in SLBM waves, which is what makes the mode about leading a
      // target rather than tracking it. Flak, and every classic shot, flies flat.
      arc:
        waveMode === 'slbm' && weapon === 'interceptor'
          ? makeArc(start, target, INTERCEPTOR_ARC_SPEED, INTERCEPTOR_ARC_RATIO, 2, 26)
          : undefined,
    }
    set({
      batteries: usesMagazine
        ? batteries.map((b) => (b.id === best.id ? { ...b, ammo: b.ammo - 1 } : b))
        : batteries,
      flakRounds: usesMagazine ? flakRounds : flakRounds - 1,
      players: [...get().players, missile],
    })
    return true
  },

  // A strike is aimed at a point on the water rather than a point in the sky, so it
  // takes a sea coordinate and lobs out over the ocean at its own slow pace.
  fireStrike: (x: number, z: number) => {
    const { batteries, status, strikeRounds } = get()
    if (status !== 'playing' || strikeRounds <= 0) return false
    const best = nearestBattery(batteries, x, false)
    if (!best) return false

    const start = new Vector3(best.x, FIELD.groundY + 0.6, 0)
    const target = new Vector3(x, 0.3, z)
    set({
      strikeRounds: strikeRounds - 1,
      players: [
        ...get().players,
        {
          id: genId(),
          pos: start.clone(),
          start,
          target,
          alive: true,
          weapon: 'strike',
          arc: makeArc(start, target, SUB_STRIKE_SPEED, 0.16, 8, 34),
        },
      ],
    })
    return true
  },

  setWeapon: (w) => {
    const { waveMode, flakRounds, strikeRounds } = get()
    if (waveMode !== 'slbm' && w !== 'interceptor') return
    if (w === 'flak' && flakRounds <= 0) return
    if (w === 'strike' && strikeRounds <= 0) return
    set({ weapon: w })
  },

  addIncoming: (m) => set({ incoming: [...get().incoming, m] }),

  addExplosion: (pos: Vector3, kind: BlastKind = 'blast') => {
    const e: Explosion = { id: genId(), pos: pos.clone(), age: 0, radius: 0.01, dead: false, kind }
    set({ explosions: [...get().explosions, e] })
  },

  addShockwave: (pos: Vector3) => {
    const s: ShockWave = { id: genId(), pos: pos.clone(), age: 0, dead: false }
    set({ shockwaves: [...get().shockwaves, s] })
  },

  destroyTarget: (id: string) => {
    const cities = get().cities.map((c) => (c.id === id ? { ...c, alive: false } : c))
    const batteries = get().batteries.map((b) =>
      b.id === id ? { ...b, destroyed: true, ammo: 0 } : b,
    )
    set({ cities, batteries })
  },

  // Sinking a boat retires whatever is left of the salvo it was in the middle of
  // firing: the wave gets shorter, which is the whole return on going offensive.
  killSub: (id: number) => {
    const sub = get().submarines.find((s) => s.id === id)
    if (!sub || !sub.alive) return
    sub.alive = false
    const retired = salvoRemaining(sub)
    set({
      submarines: get().submarines.filter((s) => s.alive),
      toSpawn: Math.max(get().spawnedThisWave, get().toSpawn - retired),
    })
    get().addScore(SUB_KILL_SCORE)
  },

  addScore: (n) => {
    const before = get().score
    const after = before + n
    // Award a reserve city each time the score crosses a BONUS_CITY_SCORE boundary.
    const earned = Math.floor(after / BONUS_CITY_SCORE) - Math.floor(before / BONUS_CITY_SCORE)
    set({ score: after, bonusCities: get().bonusCities + Math.max(0, earned) })
  },

  commitPrune: () => {
    // Rebuild entity arrays dropping dead entities. Called by the loop only when
    // something actually died, so we don't churn references every frame.
    set({
      incoming: get().incoming.filter((m) => m.alive),
      players: get().players.filter((m) => m.alive),
      explosions: get().explosions.filter((e) => !e.dead),
      shockwaves: get().shockwaves.filter((s) => !s.dead),
    })
  },

  setStatus: (s) => {
    if (s === 'gameover') {
      const { score, highScore } = get()
      if (score > highScore) {
        persistentStore?.setItem('mc3d-highscore', String(score))
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
