import { useEffect } from 'react'
import { peekAudioContext } from './audio'
import { retryMusic } from './music'

// Getting the sound back after iOS takes it away.
//
// Backgrounding Safari suspends the AudioContext, and a phone call or another app
// claiming audio does the same. Nothing ever asked for it back, so the symptom is that
// sound stops when you navigate away and never returns — and with music playing it looks
// alive the whole time, because the transport carries on ticking in its Worker,
// scheduling into a context that is not running.
//
// Ported from driftbox's packages/app/src/audio-recovery.ts, which is where this was
// worked out. Four things get it back, in order of how much they ask of the player:
//
//   1. The page becoming visible again. Sometimes enough on its own.
//   2. The context's own `statechange`, which is what fires for an interruption that is
//      not a visibility change — a call arriving while you are looking at the screen.
//   3. A retry every second for as long as it is still stalled.
//   4. Any tap, anywhere. Some iOS versions refuse to resume outside a user gesture, and
//      when that happens the first three silently fail. In this game the backstop costs
//      nothing at all, because the next thing the player does is tap to fire.
//
// Three and two are the substance of it. A single attempt fired from `visibilitychange`
// lands on iOS while the context is still `interrupted`, fails, and is never tried again —
// an interruption ends when iOS decides it ends, and the only way to find out is to keep
// asking.
//
// What this does NOT do is keep audio playing in the background. Safari does not allow a
// Web Audio page to do that, and pretending otherwise with a silent looping <audio>
// element is a trick that works on some versions and not others. Coming straight back
// when you return is the honest version of the feature.

/**
 * The parts of `AudioContext` this needs, so the retry behaviour can be tested against a
 * context whose state a test controls. Testing it is the point rather than tidiness: the
 * failure this fixes was a recovery path that existed on paper and had never once run.
 */
export interface RecoverableContext {
  readonly state: string
  resume(): Promise<void>
  addEventListener(type: 'statechange', listener: () => void): void
  removeEventListener(type: 'statechange', listener: () => void): void
}

/** The bits of `window` and `document` this listens to. */
export interface ListenerTarget {
  addEventListener(type: string, listener: () => void, options?: unknown): void
  removeEventListener(type: string, listener: () => void, options?: unknown): void
}

export interface RecoveryOptions {
  /** The shared context, or null if nothing has created one yet — which is the normal
   *  state of the world before the player has touched the page. */
  getContext: () => RecoverableContext | null
  window: ListenerTarget
  document: ListenerTarget
  /** Called on the transition back to running, once per interruption. */
  onRecovered?: () => void
  /** How often to keep asking while stalled. */
  intervalMs?: number
}

/** Safari reports a non-standard 'interrupted' alongside the spec's states, so the test
 *  is "not running" rather than a list of the ones we know about. */
function stalled(ctx: RecoverableContext): boolean {
  return ctx.state !== 'running'
}

const GESTURES = ['pointerdown', 'touchend', 'click'] as const

/**
 * Watch the audio context and keep trying to bring it back. Returns the teardown.
 *
 * Plain function rather than a hook so the retrying is reachable from a test; `useAudio
 * Recovery` below is the two-line React wrapper.
 */
export function startAudioRecovery(options: RecoveryOptions): () => void {
  const { getContext, window: win, document: doc, onRecovered, intervalMs = 1000 } = options

  let cancelled = false
  /** The context we hold a statechange listener on, so it is attached exactly once and
   *  moved if the context is ever replaced. */
  let watched: RecoverableContext | null = null
  /** Whether we have seen it stalled since it was last running, so recovery is announced
   *  once per interruption rather than on every poll. */
  let wasStalled = false

  /**
   * Re-read the real state after an attempt, and announce a recovery if one happened.
   *
   * Deliberately NOT another attempt. Retrying from the resume promise looks like the
   * same thing and is an unbounded microtask loop: an interrupted context settles the
   * promise immediately, so a handler that resumes again never yields.
   */
  const settleState = () => {
    if (cancelled) return
    const ctx = getContext()
    if (!ctx || stalled(ctx) || !wasStalled) return
    wasStalled = false
    onRecovered?.()
  }

  const recover = () => {
    if (cancelled) return
    const ctx = getContext()
    if (!ctx) return

    // The context is created lazily — on the player's first gesture — so the listener
    // cannot be attached up front. The first chance is whenever we next look and find one.
    if (watched !== ctx) {
      watched?.removeEventListener('statechange', recover)
      watched = ctx
      watched.addEventListener('statechange', recover)
    }

    if (!stalled(ctx)) {
      if (wasStalled) {
        wasStalled = false
        onRecovered?.()
      }
      return
    }

    wasStalled = true
    // `resume()` is reached synchronously from here, so when this runs from a pointer
    // handler the user gesture is still live. Anything awaited first would spend it,
    // which is the classic way to make a resume work everywhere except iOS.
    //
    // Resolving is not the same as running: an interrupted context on iOS settles this
    // promise and stays interrupted. So nothing is concluded from it either way — the
    // handler re-reads the real state, and a failed attempt just leaves the next poll
    // to try again.
    void ctx.resume().then(settleState, settleState)
  }

  const onVisibility = () => recover()

  doc.addEventListener('visibilitychange', onVisibility)
  win.addEventListener('pageshow', recover)
  win.addEventListener('focus', recover)
  // Capture, so it runs before anything that might stop propagation, and passive because
  // it never prevents the gesture it is listening to. All three, not just one: which
  // events count as a gesture for `resume()` has differed between iOS versions, and they
  // are idempotent when the context is already running.
  for (const type of GESTURES) {
    win.addEventListener(type, recover, { capture: true, passive: true })
  }

  // Keep asking. This is the one that actually gets the sound back when the interruption
  // outlasts the events, and it also catches a state change that fires no event at all,
  // which iOS has been known to do.
  const poll = setInterval(recover, intervalMs)
  recover()

  return (): void => {
    cancelled = true
    clearInterval(poll)
    watched?.removeEventListener('statechange', recover)
    doc.removeEventListener('visibilitychange', onVisibility)
    win.removeEventListener('pageshow', recover)
    win.removeEventListener('focus', recover)
    for (const type of GESTURES) {
      win.removeEventListener(type, recover, { capture: true })
    }
  }
}

/**
 * Run the recovery for as long as the app is mounted.
 *
 * Aimed at the context in audio.ts rather than at the music engine, because that is the
 * one context both the effects and the soundtrack are on — an interruption takes the
 * whole game's audio, not just the music, and one watcher brings all of it back.
 */
export function useAudioRecovery(): void {
  useEffect(
    () =>
      startAudioRecovery({
        getContext: peekAudioContext,
        window,
        document,
        // A resume that fails leaves the transport stopped, and nothing else would ever
        // start it again — the plan has not changed, so the music would stay silent on a
        // context that is now perfectly able to play it.
        onRecovered: retryMusic,
      }),
    [],
  )
}
