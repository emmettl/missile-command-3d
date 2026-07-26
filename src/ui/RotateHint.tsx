import { useEffect, useState } from 'react'
import { isMobile } from '../game/device'

// The battlefield is a wide, short world, so landscape frames it far better: in
// portrait the camera has to pull a long way back to keep the outer cities on
// screen. This is a nudge, not a gate — the game is fully playable either way.
export function RotateHint() {
  const [portrait, setPortrait] = useState(false)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    if (!isMobile) return
    const mq = window.matchMedia('(orientation: portrait)')
    const update = () => setPortrait(mq.matches)
    update()
    mq.addEventListener('change', update)
    return () => mq.removeEventListener('change', update)
  }, [])

  if (!isMobile || !portrait || dismissed) return null

  return (
    <button className="rotate-hint" onClick={() => setDismissed(true)}>
      <span className="rotate-hint-icon">⟳</span>
      Rotate for a wider view
      <span className="rotate-hint-x">✕</span>
    </button>
  )
}
