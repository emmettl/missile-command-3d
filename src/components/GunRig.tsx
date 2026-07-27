import { useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Euler, Fog, PerspectiveCamera, Vector3 } from 'three'
import { CAMERA_FOV } from './cameraFit'
import { aimDirection, eyePosition, look } from '../game/gun'
import { getGame, useGameStore } from '../game/useGameStore'
import { stepShake } from '../game/shake'
import { isTouch } from '../game/device'

// The camera for BOMBERS INCOMING. Every other mode solves a distance that frames a
// volume; this one is a pose — stood in the pit at an emplacement, looking wherever the
// player points — so it is its own rig rather than another row in the framing table.
//
// Desktop takes the pointer lock, which is what makes tracking a crossing target feel
// like a gun rather than a mouse. Touch falls back to dragging, which is worse but
// workable, and the fire button lives in the HUD.

const FOG_NEAR = 90
const FOG_FAR = 340

export function GunRig() {
  const camera = useThree((s) => s.camera)
  const gl = useThree((s) => s.gl)
  const setFiring = useGameStore((s) => s.setFiring)
  const eye = useRef(new Vector3())
  const forward = useRef(new Vector3())
  const target = useRef(new Vector3())
  const shakeEuler = useRef(new Euler())

  useEffect(() => {
    const cam = camera as PerspectiveCamera
    if (cam.isPerspectiveCamera && cam.fov !== CAMERA_FOV) {
      cam.fov = CAMERA_FOV
      cam.updateProjectionMatrix()
    }
  }, [camera])

  useEffect(() => {
    const el = gl.domElement
    let dragging = false
    let last = { x: 0, y: 0 }

    const locked = () => document.pointerLockElement === el

    const down = (e: PointerEvent) => {
      if (getGame().waveMode !== 'bombers') return
      // First press takes the lock; from then on it is the trigger.
      if (!locked() && !isTouch) {
        void el.requestPointerLock?.()
        return
      }
      dragging = true
      last = { x: e.clientX, y: e.clientY }
      setFiring(true)
    }
    const move = (e: PointerEvent) => {
      if (getGame().waveMode !== 'bombers') return
      const gun = getGame().gun
      if (locked()) {
        look(gun, e.movementX, e.movementY)
        return
      }
      if (!dragging) return
      look(gun, e.clientX - last.x, e.clientY - last.y)
      last = { x: e.clientX, y: e.clientY }
    }
    const up = () => {
      dragging = false
      setFiring(false)
    }
    // Losing the lock (escape, tab away) must not leave the trigger stuck down.
    const lockChange = () => {
      if (!locked()) setFiring(false)
    }

    el.addEventListener('pointerdown', down)
    el.addEventListener('pointermove', move)
    el.addEventListener('pointerup', up)
    el.addEventListener('pointercancel', up)
    window.addEventListener('blur', up)
    document.addEventListener('pointerlockchange', lockChange)

    return () => {
      el.removeEventListener('pointerdown', down)
      el.removeEventListener('pointermove', move)
      el.removeEventListener('pointerup', up)
      el.removeEventListener('pointercancel', up)
      window.removeEventListener('blur', up)
      document.removeEventListener('pointerlockchange', lockChange)
      setFiring(false)
      if (document.pointerLockElement === el) document.exitPointerLock?.()
    }
  }, [gl, setFiring])

  useFrame((state, dt) => {
    const gun = getGame().gun
    const energy = stepShake(dt)

    eyePosition(gun.position, eye.current)
    aimDirection(gun, forward.current)
    camera.position.copy(eye.current)

    // Shake rattles the view rather than sliding the gun off its mount.
    if (energy > 0) {
      shakeEuler.current.set(
        (Math.random() - 0.5) * energy * 0.05,
        (Math.random() - 0.5) * energy * 0.05,
        0,
      )
      forward.current.applyEuler(shakeEuler.current)
    }

    target.current.copy(eye.current).add(forward.current)
    camera.lookAt(target.current)

    const fog = state.scene.fog as Fog | null
    if (fog) {
      fog.near = FOG_NEAR
      fog.far = FOG_FAR
    }
  })

  return null
}
