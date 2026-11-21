import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import gsap from 'gsap'
import { MistAtmosphere } from './MistAtmosphere'
import './Home.css'

interface HomeProps {
  onEnterGame: () => void
  onEnterLab: () => void
  motionPaused: boolean
  onToggleMotion: () => void
}

export function Home({ onEnterGame, onEnterLab, motionPaused, onToggleMotion }: HomeProps) {
  const root = useRef<HTMLElement>(null)
  const animation = useRef<{ intro: gsap.core.Timeline; glow: gsap.core.Tween } | null>(null)
  const music = useRef<HTMLAudioElement>(null)
  const [playing, setPlaying] = useState(false)
  const [failed, setFailed] = useState(false)
  const [prismBoost, setPrismBoost] = useState(false)

  useLayoutEffect(() => {
    const context = gsap.context(() => {
      // Standby choreography from 92b3a8b.
      const intro = gsap.timeline({ defaults: { ease: 'expo.out' } })
        .from('h1', { y: 34, opacity: 0, clipPath: 'inset(0 0 100% 0)', duration: 0.95 }, 0.2)
        .from('.home-actions', { y: 18, opacity: 0, duration: 0.72 }, 0.62)
        .from('.home-track', { y: 14, opacity: 0, duration: 0.65 }, 0.74)
      const glow = gsap.to('.home-enter', {
        boxShadow: '0 12px 34px rgba(85, 232, 255, 0.28)',
        duration: 1.8,
        ease: 'sine.inOut',
        repeat: -1,
        yoyo: true,
        delay: 1.2,
      })
      animation.current = { intro, glow }
    }, root)
    return () => {
      animation.current = null
      context.revert()
    }
  }, [])

  useLayoutEffect(() => {
    const current = animation.current
    if (!current) return
    if (motionPaused) current.intro.progress(1).pause()
    current.glow.paused(motionPaused)
  }, [motionPaused])

  useEffect(() => {
    const track = music.current
    if (!track) return
    track.volume = 0.6
    return () => track.pause()
  }, [])

  function toggleMusic() {
    const track = music.current
    if (!track) return
    setFailed(false)
    if (track.paused) {
      if (track.error) track.load()
      void track.play().catch((error: unknown) => {
        if (music.current === track && !(error instanceof DOMException && error.name === 'AbortError')) {
          setFailed(true)
        }
      })
    } else {
      track.pause()
    }
  }

  return (
    <main ref={root} className="home" data-motion-paused={motionPaused}>
      <MistAtmosphere energyBoost={prismBoost} paused={motionPaused} />
      <div className="home-content">
        <h1>RETRO<br />HOTLINE</h1>
        <div className="home-actions">
          <button type="button" className="home-enter" onClick={onEnterGame}
            onMouseEnter={() => setPrismBoost(true)}
            onMouseLeave={event => setPrismBoost(event.currentTarget.matches(':focus-visible'))}
            onFocus={event => setPrismBoost(event.currentTarget.matches(':focus-visible, :hover'))}
            onBlur={event => setPrismBoost(event.currentTarget.matches(':hover'))}>
            进入主游戏
          </button>
          <button type="button" aria-keyshortcuts="P" onClick={onEnterLab}>进入 Dev Lab <kbd>P</kbd></button>
        </div>
      </div>
      <div className="home-sound">
        <audio ref={music} src="/audio/bgm_menu.wav?v=mist-105-1" preload="none" loop
          onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)}
          onError={() => { setPlaying(false); setFailed(true) }} />
        <button type="button" className="home-track" onClick={toggleMusic}>{playing ? '暂停音乐' : '播放音乐'} <span>· Mist</span></button>
        <button type="button" onClick={onToggleMotion}>{motionPaused ? '播放动效' : '暂停动效'}</button>
        {failed && <div role="status">音乐加载失败</div>}
      </div>
    </main>
  )
}
