import type { GameStatus, WaveMode } from './types'

// What the soundtrack should be doing, as a pure function of game state.
//
// Separated from the engine that plays it for the usual reason the rest of src/game is:
// "the offshore wave gets the slow one" is a decision worth pinning in a test, and it is
// only testable at all if deciding it never touches an AudioContext.

/** A song id from `@driftbox/engine`'s SONGS, or null for silence. */
export type MusicCue =
  | 'defcon'
  | 'cycles'
  | 'darkwave'
  | 'runner'
  | null

export interface MusicPlan {
  cue: MusicCue
  /**
   * The wave the tempo lift is taken from. 1 on the attract screen, which has no wave —
   * so the title music always plays at the tempo it was written at.
   */
  wave: number
  /** Sweep the mix shut, under the wave-cleared card. */
  duck: boolean
}

/**
 * The song each part of the game gets.
 *
 * One per wave mode rather than one per wave: a mode is the thing that changes how the
 * game is played, and a soundtrack that switched every wave would never be around long
 * enough to be recognised. Escalation within a mode is the tempo, below.
 */
export function musicPlan(status: GameStatus, waveMode: WaveMode, wave: number): MusicPlan {
  // The dive keeps the title music rather than cutting to the wave's. It lasts a couple
  // of seconds and a song change inside it would read as a glitch on the way in.
  if (status === 'menu' || status === 'launching') {
    return { cue: 'defcon', wave: 1, duck: false }
  }

  // Silence, deliberately. The game-over sweep needs somewhere to land, and the attract
  // screen brings the title music back on its own eight seconds later.
  if (status === 'gameover') return { cue: null, wave, duck: false }

  const cue: MusicCue =
    waveMode === 'slbm' ? 'darkwave' : waveMode === 'bombers' ? 'runner' : 'cycles'

  // 'wave-clear' keeps the wave's own song playing and ducks it instead of stopping it —
  // the three seconds before the next wave are a breath in the same track, not a gap.
  return { cue, wave, duck: status === 'wave-clear' }
}

/** Most a wave can add to a song's own tempo. Past about this the patterns stop being
 *  the thing they were written as and start being the same thing played too fast. */
const MAX_LIFT = 12
const LIFT_PER_WAVE = 1.5

/** The tempo a song plays at on a given wave: its own, nudged up as the game gets harder
 *  and held there. Wave 1 is always the song exactly as written. */
export function bpmForWave(base: number, wave: number): number {
  return Math.round(base + Math.min(MAX_LIFT, Math.max(0, wave - 1) * LIFT_PER_WAVE))
}
