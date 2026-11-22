import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { zoneName } from './world/map'
import { type WorldSession } from './world/session'
import type { createWorldView } from './world/view'
import './game.css'

interface Props {
  session: WorldSession
  force: boolean
  volume: boolean
  onHome: () => void
  onLab: () => void
  onRestart: () => void
}

const goals = {
  collect: '取走应急电池',
  carry: '把电池送到 Apple Park',
  powered: '撤离门已解锁',
  finished: '火种已送达',
}

const actions = { battery: '拿起电池', power: '合闸', terminal: '打开撤离终端' }
const gameKeys = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ShiftLeft', 'ShiftRight',
  'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'KeyE'])

function hudState(session: WorldSession) {
  return {
    zone: zoneName(session.player.z), opening: session.opening, stage: session.stage,
    hp: session.player.hp, action: session.interaction,
    notice: session.noticeTime > 0 ? session.notice : '',
    hurt: session.hurt > 0, hit: session.hit > 0, storageFailed: session.storageFailed,
  }
}

export function Game({ session, force, volume, onHome, onLab, onRestart }: Props) {
  const viewport = useRef<HTMLDivElement>(null)
  const keys = useRef(new Set<string>())
  const firing = useRef(false)
  const terminalOpen = useRef(false)
  const touch = useRef<{ id: number; x: number; y: number } | null>(null)
  const [hud, setHud] = useState(() => hudState(session))
  const [backend, setBackend] = useState('')
  const [error, setError] = useState('')
  const [attempt, retry] = useState(0)
  const [terminal, setTerminal] = useState(false)
  const [locked, setLocked] = useState(false)
  const [loading, setLoading] = useState(true)

  function syncHud() { setHud(hudState(session)) }

  function releaseLook() {
    if (document.pointerLockElement === viewport.current) document.exitPointerLock?.()
    keys.current.clear()
    firing.current = false
  }

  function interact() {
    if (terminalOpen.current || loading) return
    if (session.opening) {
      session.endOpening()
      syncHud()
      return
    }
    const action = session.interact()
    if (action === 'power' || action === 'terminal') {
      terminalOpen.current = true
      releaseLook()
      setTerminal(true)
    }
    syncHud()
  }
  const currentInteraction = useRef(interact)
  currentInteraction.current = interact

  useEffect(() => {
    const host = viewport.current
    if (!host) return
    let disposed = false
    let failed = false
    let view: ReturnType<typeof createWorldView> | null = null
    let frame = 0
    let lastFrame = 0
    let elapsed = 0
    let state = ''
    let firstFrame = true
    setError('')
    setBackend('')
    setLoading(true)

    function fail(message: string) {
      if (disposed || failed) return
      failed = true
      setError(message)
    }

    function paint(now: number) {
      if (disposed || failed || !view) return
      const dt = Math.min(.1, (now - (lastFrame || now)) / 1000)
      lastFrame = now
      const ready = view.allows(session.player.z)
      if (!terminalOpen.current && ready && !document.hidden) {
        const active = keys.current
        session.look((Number(active.has('ArrowLeft')) - Number(active.has('ArrowRight'))) * dt * 1.9,
          (Number(active.has('ArrowUp')) - Number(active.has('ArrowDown'))) * dt * 1.6)
        elapsed += dt
        while (elapsed >= 1 / 60) {
          session.step(1 / 60, {
            forward: Number(active.has('KeyW')) - Number(active.has('KeyS')),
            side: Number(active.has('KeyD')) - Number(active.has('KeyA')),
            sprint: active.has('ShiftLeft') || active.has('ShiftRight'),
            fire: firing.current,
          }, view.allows)
          elapsed -= 1 / 60
        }
      }
      try {
        view.draw(session, volume)
      } catch (cause) {
        fail(cause instanceof Error ? cause.message : String(cause))
        return
      }
      if (firstFrame && ready) {
        firstFrame = false
        setLoading(false)
      }
      const next = hudState(session)
      const signature = JSON.stringify(next)
      if (signature !== state) {
        state = signature
        setHud(next)
      }
      frame = requestAnimationFrame(paint)
    }

    void import('./world/view').then(async ({ createWorldView }) => {
      if (disposed) return
      view = createWorldView(host, force, fail)
      const name = await view.ready
      if (disposed || !name) return
      setBackend(name)
      frame = requestAnimationFrame(paint)
    }).catch(cause => fail(cause instanceof Error ? cause.message : String(cause)))

    function onKeyDown(event: KeyboardEvent) {
      if (event.altKey || event.ctrlKey || event.metaKey || !gameKeys.has(event.code)) return
      if (terminalOpen.current) return
      event.preventDefault()
      if (event.code === 'KeyE') {
        if (!event.repeat) currentInteraction.current()
      } else {
        keys.current.add(event.code)
      }
    }

    function onKeyUp(event: KeyboardEvent) { keys.current.delete(event.code) }
    function clearInput() { keys.current.clear(); firing.current = false }
    function onLock() {
      const active = document.pointerLockElement === host
      setLocked(active)
      if (!active) clearInput()
    }
    function onMouse(event: MouseEvent) {
      if (document.pointerLockElement === host && !terminalOpen.current) {
        session.look(-event.movementX * .00225, -event.movementY * .00225)
      }
    }
    function save() {
      // The terminal already committed the finished run. Its teardown can
      // happen after the next round has claimed the same storage slot.
      if (!session.opening && session.stage !== 'finished') session.save()
    }
    function onVisibility() {
      if (document.hidden) {
        clearInput()
        save()
      }
    }

    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('mouseup', clearFire)
    window.addEventListener('blur', clearInput)
    window.addEventListener('pagehide', save)
    document.addEventListener('visibilitychange', onVisibility)
    document.addEventListener('pointerlockchange', onLock)
    document.addEventListener('mousemove', onMouse)
    return () => {
      disposed = true
      cancelAnimationFrame(frame)
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('mouseup', clearFire)
      window.removeEventListener('blur', clearInput)
      window.removeEventListener('pagehide', save)
      document.removeEventListener('visibilitychange', onVisibility)
      document.removeEventListener('pointerlockchange', onLock)
      document.removeEventListener('mousemove', onMouse)
      if (document.pointerLockElement === host) document.exitPointerLock?.()
      clearInput()
      save()
      view?.dispose()
    }
  }, [session, force, volume, attempt])

  function clearFire() { firing.current = false }

  function pointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (loading || terminal || hud.opening || hud.stage === 'finished' || event.button !== 0) return
    if (event.pointerType === 'touch') {
      event.currentTarget.setPointerCapture(event.pointerId)
      touch.current = { id: event.pointerId, x: event.clientX, y: event.clientY }
    } else if (document.pointerLockElement === event.currentTarget) {
      firing.current = true
    } else {
      const result = event.currentTarget.requestPointerLock?.()
      void result?.catch(() => {})
    }
  }

  function pointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const last = touch.current
    if (!last || last.id !== event.pointerId) return
    session.look((last.x - event.clientX) * .006, (last.y - event.clientY) * .006)
    Object.assign(last, { x: event.clientX, y: event.clientY })
  }

  function closeTerminal(finish: boolean) {
    if (finish) session.finish()
    terminalOpen.current = false
    setTerminal(false)
    syncHud()
  }

  function control(label: string, code: string) {
    const held = (down: boolean) => {
      if (code === 'fire') firing.current = down
      else if (down) keys.current.add(code)
      else keys.current.delete(code)
    }
    return <button type="button" aria-label={label}
      onPointerDown={event => { event.currentTarget.setPointerCapture(event.pointerId); held(true) }}
      onPointerUp={() => held(false)} onLostPointerCapture={() => held(false)}>{label}</button>
  }

  return <main className="world-game">
    <div className="world-view" ref={viewport} aria-label="游戏画面" onPointerDown={pointerDown}
      onPointerMove={pointerMove} onLostPointerCapture={() => { touch.current = null }} />
    <header className="world-top">
      <button type="button" aria-label="返回首页" onClick={onHome} className="world-logo">RETRO HOTLINE</button>
      <div className="world-tools"><span>{backend}</span>
        <button type="button" aria-keyshortcuts="P" onClick={onLab}>Dev Lab <kbd>P</kbd></button>
      </div>
    </header>

    {!loading && !hud.opening && hud.stage !== 'finished' && <>
      <div className="world-goal"><small>{hud.zone}</small><p>{goals[hud.stage]}</p></div>
      <div className={`world-crosshair${hud.hit ? ' world-crosshair--hit' : ''}`} aria-hidden="true" />
      <div className="world-vitals"><span>生命</span><meter min="0" max="100" value={hud.hp} aria-label="生命" /><strong>{hud.hp}</strong></div>
      {hud.action && !terminal && <button className="world-action" type="button" aria-keyshortcuts="E" onClick={interact}>
        <kbd>E</kbd>{actions[hud.action]}
      </button>}
      {hud.notice && <p className="world-radio" role="status">{hud.notice}</p>}
      {hud.hurt && <div className="world-damage" aria-hidden="true" />}
      {!locked && <p className="world-keys">WASD 移动 · Shift 奔跑 · 点击画面瞄准 · 左键射击</p>}
      <div className="world-touch" aria-label="触屏操作">
        {control('前进', 'KeyW')}{control('后退', 'KeyS')}{control('向左', 'KeyA')}{control('向右', 'KeyD')}{control('射击', 'fire')}
      </div>
    </>}

    {loading && !error && <div className="world-curtain"><p role="status">正在进入世界</p></div>}
    {!loading && hud.opening && <div className="world-opening">
      <p>种子库离线。</p><small>Apple Park</small>
      <button type="button" aria-keyshortcuts="E" onClick={interact}>跳过 <kbd>E</kbd></button>
    </div>}
    {hud.storageFailed && <p className="world-save-warning" role="status">本地存档写入失败</p>}
    {terminal && <section className="world-curtain world-curtain--modal" role="dialog" aria-modal="true" aria-label="撤离终端">
      <div className="world-panel">
        <small>APPLE PARK · 种子库</small>
        <h1>供电已恢复</h1>
        <p>撤离门已解锁。</p>
        <div><button type="button" autoFocus onClick={() => closeTerminal(false)}>继续探索</button>
          <button type="button" onClick={() => closeTerminal(true)}>结束本轮</button></div>
      </div>
    </section>}
    {hud.stage === 'finished' && !error && !loading && <section className="world-curtain world-curtain--modal" aria-label="本轮结算">
      <div className="world-panel">
        <small>本轮结束</small>
        <h1>火种</h1>
        <p>种子库已恢复供电。</p>
        <div><button type="button" onClick={onRestart}>开始新一轮</button><button type="button" onClick={onHome}>返回首页</button></div>
      </div>
    </section>}
    {error && <div className="world-curtain world-curtain--modal" role="alert"><div className="world-panel">
      <h1>世界加载失败</h1><p>{error}</p>
      <div><button type="button" onClick={() => retry(n => n + 1)}>重试</button><button type="button" onClick={onLab}>Dev Lab</button></div>
    </div></div>}
  </main>
}
