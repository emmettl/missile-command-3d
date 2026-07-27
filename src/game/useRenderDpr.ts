import { useEffect, useState } from 'react'
import { isMobile } from './device'
import { dprForFactor, resolveRenderBounds, type RenderScaleBounds } from './renderScale'

// The pixel ratio the canvas renders at, kept in step with the window.
//
// This can't be resolved once at startup the way the rest of `quality` is: the whole
// point of the budget in `renderScale.ts` is that it depends on how big the window
// currently is, and a window that gets maximised (or dragged onto a 4K display) is
// exactly the case that needs the ratio pulled down.

function readBounds(): RenderScaleBounds {
  if (typeof window === 'undefined') return { cap: 1, top: 1 }
  return resolveRenderBounds({
    width: window.innerWidth,
    height: window.innerHeight,
    devicePixelRatio: window.devicePixelRatio,
    mobile: isMobile,
  })
}

/**
 * @param factor Measured performance in 0..1 from `AdaptiveRenderScale`. The midpoint
 * is the budget's own guess, which is where rendering starts.
 */
export function useRenderDpr(factor: number): number {
  const [bounds, setBounds] = useState(readBounds)

  useEffect(() => {
    if (typeof window === 'undefined') return
    let ratioQuery: MediaQueryList | undefined

    function update() {
      // Bounds are quantised, so most resize events resolve to the numbers already in
      // state; returning the previous object bails out of the re-render and keeps the
      // renderer from reallocating buffers on every pixel of a window drag.
      setBounds((prev) => {
        const next = readBounds()
        return prev.cap === next.cap && prev.top === next.top ? prev : next
      })
    }

    // Page zoom, and dragging the window onto a display of a different density, change
    // devicePixelRatio without reliably firing a resize. A media query pinned to the
    // ratio in force stops matching the moment it moves, so re-arm one each time.
    function watchRatio() {
      if (typeof window.matchMedia !== 'function') return
      ratioQuery?.removeEventListener('change', onRatioChange)
      ratioQuery = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`)
      ratioQuery.addEventListener('change', onRatioChange)
    }

    function onRatioChange() {
      update()
      watchRatio()
    }

    window.addEventListener('resize', update)
    watchRatio()
    update() // the window may have changed between first render and this effect

    return () => {
      window.removeEventListener('resize', update)
      ratioQuery?.removeEventListener('change', onRatioChange)
    }
  }, [])

  return dprForFactor(bounds, factor)
}
