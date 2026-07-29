import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { startAudioRecovery, type RecoverableContext } from './audioRecovery'

// The bug this guards against is a recovery path that reads correctly and never runs.
// So these assert that the attempts actually happen — repeatedly, from each of the four
// routes — rather than that the code is arranged a particular way.

/** An AudioContext whose state a test drives. `resume` only succeeds once the test says
 *  the interruption is over, which is how iOS behaves: it settles either way. */
class FakeContext implements RecoverableContext {
  state = 'running'
  resumes = 0
  /** Set false to model an interruption that has not ended yet. */
  resumeWorks = true
  private readonly listeners = new Set<() => void>()

  resume(): Promise<void> {
    this.resumes++
    if (this.resumeWorks) this.setState('running')
    return Promise.resolve()
  }

  addEventListener(_type: 'statechange', listener: () => void): void {
    this.listeners.add(listener)
  }

  removeEventListener(_type: 'statechange', listener: () => void): void {
    this.listeners.delete(listener)
  }

  /** What the browser does: change state, then fire statechange. */
  setState(state: string): void {
    if (this.state === state) return
    this.state = state
    for (const listener of [...this.listeners]) listener()
  }

  get listenerCount(): number {
    return this.listeners.size
  }
}

/** Records what was registered, so a test can fire an event the way the browser would
 *  and can check that teardown really removed it. */
class FakeTarget {
  readonly handlers = new Map<string, Set<() => void>>()

  addEventListener(type: string, listener: () => void): void {
    const set = this.handlers.get(type) ?? new Set()
    set.add(listener)
    this.handlers.set(type, set)
  }

  removeEventListener(type: string, listener: () => void): void {
    this.handlers.get(type)?.delete(listener)
  }

  fire(type: string): void {
    for (const listener of [...(this.handlers.get(type) ?? [])]) listener()
  }

  get total(): number {
    let n = 0
    for (const set of this.handlers.values()) n += set.size
    return n
  }
}

function harness(ctx: RecoverableContext | null) {
  const win = new FakeTarget()
  const doc = new FakeTarget()
  const recovered = vi.fn()
  let context = ctx
  const stop = startAudioRecovery({
    getContext: () => context,
    window: win,
    document: doc,
    onRecovered: recovered,
    intervalMs: 1000,
  })
  return { win, doc, recovered, stop, appear: (c: RecoverableContext) => (context = c) }
}

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('startAudioRecovery', () => {
  it('keeps asking for as long as the interruption lasts', async () => {
    // The heart of it. A single attempt from one event is what failed on iOS: the
    // interruption is still on when the event lands, so the one attempt is wasted.
    const ctx = new FakeContext()
    ctx.resumeWorks = false
    ctx.setState('interrupted')
    const { recovered, stop } = harness(ctx)

    expect(ctx.resumes).toBe(1)
    for (let i = 0; i < 5; i++) await vi.advanceTimersByTimeAsync(1000)
    expect(ctx.resumes).toBe(6)
    expect(recovered).not.toHaveBeenCalled()

    // iOS decides the interruption is over; the next poll is the one that gets it back.
    ctx.resumeWorks = true
    await vi.advanceTimersByTimeAsync(1000)
    expect(ctx.state).toBe('running')
    expect(recovered).toHaveBeenCalledTimes(1)

    // And then it stops asking, rather than resuming a context that is already running.
    const settled = ctx.resumes
    await vi.advanceTimersByTimeAsync(5000)
    expect(ctx.resumes).toBe(settled)
    stop()
  })

  it('resolving is not the same as running', async () => {
    // An interrupted context settles resume() and stays interrupted. Concluding success
    // from the promise is how a recovery reports itself fixed while still silent.
    const ctx = new FakeContext()
    ctx.resumeWorks = false
    ctx.setState('interrupted')
    const { recovered, stop } = harness(ctx)

    await vi.advanceTimersByTimeAsync(0)
    expect(recovered).not.toHaveBeenCalled()
    expect(ctx.state).toBe('interrupted')
    stop()
  })

  it('reacts to the context interrupting on its own', async () => {
    // A call arriving while you are looking at the screen fires statechange and nothing
    // else — no visibility change, no gesture, no page event.
    const ctx = new FakeContext()
    const { recovered, stop } = harness(ctx)
    expect(ctx.listenerCount).toBe(1)

    ctx.resumeWorks = false
    ctx.setState('interrupted')
    expect(ctx.resumes).toBeGreaterThan(0)

    ctx.resumeWorks = true
    await vi.advanceTimersByTimeAsync(1000)
    expect(ctx.state).toBe('running')
    expect(recovered).toHaveBeenCalledTimes(1)
    stop()
  })

  it.each(['visibilitychange', 'pageshow', 'focus', 'pointerdown', 'touchend', 'click'])(
    'tries again on %s',
    async (event) => {
      const ctx = new FakeContext()
      ctx.resumeWorks = false
      ctx.setState('interrupted')
      const { win, doc, stop } = harness(ctx)

      const before = ctx.resumes
      ctx.resumeWorks = true
      ;(event === 'visibilitychange' ? doc : win).fire(event)
      await vi.advanceTimersByTimeAsync(0)

      expect(ctx.resumes).toBe(before + 1)
      expect(ctx.state).toBe('running')
      stop()
    },
  )

  it('attaches to a context that does not exist yet', async () => {
    // Nothing creates one until the player's first gesture, so at mount there is nothing
    // to listen to and the watchdog must not be what brings one into being.
    const { appear, recovered, stop } = harness(null)
    await vi.advanceTimersByTimeAsync(3000)

    const ctx = new FakeContext()
    ctx.resumeWorks = false
    ctx.setState('interrupted')
    appear(ctx)

    await vi.advanceTimersByTimeAsync(1000)
    expect(ctx.listenerCount).toBe(1)
    expect(ctx.resumes).toBeGreaterThan(0)

    ctx.resumeWorks = true
    await vi.advanceTimersByTimeAsync(1000)
    expect(recovered).toHaveBeenCalledTimes(1)
    stop()
  })

  it('announces each interruption once, not each attempt', async () => {
    const ctx = new FakeContext()
    const { recovered, stop } = harness(ctx)

    for (let round = 0; round < 3; round++) {
      ctx.resumeWorks = false
      ctx.setState('interrupted')
      await vi.advanceTimersByTimeAsync(3000)
      ctx.resumeWorks = true
      await vi.advanceTimersByTimeAsync(1000)
    }

    expect(recovered).toHaveBeenCalledTimes(3)
    stop()
  })

  it('lets go of everything on teardown', async () => {
    const ctx = new FakeContext()
    const { win, doc, stop } = harness(ctx)
    // pageshow, focus and the three gestures on the window; visibilitychange on the doc.
    expect(win.total + doc.total).toBe(6)

    stop()
    expect(win.total + doc.total).toBe(0)
    expect(ctx.listenerCount).toBe(0)

    ctx.resumeWorks = false
    ctx.setState('interrupted')
    const after = ctx.resumes
    await vi.advanceTimersByTimeAsync(5000)
    expect(ctx.resumes).toBe(after)
  })
})
