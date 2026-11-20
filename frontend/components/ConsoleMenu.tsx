import { useCallback, useEffect, useRef, useState } from 'react'
import gsap from 'gsap'
import type { PlayerProfile } from '../game/combat/storage'
import { MUSIC_TRACKS } from '../game/music'
import type { HudState } from '../game/types'
import { MistAtmosphere } from './MistAtmosphere'
import { NightGarage } from './NightGarage'
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

export function TrackBadge({ name = 'NEON COMBAT SUITE', bpm = 125 }: { name?: string; bpm?: number }) {
  return (
    <span className="console-track" role="status" aria-live="polite" aria-atomic="true">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M3 10v4m4-7v10m5-14v18m5-14v10m4-7v4" /></svg>
      <span>{name}</span><span className="track-bpm">{bpm} BPM</span>
    </span>
  )
}

const CONTROL_GROUPS = [
  { title: 'MOVEMENT', rows: [['Move / Drive', 'W A S D'], ['Jump / Wall climb', 'SPACE'], ['Sprint / Phase dash', 'SHIFT']] },
  { title: 'COMBAT', rows: [['Fire weapon', 'LMB'], ['Hack sniper / punch', 'F'], ['Punch / Sniper zoom', 'RMB'], ['Glory kill / Interact', 'E'], ['Reload / swap weapon', 'R / Q / 1-4']] },
  { title: 'CYBER-ABILITIES', note: 'KEYBOARD ONLY', rows: [['Phase dash · tap', 'SHIFT'], ['Wall run / climb · air near wall', 'SPACE'], ['Sniper shot hijack', 'F']] },
  { title: 'AUDIO & SYSTEM', rows: [['Cycle music track', 'N'], ['Toggle audio', 'M'], ['Pause / release cursor', 'ESC'], ['Controls / standby', 'I / O']] },
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
      <div className="console-control-note"><kbd>SHIFT</kbd> PHASE DASH <span>/</span> <kbd>SPACE</kbd> WALL CLIMB <span>/</span> <kbd>F</kbd> HIJACK <p>Mouse buttons shoot and zoom/punch. Press E to shatter staggered targets or enter vehicles.</p></div>
      <p className="console-tactic">Break targets into stagger, then press E to shatter them for health and overdrive across all five connected landmarks.</p>
    </>
  )
}

const WORLD_SECTORS = [
  ['01', 'GOLDEN GATE'],
  ['02', 'TIMES SQUARE'],
  ['03', 'VEGAS SPHERE'],
  ['04', 'GOOGLEPLEX'],
  ['05', 'APPLE PARK'],
] as const

function PrismSectorLegend() {
  return (
    <div className="console-prism-stage" aria-label="Connected world sectors">
      <div className="prism-route-strip">
        {WORLD_SECTORS.map(([num, name]) => (
          <span key={num}><em>{num}</em> {name}</span>
        ))}
      </div>
    </div>
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
  const [standby, setStandby] = useState(() => !(typeof window !== 'undefined' && window.location.search.includes('garage=1')))
  const [section, setSection] = useState<'games' | 'garage' | 'media'>(() =>
    typeof window !== 'undefined' && window.location.search.includes('garage=1') ? 'garage' : 'games'
  )
  const [controls, setControls] = useState(false)
  const [prismBoost, setPrismBoost] = useState(false)
  const [clock, setClock] = useState(new Date())
  const [online, setOnline] = useState(navigator.onLine)
  const shellRef = useRef<HTMLDivElement>(null)
  const initializeRef = useRef<HTMLButtonElement>(null)
  const launchRef = useRef<HTMLButtonElement>(null)
  const dialogRef = useRef<HTMLDialogElement>(null)
  const wake = useCallback(() => { onWake(); setStandby(false) }, [onWake])
  const back = useCallback(() => {
    if (controls) setControls(false)
    else if (section === 'media' || section === 'garage') setSection('games')
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

  // GSAP choreographed motion timelines for Standby, Dashboard, and Media surfaces.
  useEffect(() => {
    const shell = shellRef.current
    if (!shell) return
    const ctx = gsap.context(() => {
      if (standby) {
        const tl = gsap.timeline({ defaults: { ease: 'expo.out' } })
        tl.from('.standby-status', { y: -16, opacity: 0, duration: 0.65 }, 0.05)
          .from('.standby-center .console-eyebrow', { x: -22, opacity: 0, duration: 0.7 }, 0.14)
          .from('.standby-title', { y: 34, opacity: 0, clipPath: 'inset(0 0 100% 0)', duration: 0.95 }, 0.2)
          .from('.standby-protocol', { x: -16, opacity: 0, duration: 0.65 }, 0.42)
          .from('.standby-glyphs span', { y: 16, opacity: 0, scale: 0.7, stagger: 0.08, duration: 0.55, ease: 'back.out(1.9)' }, 0.48)
          .from('.standby-initialize', { y: 18, opacity: 0, duration: 0.72 }, 0.62)
          .from('.standby-footer', { y: 14, opacity: 0, duration: 0.65 }, 0.74)

        // Ambient breathing wave across the 4 PlayStation glyphs
        gsap.to('.standby-glyphs span', {
          y: -6,
          color: '#e0fcff',
          textShadow: '0 0 18px rgba(100, 238, 255, 0.85)',
          duration: 1.05,
          ease: 'sine.inOut',
          stagger: { each: 0.22, repeat: -1, yoyo: true },
          delay: 1.1,
        })
        // Subtle floating cadence on the CTA pill
        gsap.to('.standby-initialize', {
          boxShadow: '0 12px 34px rgba(85, 232, 255, 0.28)',
          duration: 1.8,
          ease: 'sine.inOut',
          repeat: -1,
          yoyo: true,
          delay: 1.2,
        })
      } else if (section === 'games') {
        const tl = gsap.timeline({ defaults: { ease: 'expo.out' } })
        tl.from('.console-header', { y: -14, opacity: 0, duration: 0.55 }, 0)
          .from('.console-tech span', { y: 10, opacity: 0, stagger: 0.055, duration: 0.5 }, 0.08)
          .from('.protocol-edition', { x: -14, opacity: 0, duration: 0.55 }, 0.15)
          .from('.console-title', { y: 24, opacity: 0, clipPath: 'inset(0 0 100% 0)', duration: 0.85 }, 0.18)
          .from('.console-subtitle', { opacity: 0, y: 10, duration: 0.55 }, 0.34)
          .from('.console-records > div', { y: 14, opacity: 0, stagger: 0.06, duration: 0.55 }, 0.38)
          .from('.console-actions button', { y: 14, opacity: 0, stagger: 0.08, duration: 0.55 }, 0.48)
          .from('.console-utilities', { opacity: 0, duration: 0.5 }, 0.58)
          .from('.prism-route-strip span', { y: 12, opacity: 0, stagger: 0.055, duration: 0.5 }, 0.34)
          .from('.console-activities article', { y: 22, opacity: 0, stagger: 0.09, duration: 0.65, ease: 'power3.out' }, 0.5)
      } else if (section === 'media') {
        gsap.from('.console-media > *', { y: 18, opacity: 0, stagger: 0.07, duration: 0.6, ease: 'expo.out' })
      }
    }, shell)
    return () => ctx.revert()
  }, [standby, section])

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.altKey || e.ctrlKey || e.metaKey || e.isComposing) return
      if (!['Enter', 'Space', 'KeyX', 'KeyI', 'KeyM', 'KeyN', 'Escape', 'KeyO'].includes(e.code)) return
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
      else if (e.code === 'KeyI') setControls((value) => !value)
      else if (e.code === 'KeyM') onAudio()
      else if (e.code === 'KeyN') onTrack()
      else if (!controls && section === 'games' && ['KeyX', 'Enter'].includes(e.code)) onStart()
    }
    window.addEventListener('keydown', handleKey, true)
    return () => window.removeEventListener('keydown', handleKey, true)
  }, [standby, controls, section, wake, back, onStart, onAudio, onTrack])

  return (
    <div ref={shellRef} className="ps5-standby-screen console-shell" data-ps5-phase={standby ? 'standby' : 'dashboard'}>
      <div className="console-atmosphere" aria-hidden="true">
      <MistAtmosphere bpm={hud.musicTrackBpm} variant={standby ? 'standby' : 'dashboard'} energyBoost={prismBoost} />
      {!standby && <>
      <div className="ps5-ambient-ribbon" aria-hidden="true" />
      <svg className="console-ribbons" viewBox="0 0 1440 900" preserveAspectRatio="xMidYMid slice" fill="none" aria-hidden="true">
        <path d="M-200 740C300 100 650 1230 1650 170" stroke="#3db4d9" strokeWidth="38" opacity=".06" />
        <path d="M-200 740C300 100 650 1230 1650 170" stroke="#9ae8f4" strokeWidth="1" opacity=".35" />
        <path d="M-200 752C310 130 670 1230 1650 200" stroke="#9ae8f4" strokeWidth=".6" opacity=".15" />
      </svg>
      </>}
      </div>
      {!standby && section === 'garage' ? (
        <NightGarage onBack={() => setSection('games')} />
      ) : standby ? (
        <main className="console-standby" aria-label="Console standby">
          <div className="standby-status"><ControllerStatus state={controller} /></div>
          <div className="standby-center">
            <p className="console-eyebrow">BAY AREA · 1989 / 2089</p>
            <h1 className="standby-title font-orbitron">RETRO<br className="standby-break" /> HOTLINE</h1>
            <p className="standby-protocol">// SILICON VALLEY PROTOCOL</p>
            <div className="standby-glyphs" aria-hidden="true"><span>✕</span><span>○</span><span>△</span><span>◻︎</span></div>
            <button
              ref={initializeRef}
              type="button"
              className="console-primary standby-initialize"
              aria-keyshortcuts="Enter Space X"
              onMouseEnter={() => setPrismBoost(true)}
              onMouseLeave={() => setPrismBoost(false)}
              onClick={wake}
            >PRESS [✕ / ENTER] TO INITIALIZE</button>
          </div>
          <footer className="standby-footer"><span>PROCEDURAL WEBAUDIO</span><TrackBadge name={hud.musicTrackName} bpm={hud.musicTrackBpm} /><span>PRESS N TO CHANGE TRACK</span></footer>
        </main>
      ) : (
        <div className="console-dashboard">
          <header className="console-header">
            <nav aria-label="Console sections">
              <button type="button" aria-current={section === 'games' ? 'page' : undefined} onClick={() => setSection('games')}>GAMES</button>
              <button type="button" onClick={() => setSection('garage')}>NIGHT GARAGE</button>
              <button type="button" aria-current={section === 'media' ? 'page' : undefined} onClick={() => setSection('media')}>MEDIA</button>
            </nav>
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
                    <div className="console-actions"><button ref={launchRef} type="button" className="console-primary" aria-keyshortcuts="X Enter" onMouseEnter={() => setPrismBoost(true)} onMouseLeave={() => setPrismBoost(false)} onClick={onStart}><span aria-hidden="true">✕</span> LAUNCH PROTOCOL</button><button type="button" className="console-secondary" aria-haspopup="dialog" aria-keyshortcuts="I" onClick={() => setControls(true)}><span aria-hidden="true">◻︎</span> CONTROLS & TACTICS</button></div>
                    <div className="console-utilities"><button type="button" aria-keyshortcuts="O Escape" onClick={() => setStandby(true)}><span aria-hidden="true">○</span> STANDBY</button><button type="button" aria-keyshortcuts="M" aria-pressed={!hud.muted} onClick={onAudio}><span aria-hidden="true">△</span> AUDIO: {hud.muted ? 'OFF' : 'ON'}</button></div>
                  </div>
                  <PrismSectorLegend />
                </section>
                <section className="console-activities" aria-label="Activities">
                  <article><div className="activity-top"><span>OPEN CORRIDOR</span><svg viewBox="0 0 24 16" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true"><path d="M6 13 18 1M7 1h11v11" /></svg></div><h2>FIVE CONNECTED LANDMARKS</h2><p>Golden Gate to Times Sq, Sphere & Apple Park</p><div className="activity-route" aria-hidden="true"><i /><span /><i /><span /><i /><span /><i /><span /><i /></div></article>
                  <article><div className="activity-top"><span>TACTICAL CYBER-COMBAT</span><span aria-hidden="true">✕</span></div><h2>HOLD THE TRIGGER.</h2><p>Industrial Pulse Rifle · Glory Shatter · Hijack</p><div className="activity-foot">PHASE DASH <kbd>SHIFT</kbd> <span>/</span> WALL CLIMB <kbd>SPACE</kbd> <span>/</span> HIJACK <kbd>F</kbd></div></article>
                  <article><div className="activity-top"><span>NIGHT GARAGE</span><svg viewBox="0 0 24 16" fill="none" stroke="currentColor" aria-hidden="true"><path d="M2 5v6m5-9v12m5-14v16m5-13v10m5-8v6" /></svg></div><h2>ROUTE B INDUSTRIAL CRAFT.</h2><p>Inspect procedural weapons, lighting & telemetry</p><div className="activity-foot">OPEN NIGHT GARAGE IN TOP NAV</div></article>
                </section>
              </>
            ) : (
              <section className="console-media" aria-labelledby="console-media-title"><p className="console-eyebrow">ORIGINAL SOUNDTRACKS</p><h1 id="console-media-title" className="font-orbitron">THE FREQUENCY<br />OF THE CITY.</h1><p>One combat suite. Three synth tracks.</p><ol>{MUSIC_TRACKS.map((track, i) => <li key={track.id} aria-current={track.name === hud.musicTrackName ? 'true' : undefined}><span className="media-number">0{i + 1}</span><div><h2>{track.name}</h2><p>{track.genre}</p></div><span>{track.bpm} BPM</span><span className="media-playing">{track.name === hud.musicTrackName ? 'SELECTED' : '—'}</span></li>)}</ol><div className="console-actions"><button type="button" className="console-primary" onClick={onTrack}>[N] NEXT TRACK</button><button type="button" className="console-secondary" aria-pressed={!hud.muted} onClick={onAudio}>AUDIO: {hud.muted ? 'OFF' : 'ON'}</button><button type="button" className="console-secondary" onClick={() => setSection('games')}>○ BACK TO GAMES</button></div></section>
            )}
          </main>
          <footer className="console-footer"><span>KEYBOARD + MOUSE COMBAT<span className="footer-divider">/</span>CONTROLLER CONSOLE NAVIGATION</span><button type="button" onClick={onTrack} aria-keyshortcuts="N" className="console-track-button" aria-label={`Next track, currently ${hud.musicTrackName ?? 'NEON COMBAT SUITE'}, ${hud.musicTrackBpm ?? 125} BPM`}><kbd>N</kbd><span>TRACK:</span><TrackBadge name={hud.musicTrackName} bpm={hud.musicTrackBpm} /></button></footer>
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
