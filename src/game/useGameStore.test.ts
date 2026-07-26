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
    S.getState().beginWave(3)
    const st = S.getState()
    expect(st.cities.filter((c) => c.alive)).toHaveLength(2)
    expect(st.bonusCities).toBe(0)
    expect(st.waveBannerId).toBe(6)
    expect(st.toSpawn).toBe(14) // 8 + wave*2
    expect(st.status).toBe('playing')
  })

  it('leaves cities down when there is no reserve', () => {
    S.setState({ bonusCities: 0 })
    S.getState().beginWave(1)
    expect(S.getState().cities.filter((c) => c.alive)).toHaveLength(1)
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
