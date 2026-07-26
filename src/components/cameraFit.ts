import { FIELD } from '../game/constants'

// The battlefield is a wide, short world (~52 x 28 units). A fixed camera distance
// only frames it correctly at one aspect ratio: on a narrow screen the horizontal
// field of view shrinks and the outer cities fall off the sides. So the camera
// distance is derived from the viewport instead — always far enough back that the
// whole playfield fits, whatever the shape of the screen.

export const CAMERA_FOV = 50 // vertical, degrees

// What must stay on screen, with a little breathing room.
// Missiles spawn clamped to ±FIELD.maxX, so that plus a small margin is all that
// must be framed — keeping it tight matters on narrow screens, where this figure
// drives how far the camera has to retreat.
const HALF_WIDTH = Math.max(Math.abs(FIELD.minX), Math.abs(FIELD.maxX)) + 1.5
const VERTICAL_SPAN = 36 // from below the grid horizon up past the missile spawn line
const VERTICAL_CENTER = 10

export interface CameraFit {
  distance: number
  cameraY: number
  lookY: number
  fogNear: number
  fogFar: number
}

export function computeCameraFit(aspect: number): CameraFit {
  const halfFov = (CAMERA_FOV * Math.PI) / 180 / 2
  const t = Math.tan(halfFov)

  // Distance needed to fit the vertical span, and to fit the width at this aspect.
  const forHeight = VERTICAL_SPAN / 2 / t
  const forWidth = aspect > 0 ? HALF_WIDTH / (t * aspect) : forHeight
  const distance = Math.max(forHeight, forWidth)

  return {
    distance,
    // Keep the same gentle downward tilt at every distance.
    cameraY: VERTICAL_CENTER + distance * 0.09,
    lookY: VERTICAL_CENTER * 0.85,
    // Fog has to track the camera, or pulling back would bury the scene in it.
    fogNear: distance * 0.75,
    fogFar: distance * 3.2,
  }
}
