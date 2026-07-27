import { useEffect } from 'react'
import { useGameStore } from '../game/useGameStore'
import type { WeaponKind } from '../game/types'

// The three things you can put in the air during an SLBM wave. Shown only in that mode —
// a classic wave has one weapon and needs no chooser.
//
// The bar sits at the edge of vision while the fight is in the middle of the screen, so
// it is easy to play a whole wave on the one weapon you already know and never find out
// the other two exist. Two things push back on that: a weapon you have never fired keeps
// advertising itself, and when there is finally something only one weapon can deal with,
// the bar says so in as many words.
const WEAPONS: { kind: WeaponKind; key: string; label: string; hint: string }[] = [
  { kind: 'interceptor', key: '1', label: 'INTERCEPT', hint: 'lobbed — lead the target' },
  { kind: 'flak', key: '2', label: 'FLAK', hint: 'hangs in the sky' },
  { kind: 'strike', key: '3', label: 'STRIKE', hint: 'kills a surfaced boat' },
]

/** What the bar should be saying, if anything. Most of the time: nothing. */
function prompt(opts: {
  subsExposed: number
  strikeRounds: number
  flakRounds: number
  used: WeaponKind[]
}): string | null {
  const { subsExposed, strikeRounds, flakRounds, used } = opts
  // A boat on the surface is the one moment a strike is worth anything, so it outranks
  // everything else — and it keeps prompting until the player has actually used one.
  if (subsExposed > 0 && strikeRounds > 0 && !used.includes('strike')) {
    return `BOAT SURFACED — PRESS 3 TO SINK IT`
  }
  if (flakRounds > 0 && !used.includes('flak')) {
    return `PRESS 2 FOR FLAK — IT HANGS WHERE YOU PUT IT`
  }
  return null
}

export function WeaponBar() {
  const mode = useGameStore((s) => s.waveMode)
  const status = useGameStore((s) => s.status)
  const weapon = useGameStore((s) => s.weapon)
  const setWeapon = useGameStore((s) => s.setWeapon)
  const flakRounds = useGameStore((s) => s.flakRounds)
  const strikeRounds = useGameStore((s) => s.strikeRounds)
  const batteries = useGameStore((s) => s.batteries)
  const weaponsUsed = useGameStore((s) => s.weaponsUsed)
  const subsExposed = useGameStore((s) => s.subsExposed)

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
  const nudge = prompt({ subsExposed, strikeRounds, flakRounds, used: weaponsUsed })

  return (
    <div className="weapon-dock">
      {nudge && <div className="weapon-prompt">{nudge}</div>}
      <div className="weapon-bar">
        {WEAPONS.map((w) => {
          const left = rounds[w.kind]
          // Anything with rounds in it that has never been fired keeps drawing the eye.
          const untried = left > 0 && !weaponsUsed.includes(w.kind)
          return (
            <button
              key={w.kind}
              className={[
                'weapon',
                weapon === w.kind ? 'on' : '',
                left <= 0 ? 'spent' : '',
                untried ? 'untried' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              onClick={() => setWeapon(w.kind)}
              disabled={left <= 0}
              title={w.hint}
            >
              <span className="weapon-key">{w.key}</span>
              <span className="weapon-label">{w.label}</span>
              <span className="weapon-rounds">{left}</span>
              {untried && <span className="weapon-new" aria-hidden />}
            </button>
          )
        })}
      </div>
    </div>
  )
}

export { prompt as weaponPrompt }
