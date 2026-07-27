import { describe, expect, it } from 'vitest'
import {
  DPR_CEILING,
  DPR_FLOOR,
  PIXEL_BUDGET,
  START_FACTOR,
  dprForFactor,
  resolveRenderBounds,
  resolveRenderDpr,
} from './renderScale'

// Device pixels a frame actually costs at the resolved ratio.
function framePixels(width: number, height: number, devicePixelRatio: number, mobile = false) {
  const dpr = resolveRenderDpr({ width, height, devicePixelRatio, mobile })
  return { dpr, pixels: width * height * dpr * dpr }
}

// CSS viewport size paired with the ratio the display asks for.
const VIEWPORTS = {
  laptop1080p: [1920, 1080, 1],
  laptopScaled150: [1280, 720, 1.5],
  macbookRetina: [1512, 945, 2],
  external1440p: [2560, 1400, 1],
  // The reported case: a big window on a laptop panel — 4K at 150% Windows scaling.
  maximised4kScaled: [2560, 1440, 1.5],
  maximised4kNative: [3840, 2160, 1],
  smallWindow: [900, 600, 1],
} satisfies Record<string, [number, number, number]>

describe('resolveRenderDpr', () => {
  it.each(Object.entries(VIEWPORTS))('stays inside the pixel budget on %s', (_name, v) => {
    const [width, height, ratio] = v
    const { dpr, pixels } = framePixels(width, height, ratio)
    // The floor wins over the budget on the very largest windows — by design, since
    // upscaling from below it looks worse than the frames it saves are worth.
    if (dpr > DPR_FLOOR) expect(pixels).toBeLessThanOrEqual(PIXEL_BUDGET * 1.05)
    expect(dpr).toBeGreaterThanOrEqual(DPR_FLOOR)
    expect(dpr).toBeLessThanOrEqual(DPR_CEILING.desktop)
  })

  it('leaves a plain 1080p laptop window alone', () => {
    const [width, height, ratio] = VIEWPORTS.laptop1080p
    expect(resolveRenderDpr({ width, height, devicePixelRatio: ratio })).toBe(1)
  })

  it('never renders above what the display asks for', () => {
    for (const [width, height, ratio] of Object.values(VIEWPORTS)) {
      expect(resolveRenderDpr({ width, height, devicePixelRatio: ratio })).toBeLessThanOrEqual(
        Math.max(ratio, DPR_FLOOR),
      )
    }
  })

  it('cuts a maximised window on a dense display well below its native ratio', () => {
    const [width, height, ratio] = VIEWPORTS.maximised4kScaled
    const capped = framePixels(width, height, ratio)
    const uncapped = width * height * ratio * ratio
    expect(capped.dpr).toBeLessThan(ratio)
    // Less than half the pixels of what the browser would otherwise hand the GPU.
    expect(capped.pixels).toBeLessThan(uncapped / 2)
  })

  it('backs the ratio off as the window grows', () => {
    const widths = [800, 1200, 1600, 2000, 2560, 3200, 3840]
    const steps = widths.map((w) => framePixels(w, Math.round(w * 0.56), 2))
    for (let i = 1; i < steps.length; i++) {
      expect(steps[i].dpr).toBeLessThanOrEqual(steps[i - 1].dpr)
    }
    // Across a ~23× spread in window area, the frame grows by well under 3× — and by
    // nothing at all once the budget binds, until the floor takes over on the largest.
    const [smallest] = steps
    const largest = steps[steps.length - 1]
    expect(largest.pixels).toBeLessThan(smallest.pixels * 3)
    // ...against the ~23× it would have grown by at the display's own ratio.
    expect(largest.pixels).toBeLessThan((3840 * Math.round(3840 * 0.56) * 2 * 2) / 5)
  })

  it('holds a phone to the mobile ceiling', () => {
    // A 3× phone screen would otherwise shade nine times the pixels.
    expect(resolveRenderDpr({ width: 390, height: 844, devicePixelRatio: 3, mobile: true })).toBe(
      DPR_CEILING.mobile,
    )
  })

  it('quantises so a one-pixel resize does not reallocate the buffers', () => {
    const a = resolveRenderDpr({ width: 2560, height: 1400, devicePixelRatio: 2 })
    const b = resolveRenderDpr({ width: 2561, height: 1400, devicePixelRatio: 2 })
    expect(a).toBe(b)
    expect(Math.round(a * 100) % 5).toBe(0)
  })

  it('degrades gracefully on a viewport it cannot measure', () => {
    for (const metrics of [
      { width: 0, height: 0, devicePixelRatio: 2 },
      { width: 1920, height: 1080, devicePixelRatio: 0 },
      { width: 1920, height: 1080, devicePixelRatio: Number.NaN },
      { width: Number.NaN, height: Number.NaN, devicePixelRatio: 1 },
    ]) {
      const dpr = resolveRenderDpr(metrics)
      expect(Number.isFinite(dpr)).toBe(true)
      expect(dpr).toBeGreaterThanOrEqual(DPR_FLOOR)
      expect(dpr).toBeLessThanOrEqual(DPR_CEILING.desktop)
    }
  })
})

// The reported machine: a 5K panel at 200% Windows scaling — 2560x1440 CSS at 2x.
const STUDIO_DISPLAY = { width: 2560, height: 1440, devicePixelRatio: 2 }

describe('dprForFactor', () => {
  const bounds = resolveRenderBounds(STUDIO_DISPLAY)

  it('starts at the budget cap, before anything has been measured', () => {
    expect(dprForFactor(bounds, START_FACTOR)).toBe(bounds.cap)
    expect(bounds.cap).toBeLessThan(bounds.top) // this window has room to climb
  })

  it('climbs to the display’s own ratio when the GPU proves it can keep up', () => {
    expect(dprForFactor(bounds, 1)).toBe(bounds.top)
    expect(bounds.top).toBe(2)
  })

  it('gives ground to the floor when the GPU cannot', () => {
    expect(dprForFactor(bounds, 0)).toBe(DPR_FLOOR)
  })

  it('moves monotonically, and never outside the bounds', () => {
    let previous = 0
    for (let factor = 0; factor <= 1.0001; factor += 0.05) {
      const dpr = dprForFactor(bounds, factor)
      expect(dpr).toBeGreaterThanOrEqual(previous)
      expect(dpr).toBeGreaterThanOrEqual(DPR_FLOOR)
      expect(dpr).toBeLessThanOrEqual(bounds.top)
      previous = dpr
    }
  })

  it('never renders past the display on a window the budget never bound', () => {
    // A small window is already at its native ratio, so there is nothing to climb to.
    const small = resolveRenderBounds({ width: 900, height: 600, devicePixelRatio: 1 })
    expect(small.cap).toBe(small.top)
    expect(dprForFactor(small, 1)).toBe(1)
    expect(dprForFactor(small, 0)).toBe(DPR_FLOOR)
  })

  it('holds a phone to the mobile ceiling however well it performs', () => {
    const phone = resolveRenderBounds({
      width: 390,
      height: 844,
      devicePixelRatio: 3,
      mobile: true,
    })
    expect(dprForFactor(phone, 1)).toBe(DPR_CEILING.mobile)
  })

  it('falls back to the opening guess on a factor it cannot read', () => {
    expect(dprForFactor(bounds, Number.NaN)).toBe(bounds.cap)
    expect(dprForFactor(bounds, -5)).toBe(DPR_FLOOR)
    expect(dprForFactor(bounds, 99)).toBe(bounds.top)
  })
})
