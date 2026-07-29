import type { DriftboxEngine } from '@driftbox/engine'
import { getAudioContext } from './audio'
import { bpmForWave, type MusicCue, type MusicPlan } from './musicCue'

// The soundtrack, played by @driftbox/engine — a TR-808, a TR-909 and two TB-303s
// synthesised from scratch, the same way the effects in audio.ts are. No audio assets,
// which is why the game can have music at all without a download.
//
// Everything here is imperative and lives outside React. The state that drives it changes
// on wave boundaries, but the engine is scheduling audio a bar ahead against its own
// clock and must not be torn down and rebuilt because a component re-rendered.

/**
 * Master level for the music, well under the engine's own 0.7 default.
 *
 * The music is a bed and the effects are the game — a launch, or a city going up, has to
 * cut through it, and those go straight to the destination at gains around 0.2. At the
 * engine's default the drums win every time and the game sounds like it is happening in
 * the next room.
 */
const MUSIC_GAIN = 0.32

/**
 * Where the performance filter goes while the mix is ducked, as a position on the
 * engine's XY pad: a lowpass around 500Hz with enough resonance that the sweep reads as
 * a move rather than as a mute.
 *
 * Low enough to take the hats and the top of the 303 with it and leave the kick, which
 * is the point — the three seconds between waves should sound like the record is still
 * playing in the next room, not like somebody reached for the volume.
 */
const DUCK_X = 0.16
const DUCK_Y = 0.18

type EngineModule = typeof import('@driftbox/engine')

/**
 * The module load, kept as the latch so concurrent callers all wait on the same import.
 *
 * Dynamic, so the first thing a browser has to parse on the way to the title screen is
 * the game rather than a drum machine that may never be unmuted. Resolves null rather
 * than rejecting: a browser that cannot load it still gets a game.
 */
let loading: Promise<EngineModule | null> | null = null

function engineModule(): Promise<EngineModule | null> {
  loading ??= import('@driftbox/engine').catch(() => null)
  return loading
}

let engine: DriftboxEngine | null = null
/** What is actually playing, as opposed to what has been asked for. */
let playing: MusicCue = null
/** The song's own tempo, kept so a wave change can re-derive the lift. `engine.bpm` is
 *  the lifted value already, and deriving the next lift from it would compound. */
let baseBpm = 0

let wanted: MusicPlan = { cue: null, wave: 1, duck: false }
let enabled = true
let ducked = false

/** Serialises applies. Two cue changes a frame apart must not both build a song and race
 *  to assign it — the loser would leave `playing` naming the song that is not playing. */
let settling: Promise<void> = Promise.resolve()

async function settle(): Promise<void> {
  // Silence is answerable without loading anything, which matters on the attract screen
  // of a cabinet whose owner has the sound off.
  if (!enabled || wanted.cue === null) {
    if (engine?.running) {
      engine.stop()
      engine.silenceTails()
    }
    playing = null
    return
  }

  const mod = await engineModule()
  if (!mod) return

  // The plan may have moved on while the module was loading — a player who hits START
  // before the first bar is scheduled is the normal case, not the edge one.
  const plan = wanted
  if (!enabled || plan.cue === null) return

  if (!engine || playing !== plan.cue) {
    const preset = mod.songPresetById(plan.cue)
    if (!preset) return

    if (!engine) {
      const ctx = getAudioContext()
      if (!ctx) return
      try {
        engine = new mod.DriftboxEngine(preset.build(), { context: ctx, gain: MUSIC_GAIN })
      } catch {
        return
      }
    } else {
      // A replaced record must not still be audible over the one that replaced it. A
      // stopped one is allowed to ring out, which is why this is not part of stop().
      if (engine.running) engine.silenceTails()
      engine.song = preset.build()
    }

    baseBpm = engine.song.bpm
    playing = plan.cue
  }

  // Assigning `song` does not move the transport, and the delay is tempo-synced — so the
  // tempo goes through the engine even on the bars where it has not changed.
  engine.bpm = bpmForWave(baseBpm, plan.wave)

  if (ducked !== plan.duck) {
    if (plan.duck) engine.kaoss.set(DUCK_X, DUCK_Y, 0.09)
    else engine.kaoss.release(0.25)
    ducked = plan.duck
  }

  if (!engine.running) await engine.start()
}

function apply(): void {
  // Failures are swallowed rather than chained onto: one cue that could not be honoured
  // must not poison every cue after it.
  settling = settling.then(settle, () => {})
}

/** Point the soundtrack at a plan. Idempotent — this is called on every store change,
 *  and doing nothing because nothing moved is the common path. */
export function setMusicPlan(plan: MusicPlan): void {
  if (plan.cue === wanted.cue && plan.wave === wanted.wave && plan.duck === wanted.duck) return
  wanted = plan
  apply()
}

/** Follow the 🔊 button. Off stops the transport rather than turning the gain down: the
 *  engine schedules voices a bar ahead and there is no reason to pay for silence. */
export function setMusicEnabled(on: boolean): void {
  if (enabled === on) return
  enabled = on
  apply()
}

/** Drop the soundtrack for good. */
export function disposeMusic(): void {
  engine?.dispose()
  engine = null
  playing = null
  ducked = false
  baseBpm = 0
}

// Without this, editing anything the module graph reaches leaves the previous engine
// playing and starts a second one over the top of it — two transports, drifting, and no
// way back short of a reload.
import.meta.hot?.dispose(disposeMusic)
