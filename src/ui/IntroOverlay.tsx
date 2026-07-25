import { useGameStore } from '../game/useGameStore'
import { getGame } from '../game/useGameStore'
import { unlockAudio, Sfx } from '../game/audio'

// The title card that sits in front of the spinning globe. Fades out as the
// camera dives into the city (status === 'launching').
export function IntroOverlay() {
  const status = useGameStore((s) => s.status)
  const launch = useGameStore((s) => s.launch)
  const highScore = useGameStore((s) => s.highScore)

  if (status !== 'menu' && status !== 'launching') return null
  const leaving = status === 'launching'

  const start = () => {
    unlockAudio()
    if (getGame().soundOn) Sfx.dive()
    launch()
  }

  return (
    <div className={`intro ${leaving ? 'leaving' : ''}`}>
      <h1 className="intro-title">
        MISSILE
        <br />
        COMMAND
      </h1>
      <div className="intro-sub">3&nbsp;&nbsp;D</div>

      <div className="legend intro-legend">
        <span>
          <i className="dot" style={{ background: '#ff5a5a' }} /> warhead
        </span>
        <span>
          <i className="dot" style={{ background: '#ff9d3c' }} /> MIRV
        </span>
        <span>
          <i className="dot" style={{ background: '#e05dff' }} /> smart
        </span>
      </div>

      <button className="btn intro-btn" onClick={start} disabled={leaving}>
        {leaving ? 'LAUNCHING…' : 'START'}
      </button>
      {highScore > 0 && <div className="muted intro-hi">HI {highScore.toLocaleString()}</div>}
    </div>
  )
}
