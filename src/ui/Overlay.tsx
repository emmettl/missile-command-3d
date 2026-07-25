import { useGameStore } from '../game/useGameStore'
import { unlockAudio } from '../game/audio'

export function Overlay() {
  const status = useGameStore((s) => s.status)
  const score = useGameStore((s) => s.score)
  const highScore = useGameStore((s) => s.highScore)
  const wave = useGameStore((s) => s.wave)
  const startGame = useGameStore((s) => s.startGame)

  const start = () => {
    unlockAudio()
    startGame()
  }

  if (status === 'playing') return null

  if (status === 'wave-clear') {
    return (
      <div className="overlay overlay-clear">
        <div className="overlay-card small">
          <h2>WAVE {wave} CLEARED</h2>
          <p className="muted">Bonus awarded · next wave incoming…</p>
        </div>
      </div>
    )
  }

  if (status === 'gameover') {
    return (
      <div className="overlay">
        <div className="overlay-card">
          <h1 className="danger">GAME OVER</h1>
          <p className="big">{score.toLocaleString()}</p>
          <p className="muted">high score {highScore.toLocaleString()} · reached wave {wave}</p>
          <button className="btn" onClick={start}>
            PLAY AGAIN
          </button>
        </div>
      </div>
    )
  }

  // The menu/launching states are handled by IntroOverlay + IntroScene.
  return null
}
