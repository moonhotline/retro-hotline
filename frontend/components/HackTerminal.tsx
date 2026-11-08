import { useEffect, useRef } from 'react'
import type { Sfx } from '../game/audio'
import type { HackId, NeonHack } from '../game/combat/modifiers'
import './HackTerminal.css'

interface HackTerminalProps {
  hacks: NeonHack[]
  wave: number
  onSelect(id: HackId): void
  audio?: Pick<Sfx, 'gloryPing'>
}

function HackIcon({ id }: { id: HackId }) {
  switch (id) {
    case 'freeze':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="hack-icon" aria-hidden="true">
          <path d="M12 2v20M2 12h20M4.93 4.93l14.14 14.14M4.93 19.07 19.07 4.93" />
          <path d="m9 3 3 2 3-2M9 21l3-2 3 2M3 9l2 3-2 3M21 9l-2 3 2 3" />
        </svg>
      )
    case 'burn':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="hack-icon" aria-hidden="true">
          <path d="M12 2c1 3.5 4 6 4 10a6 6 0 0 1-12 0c0-4 3-6.5 4-10 1 2.5 3 3.5 4 0Z" />
          <path d="M12 14a2.5 2.5 0 0 0-2.5 2.5c0 1.5 1.2 2.5 2.5 2.5s2.5-1 2.5-2.5c0-1.5-1.2-2.5-2.5-2.5Z" />
        </svg>
      )
    case 'attack_speed':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="hack-icon" aria-hidden="true">
          <path d="M13 2 4 14h7l-2 8 11-12h-7l2-8Z" />
        </svg>
      )
    case 'max_hp':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="hack-icon" aria-hidden="true">
          <path d="M12 2 3 7v6c0 5.5 3.8 10 9 11 5.2-1 9-5.5 9-11V7l-9-5Z" />
          <path d="M12 8v8M8 12h8" />
        </svg>
      )
    case 'move_speed':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="hack-icon" aria-hidden="true">
          <path d="m13 5 7 7-7 7M4 12h16M7 5l7 7-7 7" />
        </svg>
      )
  }
}

/** Numbers focus a card; Enter or a click installs it. The draft owns keyboard focus. */
export function HackTerminal({ hacks, wave, onSelect, audio }: HackTerminalProps) {
  const cards = useRef<Array<HTMLButtonElement | null>>([])
  const committed = useRef(false)

  useEffect(() => {
    if (hacks.length === 0) return
    const previousFocus = document.activeElement
    committed.current = false
    cards.current[0]?.focus()
    const keydown = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey) return
      event.stopImmediatePropagation()
      if (event.key === 'Tab') {
        event.preventDefault()
        const current = cards.current.findIndex((card) => card === document.activeElement)
        const next = (current + (event.shiftKey ? -1 : 1) + hacks.length) % hacks.length
        cards.current[next]?.focus()
      } else if (['1', '2', '3'].includes(event.key)) {
        event.preventDefault()
        if (event.repeat) return
        const card = cards.current[Number(event.key) - 1]
        if (card) { card.focus(); audio?.gloryPing() }
      } else if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault()
        if (!event.repeat) {
          const focused = cards.current.find((card) => card === document.activeElement)
          ;(focused ?? cards.current[0])?.click()
        }
      } else {
        // Escape cannot dismiss a mandatory draft; movement and weapon keys stay inert.
        event.preventDefault()
      }
    }
    window.addEventListener('keydown', keydown, true)
    return () => {
      window.removeEventListener('keydown', keydown, true)
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus()
    }
  }, [hacks, audio])

  if (hacks.length === 0) return null

  return (
    <div className="hack-terminal-overlay" onClick={(event) => event.stopPropagation()}
      onMouseDown={(event) => event.stopPropagation()}>
      <section className="hack-terminal" role="dialog" aria-modal="true"
        aria-labelledby="hack-terminal-title" aria-describedby="hack-terminal-help">
        <header className="hack-terminal-header">
          <h2 id="hack-terminal-title" className="font-orbitron">NEON UPGRADE<span>战术核心重构</span></h2>
          <p className="hack-terminal-wave font-tech">WAVE {String(wave).padStart(2, '0')}<br />CLEARED</p>
        </header>
        <p id="hack-terminal-help" className="hack-terminal-help">
          战斗已暂停。选择一项战术强化以继续。<span>本局永久生效 · 极简战术构筑</span>
        </p>
        <div className="hack-draft-cards">
          {hacks.map((hack, index) => {
            const [name, alias] = hack.name.split(' // ')
            return (
              <button key={hack.id} type="button" className="hack-card" data-tier={hack.tier} data-hack={hack.id}
                ref={(element) => { cards.current[index] = element }}
                onClick={() => {
                  if (committed.current) return
                  committed.current = true
                  onSelect(hack.id)
                }}>
                <span className="hack-card-meta font-tech">
                  <span className="hack-tier">{hack.tier}</span>
                  <span className="hack-key-hint"><span className="ps5-glyph" aria-hidden="true">✕</span> <kbd>{index + 1}</kbd></span>
                </span>
                <div className="hack-card-icon-wrap">
                  <HackIcon id={hack.id} />
                  <span className="hack-card-badge font-tech" aria-hidden="true">{hack.badge}</span>
                </div>
                <span className="hack-card-name">{name}</span>
                <span className="hack-card-alias font-tech">{alias}</span>
                <span className="hack-card-tagline font-tech">{hack.tagline}</span>
                <span className="hack-card-description">{hack.description}</span>
                <span className="hack-card-install font-tech">
                  <span>INSTALL PROTOCOL</span>
                  <span aria-hidden="true">↵</span>
                </span>
              </button>
            )
          })}
        </div>
        <footer className="hack-terminal-footer font-tech">
          <span><kbd>1–{hacks.length}</kbd> 切换 <span aria-hidden="true">/</span> <kbd>ENTER</kbd> 安装</span>
          <span>手柄按 <span className="ps5-glyph">✕</span> 或鼠标点击</span>
        </footer>
      </section>
    </div>
  )
}
