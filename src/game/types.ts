import { Vector3 } from 'three'

export type GameStatus = 'menu' | 'playing' | 'wave-clear' | 'gameover'

export interface CityState {
  id: string
  x: number
  alive: boolean
}

export interface BatteryState {
  id: string
  x: number
  ammo: number
  destroyed: boolean
}

// Fast-moving simulation entities. Their `pos` vectors are mutated in place by the
// game loop every frame; React only re-renders the entity lists when entities are
// added or removed (the array reference changes).

export interface IncomingMissile {
  id: number
  pos: Vector3
  start: Vector3
  target: Vector3
  targetId: string // city or battery id it is aimed at
  speed: number
  alive: boolean
}

export interface PlayerMissile {
  id: number
  pos: Vector3
  start: Vector3
  target: Vector3
  alive: boolean
}

export interface Explosion {
  id: number
  pos: Vector3
  age: number // seconds since detonation
  radius: number // current radius, updated each frame
  dead: boolean
}
