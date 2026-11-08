import { useCallback, useEffect, useRef, useState } from 'react'
import type { PlayerProfile } from '../game/combat/storage'
import { SYNTH_TRACKS } from '../game/music'
import type { HudState } from '../game/types'
import './ConsoleMenu.css'

type ConsoleAction = 'confirm' | 'back' | 'controls' | 'audio' | 'track'

function useConsoleController(onAction: (action: ConsoleAction) => void) {
  const callback = useRef(onAction)
  useEffect(() => { callback.current = onAction }, [onAction])
  const [state, setState] = useState({ connected: false, dualSense: false, pollMs: 0 })
  useEffect(() => {
    let frame = 0
    let last = 0
    let published = 0
    let pollMs = 0
    let previous: boolean[] = []
    let controller = -1
    const actions: Partial<Record<number, ConsoleAction>> = { 0: 'confirm', 1: 'back', 2: 'controls', 3: 'audio', 5: 'track' }
    const poll = (now: number) => {
      let pad: Gamepad | undefined
      try { pad = Array.from(navigator.getGamepads?.() ?? []).find((p): p is Gamepad => !!p?.connected && p.mapping === 'standard') }
      catch { /* Gamepad access can be restricted by an embedding page. */ }
      if (last && now - last < 100) pollMs = pollMs ? pollMs * 0.9 + (now - last) * 0.1 : now - last
      last = now
      if (controller !== (pad?.index ?? -1)) { previous = []; controller = pad?.index ?? -1 }
      const pressed = pad?.buttons.map((b) => b.pressed) ?? []
      if (document.hasFocus()) {
        for (const [index, action] of Object.entries(actions)) {
          if (pressed[Number(index)] && !previous[Number(index)]) callback.current(action!)
        }
      }
      previous = pressed
      if (now - published > 500) {
        published = now
        const next = { connected: !!pad, dualSense: !!pad && /dualsense|054c|wireless controller/i.test(pad.id), pollMs: pad ? Math.round(pollMs * 10) / 10 : 0 }
        setState((old) => old.connected === next.connected && old.dualSense === next.dualSense && old.pollMs === next.pollMs ? old : next)
      }
      frame = requestAnimationFrame(poll)
    }
    frame = requestAnimationFrame(poll)
    return () => cancelAnimationFrame(frame)
  }, [])
  return state
}

function ControllerStatus({ state }: { state: ReturnType<typeof useConsoleController> }) {
  return (
    <div className="console-controller" aria-label={state.connected ? 'Controller connected; console navigation available' : 'DualSense disconnected; keyboard and mouse ready'}>
      <svg viewBox="0 0 40 26" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true">
        <path d="M12 5h16c3 0 5 2 6 6l3 10c.5 2-2 3-3.5 1.5L28 17H12l-5.5 5.5C5 24 2.5 23 3 21l3-10c1-4 3-6 6-6Z" />
        <path d="M15 5l1 6h8l1-6M9 10v6m-3-3h6" />
        <circle cx="15" cy="16" r="2" /><circle cx="25" cy="16" r="2" />
        <path d="M30 9v2m0 4v2m-4-4h2m4 0h2" />
      </svg>
      <span><i className={state.connected ? 'status-dot is-online' : 'status-dot'} />{state.connected ? `${state.dualSense ? 'DUALSENSE™' : 'GAMEPAD'} CONNECTED` : 'DUALSENSE™ OFFLINE'}</span>
      <span className="controller-poll" title="Measured browser polling interval. Hardware latency is not exposed by the Gamepad API.">{state.connected ? `POLL ${state.pollMs.toFixed(1)} ms` : 'KB + MOUSE READY'}</span>
      <span className="controller-battery" title="Controller battery and hardware latency are unavailable in the browser" aria-label="Controller battery unavailable">
        <svg viewBox="0 0 28 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><rect x="1" y="2" width="22" height="12" rx="2" /><path d="M26 6v4M8 8h8" /></svg>
        <span>—</span>
      </span>
    </div>
  )
}

export function TrackBadge({ name = 'BAY BRIDGE RUNNER', bpm = 116 }: { name?: string; bpm?: number }) {
  return (
    <span className="console-track" role="status" aria-live="polite" aria-atomic="true">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M3 10v4m4-7v10m5-14v18m5-14v10m4-7v4" /></svg>
      <span>{name}</span><span className="track-bpm">{bpm} BPM</span>
    </span>
  )
}

const CONTROL_GROUPS = [
  { title: 'MOVEMENT', rows: [['Move', 'W A S D'], ['Jump', 'SPACE'], ['Hold to sprint', 'SHIFT'], ['Slide · ground only', 'C / CTRL']] },
  { title: 'COMBAT', rows: [['Full-auto rifle · hold', 'LMB'], ['Punch / close execution', 'RMB / F'], ['Glory shatter · staggered target', 'E'], ['Reload / swap weapon', 'R / Q']] },
  { title: 'CYBER-ABILITIES', note: 'KEYBOARD ONLY', rows: [['Phase dash · tap', 'SHIFT'], ['Pulse parry · reflect shots', 'V'], ['Kinetic slam · in air', 'G']] },
  { title: 'AUDIO & SYSTEM', rows: [['Cycle synth track', 'N'], ['Toggle audio', 'M'], ['Pause / release cursor', 'ESC'], ['Hub controls / standby', 'C / O']] },
]

function ControlsGrid() {
  return (
    <>
      <div className="console-controls-grid">
        {CONTROL_GROUPS.map((group) => (
          <section key={group.title}>
            <h3>{group.title}{group.note && <span>{group.note}</span>}</h3>
            <dl>{group.rows.map(([label, key]) => <div key={label}><dt>{label}</dt><dd><kbd>{key}</kbd></dd></div>)}</dl>
          </section>
        ))}
      </div>
      <div className="console-control-note"><kbd>V</kbd> PARRY <span>/</span> <kbd>G</kbd> SLAM <span>/</span> <kbd>C</kbd> SLIDE <p>V and G are keyboard only. Mouse buttons shoot and punch.</p></div>
      <p className="console-tactic">Break a target into stagger, then press E to shatter it for health and overdrive. Take the campus launch pad to the Quantum Vault.</p>
    </>
  )
}

function CampusPreview() {
  return (
    <figure className="console-campus" aria-label="Wireframe preview of the Silicon Valley Quantum Campus">
      <div className="campus-heading"><span>EXPLORE THE NEXT SECTOR</span><span>04 / SV</span></div>
      <svg viewBox="0 0 600 440" fill="none" aria-hidden="true">
        <defs><linearGradient id="campus-floor" x1="300" y1="160" x2="300" y2="440" gradientUnits="userSpaceOnUse"><stop stopColor="#76dded" stopOpacity=".28" /><stop offset="1" stopColor="#76dded" stopOpacity="0" /></linearGradient></defs>
        <g stroke="url(#campus-floor)" strokeWidth=".8">
          {Array.from({ length: 12 }, (_, i) => <path key={i} d={`M${i * 40 - 140} 270l360 180m${i * 40 + 20} 0l360-180`} />)}
        </g>
        <path d="M115 340l200-100 180 90-200 100Z" fill="#091823" stroke="#5d9eaf" strokeOpacity=".5" />
        <g stroke="#69bed0" strokeWidth="1.2" fill="#09131e">
          <path d="M192 288V136l47-24 47 24v152l-47 24Z" /><path d="M192 136l47 24 47-24m-47 24v152" />
          <path d="M350 269V74l43-22 43 22v195l-43 22Z" /><path d="M350 74l43 22 43-22m-43 22v195" />
          <path d="M443 308V178l36-18 36 18v130l-36 18Z" /><path d="M443 178l36 18 36-18m-36 18v130" />
          <path d="M103 306V216l29-15 29 15v90l-29 15Z" /><path d="M103 216l29 15 29-15m-29 15v90" />
        </g>
        <g stroke="#78dfe9" strokeOpacity=".5">
          {[0, 1, 2, 3, 4, 5].map((i) => <path key={i} d={`M350 ${94 + i * 26}l43 22 43-22M192 ${156 + i * 22}l47 24 47-24`} />)}
        </g>
        <path d="M220 315v-24l90-45 112 56v24l-90 45Z" fill="#0c2330" stroke="#a5f4fa" strokeWidth="1.5" />
        <path d="M220 291l112 56 90-45m-90 45v24M243 327v45m154-49v35" stroke="#a5f4fa" strokeOpacity=".65" />
        <path d="M320 204l25 35-25 35-25-35Z" fill="#8fffd9" fillOpacity=".1" stroke="#a0ffdd" strokeWidth="1.5" />
        <path d="M295 239h50m-25-35v70" stroke="#a0ffdd" strokeOpacity=".6" />
        <circle cx="320" cy="239" r="49" stroke="#a0ffdd" strokeOpacity=".22" />
        <path d="M35 380l96-48 79 39 70-35" stroke="#8be5ee" strokeDasharray="4 7" />
        <circle cx="131" cy="332" r="4" fill="#8be5ee" /><circle cx="280" cy="336" r="4" fill="#d5fffd" />
      </svg>
      <figcaption><span>SAND HILL<br /><strong>QUANTUM VAULT</strong></span><span>ALTITUDE<strong>9.5 M</strong></span></figcaption>
    </figure>
  )
}

interface ConsoleMenuProps {
  hud: HudState
  profile: PlayerProfile
  onStart: () => void
  onAudio: () => void
  onTrack: () => void
  onWake: () => void
}

export function ConsoleMenu({ hud, profile, onStart, onAudio, onTrack, onWake }: ConsoleMenuProps) {
  const [standby, setStandby] = useState(true)
  const [section, setSection] = useState<'games' | 'media'>('games')
  const [controls, setControls] = useState(false)
  const [clock, setClock] = useState(new Date())
  const [online, setOnline] = useState(navigator.onLine)
  const initializeRef = useRef<HTMLButtonElement>(null)
  const launchRef = useRef<HTMLButtonElement>(null)
  const dialogRef = useRef<HTMLDialogElement>(null)
  const wake = useCallback(() => { onWake(); setStandby(false) }, [onWake])
  const back = useCallback(() => {
    if (controls) setControls(false)
    else if (section === 'media') setSection('games')
    else setStandby(true)
  }, [controls, section])
  const onController = useCallback((action: ConsoleAction) => {
    if (standby) { if (action === 'confirm') wake(); return }
    if (action === 'back') { back(); return }
    if (controls) return
    if (action === 'confirm') onStart()
    if (action === 'controls') setControls(true)
    if (action === 'audio') onAudio()
    if (action === 'track') onTrack()
  }, [standby, controls, wake, back, onStart, onAudio, onTrack])
  const controller = useConsoleController(onController)

  useEffect(() => {
    const timer = setInterval(() => setClock(new Date()), 1000)
    const connection = () => setOnline(navigator.onLine)
    window.addEventListener('online', connection)
    window.addEventListener('offline', connection)
    return () => { clearInterval(timer); window.removeEventListener('online', connection); window.removeEventListener('offline', connection) }
  }, [])

  useEffect(() => { (standby ? initializeRef : launchRef).current?.focus({ preventScroll: true }) }, [standby, section])
  useEffect(() => {
    if (controls) dialogRef.current?.showModal()
    else dialogRef.current?.close()
  }, [controls])

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.altKey || e.ctrlKey || e.metaKey || e.isComposing) return
      if (!['Enter', 'Space', 'KeyX', 'KeyC', 'KeyM', 'KeyN', 'Escape', 'KeyO'].includes(e.code)) return
      e.stopImmediatePropagation()
      if (e.repeat) { e.preventDefault(); return }
      if (standby) {
        if (['Enter', 'Space', 'KeyX'].includes(e.code)) { e.preventDefault(); wake() }
        else if (e.code === 'KeyN') onTrack()
        else if (e.code === 'KeyM') onAudio()
        return
      }
      if (['Enter', 'Space'].includes(e.code) && e.target instanceof Element && e.target.closest('button')) return
      e.preventDefault()
      if (e.code === 'Escape' || e.code === 'KeyO') back()
      else if (e.code === 'KeyC') setControls((value) => !value)
      else if (e.code === 'KeyM') onAudio()
      else if (e.code === 'KeyN') onTrack()
      else if (!controls && ['KeyX', 'Enter'].includes(e.code)) onStart()
    }
    window.addEventListener('keydown', handleKey, true)
    return () => window.removeEventListener('keydown', handleKey, true)
  }, [standby, controls, wake, back, onStart, onAudio, onTrack])

  return (
    <div className="ps5-standby-screen console-shell" data-ps5-phase={standby ? 'standby' : 'dashboard'}>
      <div className="console-atmosphere" aria-hidden="true">
      <div className="ps5-ambient-ribbon" aria-hidden="true" />
      <svg className="console-ribbons" viewBox="0 0 1440 900" preserveAspectRatio="xMidYMid slice" fill="none" aria-hidden="true">
        <path d="M-200 740C300 100 650 1230 1650 170" stroke="#3db4d9" strokeWidth="38" opacity=".06" />
        <path d="M-200 740C300 100 650 1230 1650 170" stroke="#9ae8f4" strokeWidth="1" opacity=".35" />
        <path d="M-200 752C310 130 670 1230 1650 200" stroke="#9ae8f4" strokeWidth=".6" opacity=".15" />
      </svg>
      </div>
      {standby ? (
        <main className="console-standby" aria-label="Console standby">
          <div className="standby-status"><ControllerStatus state={controller} /></div>
          <div className="standby-center">
            <p className="console-eyebrow">BAY AREA · 1989 / 2089</p>
            <h1 className="standby-title font-orbitron">RETRO<br className="standby-break" /> HOTLINE</h1>
            <p className="standby-protocol">// SILICON VALLEY PROTOCOL</p>
            <div className="standby-glyphs" aria-hidden="true"><span>✕</span><span>○</span><span>△</span><span>◻︎</span></div>
            <button ref={initializeRef} type="button" className="console-primary standby-initialize" aria-keyshortcuts="Enter Space X" onClick={wake}>PRESS [✕ / ENTER] TO INITIALIZE</button>
          </div>
          <footer className="standby-footer"><span>PROCEDURAL WEBAUDIO</span><TrackBadge name={hud.musicTrackName} bpm={hud.musicTrackBpm} /><span>PRESS N TO CHANGE TRACK</span></footer>
        </main>
      ) : (
        <div className="console-dashboard">
          <header className="console-header">
            <nav aria-label="Console sections"><button type="button" aria-current={section === 'games' ? 'page' : undefined} onClick={() => setSection('games')}>GAMES</button><button type="button" aria-current={section === 'media' ? 'page' : undefined} onClick={() => setSection('media')}>MEDIA</button></nav>
            <div className="console-header-status"><ControllerStatus state={controller} /><time dateTime={clock.toISOString()}>{clock.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })}</time><span className="console-profile"><span className="profile-avatar" aria-hidden="true">A</span>ALEXANDER<i className={`status-dot ${online ? 'is-online' : ''}`} role="img" aria-label={online ? 'Online' : 'Offline'} /></span></div>
          </header>
          <main className="console-main">
            {section === 'games' ? (
              <>
                <section className="console-hero" aria-labelledby="console-game-title">
                  <div className="console-hero-copy">
                    <div className="console-tech"><span>PS5™ PRO ENHANCED</span><span>120 FPS ULTRA</span><span>TEMPEST 3D AUDIO</span></div>
                    <p className="console-eyebrow protocol-edition">SILICON VALLEY PROTOCOL</p>
                    <h1 id="console-game-title" className="console-title font-orbitron">RETRO<br />HOTLINE<span className="title-period">.</span></h1>
                    <p className="console-subtitle">BAY AREA & SILICON VALLEY CYBER-SECTOR <span>· 1989 / 2089</span></p>
                    <dl className="console-records" aria-label="Personal records">{[['HIGH SCORE', profile.highScore], ['MAX WAVE', profile.maxWave], ['TOTAL KILLS', profile.totalKills], ['GLORY KILLS', profile.totalGloryKills]].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{Number(value).toLocaleString()}</dd></div>)}</dl>
                    <div className="console-actions"><button ref={launchRef} type="button" className="console-primary" aria-keyshortcuts="X Enter" onClick={onStart}><span aria-hidden="true">✕</span> LAUNCH PROTOCOL</button><button type="button" className="console-secondary" aria-haspopup="dialog" aria-keyshortcuts="C" onClick={() => setControls(true)}><span aria-hidden="true">◻︎</span> CONTROLS & TACTICS</button></div>
                    <div className="console-utilities"><button type="button" aria-keyshortcuts="O Escape" onClick={() => setStandby(true)}><span aria-hidden="true">○</span> STANDBY</button><button type="button" aria-keyshortcuts="M" aria-pressed={!hud.muted} onClick={onAudio}><span aria-hidden="true">△</span> AUDIO: {hud.muted ? 'OFF' : 'ON'}</button></div>
                  </div>
                  <CampusPreview />
                </section>
                <section className="console-activities" aria-label="Activities">
                  <article><div className="activity-top"><span>EXPEDITION</span><svg viewBox="0 0 24 16" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true"><path d="M6 13 18 1M7 1h11v11" /></svg></div><h2>BAY TO SILICON VALLEY</h2><p>Transit span to Sand Hill Quantum Vault</p><div className="activity-route" aria-hidden="true"><i /><span /><i /><span /><i /><span /><i /></div></article>
                  <article><div className="activity-top"><span>TACTICAL CYBER-COMBAT</span><span aria-hidden="true">✕</span></div><h2>HOLD THE TRIGGER.</h2><p>Full-Auto Pulse Rifle · Glory Shatter</p><div className="activity-foot">PHASE DASH <span>/</span> PARRY <kbd>V</kbd> <span>/</span> SLAM <kbd>G</kbd></div></article>
                  <article><div className="activity-top"><span>PROCEDURAL WEBAUDIO</span><svg viewBox="0 0 24 16" fill="none" stroke="currentColor" aria-hidden="true"><path d="M2 5v6m5-9v12m5-14v16m5-13v10m5-8v6" /></svg></div><h2>THE CITY HAS A PULSE.</h2><p>5 stems · 3 switchable synth tracks</p><div className="activity-foot">ZERO EXTERNAL MP3 / WAV MUSIC</div></article>
                </section>
              </>
            ) : (
              <section className="console-media" aria-labelledby="console-media-title"><p className="console-eyebrow">PROCEDURAL WEBAUDIO / 5 STEMS</p><h1 id="console-media-title" className="font-orbitron">THE FREQUENCY<br />OF THE CITY.</h1><p>Three synth tracks. One continuous mix.</p><ol>{SYNTH_TRACKS.map((track, i) => <li key={track.id} aria-current={track.name === hud.musicTrackName ? 'true' : undefined}><span className="media-number">0{i + 1}</span><div><h2>{track.name}</h2><p>{track.genre}</p></div><span>{track.bpm} BPM</span><span className="media-playing">{track.name === hud.musicTrackName ? 'SELECTED' : '—'}</span></li>)}</ol><div className="console-actions"><button type="button" className="console-primary" onClick={onTrack}>[N] NEXT TRACK</button><button type="button" className="console-secondary" aria-pressed={!hud.muted} onClick={onAudio}>AUDIO: {hud.muted ? 'OFF' : 'ON'}</button><button type="button" className="console-secondary" onClick={() => setSection('games')}>○ BACK TO GAMES</button></div></section>
            )}
          </main>
          <footer className="console-footer"><span>KEYBOARD + MOUSE COMBAT<span className="footer-divider">/</span>CONTROLLER CONSOLE NAVIGATION</span><button type="button" onClick={onTrack} aria-keyshortcuts="N" className="console-track-button" aria-label={`Next track, currently ${hud.musicTrackName ?? 'BAY BRIDGE RUNNER'}, ${hud.musicTrackBpm ?? 116} BPM`}><kbd>N</kbd><span>TRACK:</span><TrackBadge name={hud.musicTrackName} bpm={hud.musicTrackBpm} /></button></footer>
        </div>
      )}
      <dialog ref={dialogRef} aria-labelledby="console-controls-title" className="console-dialog backdrop:bg-black/75 backdrop:backdrop-blur-md" onCancel={(e) => { e.preventDefault(); setControls(false) }} onClose={() => setControls(false)} onClick={(e) => { if (e.target === e.currentTarget) { const r = e.currentTarget.getBoundingClientRect(); if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) setControls(false) } }}>
        <header><div><p className="console-eyebrow">FIELD MANUAL / 01</p><h2 id="console-controls-title">CONTROLS & TACTICS</h2></div><button type="button" autoFocus onClick={() => setControls(false)} aria-label="Close controls">✕</button></header>
        <ControlsGrid />
        <footer><span>COMBAT: KEYBOARD + MOUSE</span><button type="button" className="console-secondary" onClick={() => setControls(false)}>CLOSE <kbd>ESC</kbd></button></footer>
      </dialog>
    </div>
  )
}
