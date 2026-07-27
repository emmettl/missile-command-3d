import { describe, expect, it } from 'vitest'
import { weaponPrompt } from './WeaponBar'

const base = { subsExposed: 0, strikeRounds: 3, flakRounds: 6, used: [] as never[] }

describe('weapon prompt', () => {
  it('calls out a surfaced boat, which is the only time a strike is worth anything', () => {
    expect(weaponPrompt({ ...base, subsExposed: 1 })).toMatch(/3/)
    expect(weaponPrompt({ ...base, subsExposed: 1 })).toMatch(/SURFACED/)
  })

  it('stops mentioning a weapon once the player has actually fired one', () => {
    expect(weaponPrompt({ ...base, subsExposed: 1, used: ['strike'] })).not.toMatch(/SURFACED/)
    expect(weaponPrompt({ ...base, used: ['flak', 'strike'] })).toBeNull()
  })

  it('falls back to flak when there is nothing on the surface', () => {
    expect(weaponPrompt(base)).toMatch(/FLAK/)
  })

  it('says nothing about a weapon with no rounds left', () => {
    expect(weaponPrompt({ ...base, subsExposed: 2, strikeRounds: 0, flakRounds: 0 })).toBeNull()
  })

  it('prefers the surfaced boat over the standing flak nudge', () => {
    // Both are available and untried; the one with a target on screen wins.
    expect(weaponPrompt({ ...base, subsExposed: 1 })).toMatch(/SURFACED/)
  })
})
