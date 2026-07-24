// Tiny camera-shake energy store, kept outside React/zustand so triggering a shake
// never causes a re-render. The GameLoop adds energy; the CameraRig consumes it.

let energy = 0

export function addShake(amount: number) {
  energy = Math.max(energy, amount)
}

// Returns the current shake offset magnitude and decays the energy for `dt` seconds.
export function stepShake(dt: number): number {
  if (energy <= 0) return 0
  const current = energy
  energy = Math.max(0, energy - dt * 2.4) // decay to zero in well under a second
  return current
}
