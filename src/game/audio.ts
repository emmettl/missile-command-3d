// Tiny procedural sound engine — no audio files, just WebAudio oscillators.
// All calls are no-ops until the first user gesture unlocks the AudioContext.

let ctx: AudioContext | null = null

function ensureCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null
  if (!ctx) {
    const AC = window.AudioContext || (window as any).webkitAudioContext
    if (!AC) return null
    ctx = new AC()
  }
  if (ctx.state === 'suspended') void ctx.resume()
  return ctx
}

// Call from a user gesture (click) to satisfy autoplay policies.
export function unlockAudio() {
  ensureCtx()
}

interface ToneOpts {
  freq: number
  toFreq?: number
  duration: number
  type?: OscillatorType
  gain?: number
}

function tone({ freq, toFreq, duration, type = 'sine', gain = 0.2 }: ToneOpts) {
  const ac = ensureCtx()
  if (!ac) return
  const now = ac.currentTime
  const osc = ac.createOscillator()
  const g = ac.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(freq, now)
  if (toFreq !== undefined) osc.frequency.exponentialRampToValueAtTime(Math.max(1, toFreq), now + duration)
  g.gain.setValueAtTime(0.0001, now)
  g.gain.exponentialRampToValueAtTime(gain, now + 0.01)
  g.gain.exponentialRampToValueAtTime(0.0001, now + duration)
  osc.connect(g).connect(ac.destination)
  osc.start(now)
  osc.stop(now + duration + 0.02)
}

function noiseBurst(duration: number, gain = 0.25) {
  const ac = ensureCtx()
  if (!ac) return
  const now = ac.currentTime
  const frames = Math.floor(ac.sampleRate * duration)
  const buffer = ac.createBuffer(1, frames, ac.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < frames; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / frames)
  const src = ac.createBufferSource()
  src.buffer = buffer
  const g = ac.createGain()
  g.gain.setValueAtTime(gain, now)
  g.gain.exponentialRampToValueAtTime(0.0001, now + duration)
  const filter = ac.createBiquadFilter()
  filter.type = 'lowpass'
  filter.frequency.setValueAtTime(900, now)
  src.connect(filter).connect(g).connect(ac.destination)
  src.start(now)
  src.stop(now + duration)
}

export const Sfx = {
  launch: () => tone({ freq: 220, toFreq: 900, duration: 0.18, type: 'sawtooth', gain: 0.12 }),
  explosion: () => noiseBurst(0.4, 0.22),
  cityHit: () => tone({ freq: 200, toFreq: 40, duration: 0.5, type: 'square', gain: 0.2 }),
  waveClear: () => {
    tone({ freq: 523, duration: 0.14, type: 'triangle', gain: 0.15 })
    setTimeout(() => tone({ freq: 784, duration: 0.22, type: 'triangle', gain: 0.15 }), 130)
  },
  gameOver: () => tone({ freq: 300, toFreq: 60, duration: 1.0, type: 'sawtooth', gain: 0.2 }),
  empty: () => tone({ freq: 120, duration: 0.08, type: 'square', gain: 0.08 }),
  dive: () => {
    tone({ freq: 90, toFreq: 1300, duration: 1.9, type: 'sawtooth', gain: 0.12 })
    tone({ freq: 140, toFreq: 900, duration: 1.9, type: 'sine', gain: 0.1 })
  },
  bonus: () => {
    tone({ freq: 660, duration: 0.12, type: 'triangle', gain: 0.14 })
    setTimeout(() => tone({ freq: 990, duration: 0.18, type: 'triangle', gain: 0.14 }), 110)
  },
}
