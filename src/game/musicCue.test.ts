import { describe, expect, it } from 'vitest'
import { bpmForWave, musicPlan } from './musicCue'
import { modeForWave } from './constants'

describe('musicPlan', () => {
  it('plays the title music across the whole intro, dive included', () => {
    expect(musicPlan('menu', 'classic', 1).cue).toBe('defcon')
    expect(musicPlan('launching', 'classic', 1).cue).toBe('defcon')
  })

  it('leaves the title music at the tempo it was written at', () => {
    // The attract screen has no wave, so the wave the player last reached must not
    // follow them back to it and speed the title music up.
    expect(musicPlan('menu', 'classic', 14).wave).toBe(1)
  })

  it('gives each wave mode its own song', () => {
    expect(musicPlan('playing', 'classic', 1).cue).toBe('cycles')
    expect(musicPlan('playing', 'slbm', 3).cue).toBe('darkwave')
    expect(musicPlan('playing', 'bombers', 5).cue).toBe('runner')
  })

  it('ducks rather than stops between waves, and keeps the same song', () => {
    const playing = musicPlan('playing', 'slbm', 3)
    const clear = musicPlan('wave-clear', 'slbm', 3)
    expect(clear.cue).toBe(playing.cue)
    expect(clear.duck).toBe(true)
    expect(playing.duck).toBe(false)
  })

  it('goes silent on game over, so the sweep has somewhere to land', () => {
    expect(musicPlan('gameover', 'classic', 9).cue).toBeNull()
    expect(musicPlan('gameover', 'classic', 9).duck).toBe(false)
  })

  it('changes song exactly when the mode changes, over the first twenty waves', () => {
    // The pairing is with the mode, not the wave number: three waves of the same mode in
    // a row must be three waves of the same song.
    const cues = Array.from({ length: 20 }, (_, i) =>
      musicPlan('playing', modeForWave(i + 1), i + 1).cue,
    )
    expect(cues).toEqual([
      'cycles', 'cycles', 'darkwave', 'cycles', 'runner',
      'darkwave', 'cycles', 'cycles', 'darkwave', 'runner',
      'cycles', 'darkwave', 'cycles', 'cycles', 'runner',
      'cycles', 'cycles', 'darkwave', 'cycles', 'runner',
    ])
  })
})

describe('bpmForWave', () => {
  it('plays wave one exactly as written', () => {
    expect(bpmForWave(128, 1)).toBe(128)
  })

  it('lifts the tempo as the game gets harder', () => {
    expect(bpmForWave(128, 3)).toBeGreaterThan(bpmForWave(128, 1))
    expect(bpmForWave(128, 9)).toBeGreaterThan(bpmForWave(128, 3))
  })

  it('stops lifting before the patterns stop being themselves', () => {
    expect(bpmForWave(128, 200)).toBe(140)
    expect(bpmForWave(82, 200)).toBe(94)
  })

  it('never returns a fractional tempo', () => {
    for (let wave = 1; wave <= 20; wave++) {
      expect(Number.isInteger(bpmForWave(128, wave))).toBe(true)
    }
  })
})
