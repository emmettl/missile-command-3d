import { useEffect, useState } from 'react'
import { isMobile } from './device'
import { resolveRenderDpr } from './renderScale'

// The pixel ratio the canvas renders at, kept in step with the window.
//
// This can't be resolved once at startup the way the rest of `quality` is: the whole
// point of the budget in `renderScale.ts` is that it depends on how big the window
// currently is, and a window that gets maximised (or dragged onto a 4K display) is
// exactly the case that needs the ratio pulled down.

function currentRenderDpr(): number {
  if (typeof window === 'undefined') return 1
  return resolveRenderDpr({
    width: window.innerWidth,
    height: window.innerHeight,
    devicePixelRatio: window.devicePixelRatio,
    mobile: isMobile,
  })
}

export function useRenderDpr(): number {
  const [dpr, setDpr] = useState(currentRenderDpr)

  useEffect(() => {
    if (typeof window === 'undefined') return
    let ratioQuery: MediaQueryList | undefined

    function update() {
      // Quantised, so this settles on the same number for most resize events and
      // React bails out of the re-render — no need to debounce the listener.
      setDpr(currentRenderDpr())
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

  return dpr
}
