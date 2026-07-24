import { useGameStore } from '../game/useGameStore'

export function HUD() {
  const score = useGameStore((s) => s.score)
  const highScore = useGameStore((s) => s.highScore)
  const wave = useGameStore((s) => s.wave)
  const status = useGameStore((s) => s.status)
  const soundOn = useGameStore((s) => s.soundOn)
  const toggleSound = useGameStore((s) => s.toggleSound)
  const cities = useGameStore((s) => s.cities)

  if (status === 'menu') return null

  const alive = cities.filter((c) => c.alive).length

  return (
    <div className="hud">
      <div className="hud-left">
        <div className="hud-score">{score.toLocaleString()}</div>
        <div className="hud-sub">HI {highScore.toLocaleString()}</div>
      </div>
      <div className="hud-center">
        <div className="hud-wave">WAVE {wave}</div>
        <div className="hud-cities">
          {cities.map((c) => (
            <span key={c.id} className={c.alive ? 'city-dot alive' : 'city-dot dead'} />
          ))}
          <span className="hud-sub"> {alive}/6</span>
        </div>
      </div>
      <button className="hud-sound" onClick={toggleSound} aria-label="toggle sound">
        {soundOn ? '🔊' : '🔇'}
      </button>
    </div>
  )
}
