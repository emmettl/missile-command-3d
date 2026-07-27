import { beforeEach, describe, expect, it } from 'vitest'
import { useGameStore } from './useGameStore'

const S = useGameStore

describe('bonus cities', () => {
  it('awards a reserve city when the score crosses a 3000 boundary', () => {
    S.setState({ score: 2980, bonusCities: 0 })
    S.getState().addScore(20)
    expect(S.getState().score).toBe(3000)
    expect(S.getState().bonusCities).toBe(1)
  })

  it('awards nothing when no boundary is crossed', () => {
    S.setState({ score: 3100, bonusCities: 0 })
    S.getState().addScore(50)
    expect(S.getState().bonusCities).toBe(0)
  })

  it('awards one per boundary crossed at once', () => {
    S.setState({ score: 2900, bonusCities: 0 })
    S.getState().addScore(6300) // crosses 3000, 6000, 9000
    expect(S.getState().bonusCities).toBe(3)
  })
})

describe('beginWave', () => {
  beforeEach(() => {
    S.setState({
      cities: [
        { id: 'a', x: 0, alive: false },
        { id: 'b', x: 1, alive: false },
        { id: 'c', x: 2, alive: true },
      ],
      waveBannerId: 5,
    })
  })

  it('spends a reserve to rebuild one destroyed city and bumps the banner', () => {
    S.setState({ bonusCities: 1 })
    S.getState().beginWave(4) // a classic wave; wave 3 is fought offshore
    const st = S.getState()
    expect(st.cities.filter((c) => c.alive)).toHaveLength(2)
    expect(st.bonusCities).toBe(0)
    expect(st.waveBannerId).toBe(6)
    expect(st.toSpawn).toBe(16) // 8 + wave*2
    expect(st.status).toBe('playing')
  })

  it('leaves cities down when there is no reserve', () => {
    S.setState({ bonusCities: 0 })
    S.getState().beginWave(1)
    expect(S.getState().cities.filter((c) => c.alive)).toHaveLength(1)
  })
})

describe('SLBM waves', () => {
  beforeEach(() => {
    S.setState({ bonusCities: 0, cities: [{ id: 'c', x: 0, alive: true }] })
    S.getState().beginWave(3)
  })

  it('puts submarines to sea and issues the mode’s weapons', () => {
    const st = S.getState()
    expect(st.waveMode).toBe('slbm')
    expect(st.submarines.length).toBe(2)
    expect(st.flakRounds).toBeGreaterThan(0)
    expect(st.strikeRounds).toBeGreaterThan(0)
    expect(st.weapon).toBe('interceptor') // always opens on the default weapon
  })

  it('packs away the mode’s weapons again on a classic wave', () => {
    S.getState().beginWave(4)
    const st = S.getState()
    expect(st.waveMode).toBe('classic')
    expect(st.submarines).toHaveLength(0)
    expect(st.flakRounds).toBe(0)
    expect(st.strikeRounds).toBe(0)
  })

  it('lobs interceptors in an SLBM wave and shoots flat in a classic one', () => {
    S.setState({ batteries: [{ id: 'b', x: 0, ammo: 5, destroyed: false }], players: [] })
    S.getState().fireAt(10, 12)
    expect(S.getState().players[0].arc).toBeDefined()

    S.getState().beginWave(4)
    S.setState({ batteries: [{ id: 'b', x: 0, ammo: 5, destroyed: false }], players: [] })
    S.getState().fireAt(10, 12)
    expect(S.getState().players[0].arc).toBeUndefined()
  })

  it('spends flak from its own rack, not the missile magazine', () => {
    S.setState({ batteries: [{ id: 'b', x: 0, ammo: 5, destroyed: false }], players: [] })
    S.getState().setWeapon('flak')
    const rounds = S.getState().flakRounds
    expect(S.getState().fireAt(4, 9)).toBe(true)
    expect(S.getState().flakRounds).toBe(rounds - 1)
    expect(S.getState().batteries[0].ammo).toBe(5)
    expect(S.getState().players[0].weapon).toBe('flak')
  })

  it('refuses a weapon with nothing left in it', () => {
    S.setState({ flakRounds: 0 })
    S.getState().setWeapon('flak')
    expect(S.getState().weapon).toBe('interceptor')
  })

  it('refuses the mode’s weapons outside the mode', () => {
    S.getState().beginWave(4)
    S.getState().setWeapon('strike')
    expect(S.getState().weapon).toBe('interceptor')
  })

  it('will not fire a strike it has no rounds for', () => {
    S.setState({ batteries: [{ id: 'b', x: 0, ammo: 5, destroyed: false }], strikeRounds: 0 })
    expect(S.getState().fireStrike(-70, 4)).toBe(false)
  })

  it('needs a battery standing to put anything up at all', () => {
    S.setState({ batteries: [{ id: 'b', x: 0, ammo: 0, destroyed: true }] })
    S.getState().setWeapon('flak')
    expect(S.getState().fireAt(4, 9)).toBe(false)
    expect(S.getState().fireStrike(-70, 4)).toBe(false)
  })

  it('shortens the wave by whatever salvo a sunk boat still owed', () => {
    const sub = S.getState().submarines[0]
    sub.phase = 'firing'
    sub.salvoLeft = 3
    const { toSpawn, score } = S.getState()

    S.getState().killSub(sub.id)

    const st = S.getState()
    expect(st.submarines.find((s) => s.id === sub.id)).toBeUndefined()
    expect(st.toSpawn).toBe(toSpawn - 3)
    expect(st.score).toBeGreaterThan(score)
  })

  it('never shortens a wave below what it has already launched', () => {
    const sub = S.getState().submarines[0]
    sub.phase = 'firing'
    sub.salvoLeft = 99
    S.setState({ spawnedThisWave: 4 })
    S.getState().killSub(sub.id)
    expect(S.getState().toSpawn).toBe(4)
  })

  it('sinks a boat once, however many strikes land on it', () => {
    const sub = S.getState().submarines[0]
    sub.phase = 'firing'
    sub.salvoLeft = 2
    S.getState().killSub(sub.id)
    const after = S.getState().toSpawn
    S.getState().killSub(sub.id)
    expect(S.getState().toSpawn).toBe(after)
  })
})

describe('startGame', () => {
  it('resets score, reserves, and starts wave 1', () => {
    S.setState({ bonusCities: 4, score: 5000 })
    S.getState().startGame()
    const st = S.getState()
    expect(st.score).toBe(0)
    expect(st.bonusCities).toBe(0)
    expect(st.wave).toBe(1)
    expect(st.toSpawn).toBe(10)
  })
})
