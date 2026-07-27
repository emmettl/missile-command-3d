import { useEffect, useRef, useState } from 'react'
import { useGameStore } from '../game/useGameStore'
import { Sfx } from '../game/audio'

// "WAVE N — M INCOMING" card shown briefly at the start of each wave, or the mode's own
// callsign when the war moves offshore.
export function WaveBanner() {
  const id = useGameStore((s) => s.waveBannerId)
  const wave = useGameStore((s) => s.wave)
  const toSpawn = useGameStore((s) => s.toSpawn)
  const status = useGameStore((s) => s.status)
  const mode = useGameStore((s) => s.waveMode)
  const subs = useGameStore((s) => s.submarines.length)
  const [show, setShow] = useState(false)

  useEffect(() => {
    if (id === 0) return
    setShow(true)
    // The offshore banner holds a beat longer — it is also the camera swinging round.
    const t = setTimeout(() => setShow(false), mode === 'slbm' ? 3200 : 2400)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  if (!show || status !== 'playing') return null
  if (mode === 'slbm') {
    return (
      <div className="wave-banner slbm">
        <div className="wb-wave">SLBM ATTACK</div>
        <div className="wb-count">
          WAVE {wave} — {subs} {subs === 1 ? 'BOAT' : 'BOATS'} ON SONAR
        </div>
        <div className="wb-note">SURFACED BOATS CAN BE SUNK</div>
      </div>
    )
  }
  return (
    <div className="wave-banner">
      <div className="wb-wave">WAVE {wave}</div>
      <div className="wb-count">{toSpawn} INCOMING</div>
    </div>
  )
}

// Transient toast when the score earns a reserve city.
export function BonusToast() {
  const bonus = useGameStore((s) => s.bonusCities)
  const soundOn = useGameStore((s) => s.soundOn)
  const prev = useRef(bonus)
  const [show, setShow] = useState(false)

  useEffect(() => {
    if (bonus > prev.current) {
      setShow(true)
      if (soundOn) Sfx.bonus()
      const t = setTimeout(() => setShow(false), 1900)
      prev.current = bonus
      return () => clearTimeout(t)
    }
    prev.current = bonus
  }, [bonus, soundOn])

  if (!show) return null
  return <div className="bonus-toast">◉ BONUS CITY</div>
}

// White flash that masks the hard cut from the globe dive to the battlefield.
export function FlashOverlay() {
  const status = useGameStore((s) => s.status)
  const prev = useRef(status)
  const [flash, setFlash] = useState(false)

  useEffect(() => {
    if (prev.current === 'launching' && status === 'playing') {
      setFlash(true)
      const t = setTimeout(() => setFlash(false), 650)
      prev.current = status
      return () => clearTimeout(t)
    }
    prev.current = status
  }, [status])

  return <div className={`flash ${flash ? 'on' : ''}`} />
}
