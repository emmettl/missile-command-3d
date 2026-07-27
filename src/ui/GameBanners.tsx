import { useEffect, useRef, useState } from 'react'
import { useGameStore } from '../game/useGameStore'
import { slbmWarningDue } from '../game/constants'
import { Sfx } from '../game/audio'

// Red standing warning through the tail of the wave before an SLBM attack, so the mode
// change is something you see coming rather than something that happens to you.
export function SlbmWarning() {
  const wave = useGameStore((s) => s.wave)
  const status = useGameStore((s) => s.status)
  const toSpawn = useGameStore((s) => s.toSpawn)
  const spawned = useGameStore((s) => s.spawnedThisWave)
  const soundOn = useGameStore((s) => s.soundOn)

  const due = slbmWarningDue(wave, spawned, toSpawn) && (status === 'playing' || status === 'wave-clear')
  const sounded = useRef(false)

  useEffect(() => {
    if (!due) {
      sounded.current = false
      return
    }
    if (!sounded.current) {
      sounded.current = true
      if (soundOn) Sfx.alarm()
    }
  }, [due, soundOn])

  if (!due) return null
  return (
    <div className="slbm-warning">
      {/* Marked out with glyphs the pixel face actually carries — a warning sign falls
          back to the system font and lands somewhere off to the left of the line. */}
      <div className="sw-title">&gt;&gt; SLBM ATTACK INCOMING &lt;&lt;</div>
      <div className="sw-sub">SUBMARINE CONTACT — WAVE {wave + 1}</div>
    </div>
  )
}

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
        <div className="wb-note">1 INTERCEPT · 2 FLAK · 3 STRIKE</div>
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
