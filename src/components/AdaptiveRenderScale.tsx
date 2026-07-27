import { PerformanceMonitor } from '@react-three/drei'
import { START_FACTOR } from '../game/renderScale'

// Measures the frame rate the machine is actually achieving and reports it as a factor
// in 0..1, which `renderScale.dprForFactor` turns into a pixel ratio. The pixel budget
// alone can only guess at the GPU; this is what tells it whether the guess was right.

// Absolute frame-rate targets rather than drei's default, which derives its bounds from
// the fastest rate seen so far. That default reads "as fast as this machine has ever
// managed" as success — so a machine pinned at 30fps would be judged to be doing well
// and would climb, when what it needs is to give ground.
const SLOW_FPS = 45 // sustained below this: drop the ratio a step
const SMOOTH_FPS = 57 // sustained at vsync with room to spare: earn a step back

const BOUNDS = (): [number, number] => [SLOW_FPS, SMOOTH_FPS]

// Each step re-allocates the render targets, so the ladder is not allowed to walk
// forever: after this many changes of direction drei latches the current ratio and
// stops sampling. Enough to cross the range twice, not enough to be seen hunting.
const FLIPFLOPS = 8

export function AdaptiveRenderScale({ onFactor }: { onFactor: (factor: number) => void }) {
  return (
    <PerformanceMonitor
      factor={START_FACTOR}
      bounds={BOUNDS}
      flipflops={FLIPFLOPS}
      onChange={({ factor }) => onFactor(factor)}
    />
  )
}
