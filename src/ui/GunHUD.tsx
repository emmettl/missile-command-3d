import { useEffect, useRef, useState } from 'react'
import { Vector3 } from 'three'
import { BATTERIES, GUN_LOCKOUT_BELOW, canChangePosition } from '../game/constants'
import { angleDelta, bearingTo } from '../game/bombers'
import { eyePosition } from '../game/gun'
import { getGame, useGameStore } from '../game/useGameStore'
import { isTouch } from '../game/device'

// Everything you need while stood behind the gun.
//
// The contact strip is the important part. The mode is built on only being able to face
// one way, which is only a game — rather than an ambush — if you can tell there is
// something behind you without being told exactly what or where. So the strip carries
// bearings, and nothing else: no altitude, no count, no range.

/** How wide a slice of the compass the strip shows either side of where you are facing. */
const STRIP_HALF_ANGLE = Math.PI // the whole compass, so nothing is ever off the end

interface Contact {
  /** Screen position across the strip, -1 (hard left) to 1 (hard right). */
  x: number
  /** Roughly how close, 0..1, for size — never exact range. */
  near: number
  /** In front of you rather than behind. */
  ahead: boolean
}

const _eye = new Vector3()

export function GunHUD() {
  const mode = useGameStore((s) => s.waveMode)
  const status = useGameStore((s) => s.status)
  const wave = useGameStore((s) => s.wave)
  const batteries = useGameStore((s) => s.batteries)
  const manPosition = useGameStore((s) => s.manPosition)

  // The gun and the contacts move every frame; polling a few times a second is plenty
  // for a HUD and keeps the simulation from re-rendering React.
  const [heat, setHeat] = useState(0)
  const [jammed, setJammed] = useState(false)
  const [position, setPosition] = useState(1)
  const [contacts, setContacts] = useState<Contact[]>([])
  const frame = useRef(0)

  useEffect(() => {
    if (mode !== 'bombers') return
    const id = window.setInterval(() => {
      const g = getGame()
      setHeat(g.gun.heat)
      setJammed(g.gun.jammed)
      setPosition(g.gun.position)
      eyePosition(g.gun.position, _eye)
      const found: Contact[] = []
      for (const b of g.bombers) {
        if (!b.alive) continue
        const delta = angleDelta(g.gun.yaw, bearingTo(_eye, b.pos))
        const range = _eye.distanceTo(b.pos)
        found.push({
          x: Math.max(-1, Math.min(1, delta / STRIP_HALF_ANGLE)),
          near: Math.max(0.25, Math.min(1, 1 - range / 160)),
          ahead: Math.abs(delta) < Math.PI / 2,
        })
      }
      setContacts(found)
      frame.current++
    }, 120)
    return () => window.clearInterval(id)
  }, [mode])

  useEffect(() => {
    if (mode !== 'bombers' || !canChangePosition(wave)) return
    const onKey = (e: KeyboardEvent) => {
      const index = ['1', '2', '3'].indexOf(e.key)
      if (index >= 0) manPosition(index)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [mode, wave, manPosition])

  if (mode !== 'bombers' || (status !== 'playing' && status !== 'wave-clear')) return null

  const overheating = heat > 0.75
  return (
    <div className="gun-hud">
      <div className="contact-strip" aria-label="contact bearings">
        <div className="strip-centre" />
        {contacts.map((c, i) => (
          <span
            key={i}
            className={`contact ${c.ahead ? 'ahead' : 'behind'}`}
            style={{
              left: `${50 + c.x * 50}%`,
              transform: `translate(-50%, -50%) scale(${0.7 + c.near * 0.8})`,
            }}
          />
        ))}
      </div>

      <div className={`crosshair ${jammed ? 'jammed' : ''}`}>
        <i />
        <i />
        <i />
        <i />
      </div>

      <div className="gun-bottom">
        <div className={`heat ${jammed ? 'jammed' : overheating ? 'hot' : ''}`}>
          <div className="heat-fill" style={{ width: `${Math.round(heat * 100)}%` }} />
          <div
            className="heat-reset"
            style={{ left: `${Math.round(GUN_LOCKOUT_BELOW * 100)}%` }}
            title="cools to here before it will fire again"
          />
          <span className="heat-label">{jammed ? 'JAMMED — COOLING' : 'HEAT'}</span>
        </div>

        {canChangePosition(wave) && (
          <div className="positions">
            {BATTERIES.map((b, i) => (
              <button
                key={b.id}
                className={`position ${position === i ? 'on' : ''} ${
                  batteries[i]?.destroyed ? 'gone' : ''
                }`}
                onClick={() => manPosition(i)}
                disabled={batteries[i]?.destroyed}
              >
                {i + 1}
              </button>
            ))}
          </div>
        )}
      </div>

      {isTouch && <TouchTrigger />}
    </div>
  )
}

/** Touch has no button to hold, so it gets one. */
function TouchTrigger() {
  const setFiring = useGameStore((s) => s.setFiring)
  return (
    <button
      className="trigger"
      onPointerDown={(e) => {
        e.preventDefault()
        setFiring(true)
      }}
      onPointerUp={() => setFiring(false)}
      onPointerCancel={() => setFiring(false)}
      onPointerLeave={() => setFiring(false)}
    >
      FIRE
    </button>
  )
}
