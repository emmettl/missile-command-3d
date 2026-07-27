import { describe, expect, it } from 'vitest'
import { DPR_CEILING, DPR_FLOOR, PIXEL_BUDGET, resolveRenderDpr } from './renderScale'

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
