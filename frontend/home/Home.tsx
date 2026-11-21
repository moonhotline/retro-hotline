import { useEffect, useRef, useState } from 'react'
import { MistAtmosphere } from './MistAtmosphere'
import './Home.css'

export function Home({ onEnterGame, onEnterLab }: { onEnterGame: () => void; onEnterLab: () => void }) {
  const music = useRef<HTMLAudioElement>(null)
  const [playing, setPlaying] = useState(false)
  const [failed, setFailed] = useState(false)
  const [prismBoost, setPrismBoost] = useState(false)

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
    <main className="home">
      <MistAtmosphere energyBoost={prismBoost} />
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
        <button type="button" onClick={toggleMusic}>{playing ? '暂停音乐' : '播放音乐'} <span>· Mist</span></button>
        {failed && <div role="status">音乐加载失败</div>}
      </div>
    </main>
  )
}
