import { MathUtils, Vector3, type Group, type PerspectiveCamera } from 'three/webgpu'
import type { ModelAsset } from './modelAsset'

export type Motion = 'idle' | 'walk' | 'run' | 'takeoff' | 'airborne' | 'land'
export type PlayEvent =
  | { type: 'enter' | 'pause' | 'resume' | 'exit'; id: string }
  | { type: 'action'; id: string; motion: Motion }

const clips: Record<Motion, string> = {
  idle: 'Idle_Loop', walk: 'Walk_Loop', run: 'Sprint_Loop',
  takeoff: 'Jump_Start', airborne: 'Jump_Loop', land: 'Jump_Land',
}
const controls = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ShiftLeft', 'ShiftRight', 'Space', 'Escape'])
const gravity = 11.5
const launch = 4.1
const up = new Vector3(0, 1, 0)

export function createPlaySession(
  id: string,
  actor: Group,
  asset: Pick<ModelAsset, 'stats' | 'play' | 'stop' | 'pose'>,
  camera: PerspectiveCamera,
  speed: number,
  onEvent: (event: PlayEvent) => void,
) {
  const originalPosition = actor.position.clone()
  const originalRotation = actor.rotation.clone()
  const viewHeading = originalRotation.y + Math.PI
  const height = Math.max(0.7, asset.stats.size[1] * actor.scale.y)
  const target = new Vector3()
  const cameraOffset = new Vector3(0, height * 0.67, height * 2.9).applyAxisAngle(up, viewHeading)
  const pressed = new Set<string>()
  const movement = new Vector3()
  const input = new AbortController()
  const options = { signal: input.signal }
  let state: 'ready' | 'playing' | 'paused' | 'stopped' = 'ready'
  let motion: Motion = 'idle'
  let vertical = 0
  let jumpTime = 0
  let landing = 0
  let sprint = false

  function setMotion(next: Motion) {
    if (next === motion) return
    motion = next
    asset.play(clips[next], next === 'takeoff' || next === 'land', 0.1)
    onEvent({ type: 'action', id, motion })
  }

  function focus() {
    target.copy(actor.position)
    target.y += height * 0.66
    camera.position.copy(target).add(cameraOffset)
    camera.lookAt(target)
  }

  function updateIntent() {
    movement.set(Number(pressed.has('KeyD')) - Number(pressed.has('KeyA')), 0,
      Number(pressed.has('KeyS')) - Number(pressed.has('KeyW'))).normalize().applyAxisAngle(up, viewHeading)
    sprint = pressed.has('ShiftLeft') || pressed.has('ShiftRight')
    if (jumpTime === 0 && landing === 0) setMotion(movement.lengthSq() ? (sprint ? 'run' : 'walk') : 'idle')
  }

  function pause() {
    if (state !== 'playing') return
    state = 'paused'
    pressed.clear()
    movement.set(0, 0, 0)
    onEvent({ type: 'pause', id })
  }

  function exit() {
    if (state === 'stopped') return
    state = 'stopped'
    input.abort()
    actor.position.copy(originalPosition)
    actor.rotation.copy(originalRotation)
    asset.stop()
    asset.play(clips.idle, false, 0)
    asset.pose(0.001)
    onEvent({ type: 'exit', id })
  }

  function keyDown(event: KeyboardEvent) {
    if (!controls.has(event.code) || event.altKey || event.ctrlKey || event.metaKey || event.isComposing) return
    // Buttons must still support Space to pause or exit by keyboard.
    if (event.code === 'Space' && event.target instanceof HTMLButtonElement) return
    event.preventDefault()
    if (event.repeat) return
    if (event.code === 'Escape') {
      exit()
      return
    }
    if (state !== 'playing') return
    pressed.add(event.code)
    if (event.code === 'Space' && jumpTime === 0) {
      vertical = launch
      jumpTime = Number.EPSILON
      landing = 0
      setMotion('takeoff')
    }
    updateIntent()
  }

  return {
    enter() {
      if (state !== 'ready') return
      state = 'playing'
      window.addEventListener('keydown', keyDown, options)
      window.addEventListener('keyup', event => {
        if (pressed.delete(event.code)) updateIntent()
      }, options)
      window.addEventListener('blur', pause, options)
      asset.play(clips.idle)
      focus()
      onEvent({ type: 'enter', id })
    },
    pause,
    resume() {
      if (state !== 'paused') return
      state = 'playing'
      onEvent({ type: 'resume', id })
      updateIntent()
    },
    exit,
    advance(dt: number) {
      if (state !== 'playing') return false
      if (movement.lengthSq()) {
        actor.position.addScaledVector(movement, dt * speed * (sprint ? 1.9 : 1))
        const heading = Math.atan2(movement.x, movement.z)
        const delta = MathUtils.euclideanModulo(heading - actor.rotation.y + Math.PI, Math.PI * 2) - Math.PI
        actor.rotation.set(0, actor.rotation.y + delta * Math.min(1, 18 * dt), 0)
      }
      if (jumpTime > 0) {
        jumpTime += dt
        vertical -= gravity * dt
        actor.position.y += vertical * dt
        if (actor.position.y <= originalPosition.y && vertical < 0) {
          actor.position.y = originalPosition.y
          jumpTime = 0
          landing = 0.23
          setMotion('land')
        } else if (jumpTime >= 0.16 && motion === 'takeoff') {
          setMotion('airborne')
        }
      } else if (landing > 0) {
        landing = Math.max(0, landing - dt)
        if (landing === 0) updateIntent()
      }
      asset.pose(dt)
      focus()
      return true
    },
  }
}
