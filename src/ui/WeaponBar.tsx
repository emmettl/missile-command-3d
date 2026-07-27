import { useEffect } from 'react'
import { useGameStore } from '../game/useGameStore'
import type { WeaponKind } from '../game/types'

// The three things you can put in the air during an SLBM wave. Shown only in that mode —
// a classic wave has one weapon and needs no chooser.
const WEAPONS: { kind: WeaponKind; key: string; label: string; hint: string }[] = [
  { kind: 'interceptor', key: '1', label: 'INTERCEPT', hint: 'lobbed — lead the target' },
  { kind: 'flak', key: '2', label: 'FLAK', hint: 'hangs in the sky' },
  { kind: 'strike', key: '3', label: 'STRIKE', hint: 'kills a surfaced boat' },
]

export function WeaponBar() {
  const mode = useGameStore((s) => s.waveMode)
  const status = useGameStore((s) => s.status)
  const weapon = useGameStore((s) => s.weapon)
  const setWeapon = useGameStore((s) => s.setWeapon)
  const flakRounds = useGameStore((s) => s.flakRounds)
  const strikeRounds = useGameStore((s) => s.strikeRounds)
  const batteries = useGameStore((s) => s.batteries)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const found = WEAPONS.find((w) => w.key === e.key)
      if (found) setWeapon(found.kind)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [setWeapon])

  if (mode !== 'slbm' || (status !== 'playing' && status !== 'wave-clear')) return null

  const missiles = batteries.reduce((n, b) => n + b.ammo, 0)
  const rounds: Record<WeaponKind, number> = {
    interceptor: missiles,
    flak: flakRounds,
    strike: strikeRounds,
  }

  return (
    <div className="weapon-bar">
      {WEAPONS.map((w) => {
        const left = rounds[w.kind]
        return (
          <button
            key={w.kind}
            className={`weapon ${weapon === w.kind ? 'on' : ''} ${left <= 0 ? 'spent' : ''}`}
            onClick={() => setWeapon(w.kind)}
            disabled={left <= 0}
            title={w.hint}
          >
            <span className="weapon-key">{w.key}</span>
            <span className="weapon-label">{w.label}</span>
            <span className="weapon-rounds">{left}</span>
          </button>
        )
      })}
    </div>
  )
}
