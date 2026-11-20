import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import gsap from 'gsap'
import type { HudState } from '../game/types'
import { TrackBadge } from './ConsoleMenu'
import { MistAtmosphere } from './MistAtmosphere'

interface PauseSceneProps {
  hud: HudState
  onResume: () => void
  onRestart: () => void
  onAudio: () => void
}

export function PauseScene({ hud, onResume, onRestart, onAudio }: PauseSceneProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const resumeRef = useRef<HTMLButtonElement>(null)
  const [prismBoost, setPrismBoost] = useState(false)
  const resume = () => { dialogRef.current?.close(); onResume() }
  const restart = () => { dialogRef.current?.close(); onRestart() }
  useEffect(() => {
    const dialog = dialogRef.current
    dialog?.showModal()
    resumeRef.current?.focus({ preventScroll: true })
    if (!dialog) return
    const ctx = gsap.context(() => {
      const tl = gsap.timeline({ defaults: { ease: 'expo.out' } })
      tl.from('.pause-header', { y: -14, opacity: 0, duration: 0.45 }, 0.04)
        .from('.pause-title', { y: 28, opacity: 0, clipPath: 'inset(0 0 100% 0)', duration: 0.68 }, 0.1)
        .from('.pause-hint', { x: -12, opacity: 0, duration: 0.45 }, 0.25)
        .from('.pause-actions button', { y: 14, opacity: 0, stagger: 0.08, duration: 0.5, ease: 'power3.out' }, 0.3)
        .from('.pause-session > div', { y: 12, opacity: 0, stagger: 0.06, duration: 0.48 }, 0.36)
        .from('.pause-footer > .console-track', { opacity: 0, x: 14, duration: 0.48 }, 0.42)
    }, dialog)
    return () => {
      ctx.revert()
      dialog.close()
    }
  }, [])

  return createPortal(
    <dialog
      ref={dialogRef}
      className="pause-scene"
      aria-labelledby="pause-title"
      aria-describedby="pause-hint"
      onCancel={(event) => { event.preventDefault(); resume() }}
      onClick={resume}
      onKeyDown={(event) => {
        // Preserve native button activation before the game's Space handler.
        if (event.code === 'Enter' || event.code === 'Space') event.stopPropagation()
      }}
    >
      <MistAtmosphere bpm={hud.musicTrackBpm} variant="pause" energyBoost={prismBoost} />
      <header className="pause-header">
        <span className="pause-wordmark font-orbitron">RETRO HOTLINE</span>
        <button type="button" className="pause-audio" aria-pressed={!hud.muted}
          aria-label={hud.muted ? 'Turn audio on' : 'Turn audio off'}
          onClick={(event) => { event.stopPropagation(); onAudio() }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
            <path d="M4 9h4l5-4v14l-5-4H4Z" />
            {hud.muted ? <path d="m17 9 5 6m0-6-5 6" /> : <path d="M17 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14" />}
          </svg>
          AUDIO: {hud.muted ? 'OFF' : 'ON'}
        </button>
      </header>

      <div className="pause-content">
        <h2 id="pause-title" className="pause-title font-orbitron">PAUSED<span>.</span></h2>
        <p id="pause-hint" className="pause-hint font-tech">CLICK ANYWHERE TO RESUME</p>
        <div className="pause-actions">
          <button type="button" ref={resumeRef} className="pause-resume"
            onMouseEnter={() => setPrismBoost(true)}
            onMouseLeave={() => setPrismBoost(false)}
            onClick={(event) => { event.stopPropagation(); resume() }}>
            <span aria-hidden="true">✕</span> RESUME
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M4 12h15m-6-6 6 6-6 6" /></svg>
          </button>
          <button type="button" className="pause-restart"
            onClick={(event) => { event.stopPropagation(); restart() }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M4 10a8 8 0 1 1 1 7M4 4v6h6" /></svg>
            RESTART
          </button>
        </div>
      </div>

      <footer className="pause-footer">
        <dl className="pause-session" aria-label="Current session">
          <div><dt>WAVE</dt><dd>{String(hud.wave).padStart(2, '0')}</dd></div>
          <div><dt>SCORE</dt><dd>{hud.score.toLocaleString()}</dd></div>
          <div><dt>KILLS</dt><dd>{hud.kills.toLocaleString()}</dd></div>
        </dl>
        <TrackBadge name={hud.musicTrackName} bpm={hud.musicTrackBpm} />
      </footer>
    </dialog>,
    document.body,
  )
}
