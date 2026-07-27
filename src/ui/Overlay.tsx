import { useEffect } from 'react'
import { useGameStore } from '../game/useGameStore'
import { unlockAudio } from '../game/audio'

/** How long the final score stays up before the game returns to the attract screen. */
const ATTRACT_AFTER = 8000

export function Overlay() {
  const status = useGameStore((s) => s.status)
  const score = useGameStore((s) => s.score)
  const highScore = useGameStore((s) => s.highScore)
  const wave = useGameStore((s) => s.wave)
  const startGame = useGameStore((s) => s.startGame)
  const setStatus = useGameStore((s) => s.setStatus)

  // A cabinet nobody is playing goes back to attracting. Cancelled if the player takes
  // the game up again first — the cleanup runs the moment status leaves 'gameover'.
  useEffect(() => {
    if (status !== 'gameover') return
    const t = setTimeout(() => setStatus('menu'), ATTRACT_AFTER)
    return () => clearTimeout(t)
  }, [status, setStatus])

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
          <p className="muted faint">returning to attract mode…</p>
        </div>
      </div>
    )
  }

  // The menu/launching states are handled by IntroOverlay + IntroScene.
  return null
}
