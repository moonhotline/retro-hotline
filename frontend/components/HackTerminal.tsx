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
          <h2 id="hack-terminal-title" className="font-orbitron">NEON HACK<span>构筑终端</span></h2>
          <p className="hack-terminal-wave font-tech">WAVE {String(wave).padStart(2, '0')}<br />CLEARED</p>
        </header>
        <p id="hack-terminal-help" className="hack-terminal-help">
          战斗已暂停。安装一个改造，继续下一波。<span>本局生效 · 不可重复获取</span>
        </p>
        <div className="hack-draft-cards">
          {hacks.map((hack, index) => {
            const [name, alias] = hack.name.split(' // ')
            return (
              <button key={hack.id} type="button" className="hack-card" data-tier={hack.tier}
                ref={(element) => { cards.current[index] = element }}
                onClick={() => {
                  if (committed.current) return
                  committed.current = true
                  onSelect(hack.id)
                }}>
                <span className="hack-card-meta font-tech">
                  <span className="hack-tier">{hack.tier}</span><kbd>{index + 1}</kbd>
                </span>
                <span className="hack-card-badge font-tech" aria-hidden="true">{hack.badge}</span>
                <span className="hack-card-name">{name}</span>
                <span className="hack-card-alias font-tech">{alias}</span>
                <span className="hack-card-tagline font-tech">{hack.tagline}</span>
                <span className="hack-card-description">{hack.description}</span>
                <span className="hack-card-install font-tech">INSTALL HACK <span aria-hidden="true">↵</span></span>
              </button>
            )
          })}
        </div>
        <footer className="hack-terminal-footer font-tech">
          <span><kbd>1–{hacks.length}</kbd> 切换 <span aria-hidden="true">/</span> <kbd>ENTER</kbd> 安装</span>
          <span>或点击卡片安装</span>
        </footer>
      </section>
    </div>
  )
}
