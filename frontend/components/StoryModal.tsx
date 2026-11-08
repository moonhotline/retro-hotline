import { useEffect, useState } from 'react'
import type { ShopItemData } from '../game/types'

export interface StoryModalProps {
  story: {
    open: boolean
    entityId: string
    title: string
    badge: string
    lines: Array<{
      speaker: string
      roleBadge?: string
      text?: string
      textEn?: string
      textZh?: string
    }>
    promptLabel: string
    isShopOpen?: boolean
    shopItems?: ShopItemData[]
  }
  score?: number
  onClose: () => void
  onBuyItem?: (item: ShopItemData) => boolean
  audioPing?: () => void
}

export function StoryModal({ story, score = 0, onClose, onBuyItem, audioPing }: StoryModalProps) {
  const [lineIndex, setLineIndex] = useState(0)

  useEffect(() => {
    if (story.open) {
      setLineIndex(0)
      audioPing?.()
    }
  }, [story.open, audioPing])

  useEffect(() => {
    if (!story.open) return

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.repeat) return
      if (e.key === ' ' || e.key === 'Enter' || e.key === 'e' || e.key === 'E' || e.code === 'KeyE') {
        e.preventDefault()
        e.stopPropagation()
        if (lineIndex < story.lines.length - 1) {
          setLineIndex((prev) => prev + 1)
          audioPing?.()
        } else {
          onClose()
        }
      } else if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        onClose()
      }
    }

    window.addEventListener('keydown', onKeyDown, { capture: true })
    return () => window.removeEventListener('keydown', onKeyDown, { capture: true })
  }, [story.open, lineIndex, story.lines.length, onClose, audioPing])

  if (!story.open || story.lines.length === 0) return null

  const currentLine = story.lines[lineIndex] ?? story.lines[0]!
  const isLast = lineIndex >= story.lines.length - 1
  const isMerchant = story.isShopOpen && Boolean(story.shopItems && story.shopItems.length > 0)

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={story.title}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md select-none"
      onClick={(e) => {
        e.stopPropagation()
        if (!isMerchant) {
          if (isLast) onClose()
          else {
            setLineIndex((prev) => prev + 1)
            audioPing?.()
          }
        }
      }}
    >
      <div
        className="w-full max-w-2xl mx-4 rounded-2xl border border-white/20 bg-[#060810]/98 p-6 shadow-2xl text-left backdrop:backdrop-blur-md"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header bar */}
        <div className="flex items-center justify-between border-b border-white/10 pb-3">
          <div className="flex items-center gap-2.5">
            <span className="h-2.5 w-2.5 rounded-full bg-[#00f0ff] shadow-[0_0_10px_#00f0ff]" />
            <span className="font-orbitron text-xs sm:text-sm font-bold tracking-widest text-[#9ffcff]">
              {story.title}
            </span>
          </div>
          <span className="rounded bg-white/10 px-2.5 py-1 font-tech text-[10px] uppercase tracking-wider text-white/80 border border-white/10">
            {story.badge}
          </span>
        </div>

        {/* Speaker Info */}
        <div className="mt-4 flex items-baseline gap-2">
          <span className="font-orbitron text-sm font-black text-[#ff2975]">
            {currentLine.speaker}
          </span>
          {currentLine.roleBadge && (
            <span className="font-tech text-[10px] tracking-widest text-white/50">
              [{currentLine.roleBadge}]
            </span>
          )}
        </div>

        {/* Bilingual Dialogue Subtitles */}
        <div className="mt-2.5 rounded-xl border border-white/10 bg-white/[0.03] p-4">
          <p className="font-mono text-sm leading-relaxed text-slate-100 tracking-wide">
            {currentLine.textEn || currentLine.text}
          </p>
          {currentLine.textZh && (
            <p className="mt-2 font-sans text-xs sm:text-sm text-[#00f0ff] font-medium tracking-wide leading-relaxed">
              {currentLine.textZh}
            </p>
          )}
        </div>

        {/* Black Market Storefront Section */}
        {isMerchant && story.shopItems && (
          <div className="mt-5 border-t border-white/10 pt-4">
            <div className="flex items-center justify-between mb-3">
              <span className="font-orbitron text-xs font-bold tracking-widest text-[#ffd319]">
                CONTRABAND SUPPLIES // 黑市补给
              </span>
              <span className="font-orbitron text-xs font-black tracking-wider text-white">
                SCORE: <span className="text-[#00f0ff]">{score}</span> PTS
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              {story.shopItems.map((item) => {
                const canAfford = score >= item.cost
                return (
                  <div
                    key={item.id}
                    className="flex flex-col justify-between rounded-xl border border-white/10 bg-black/40 p-3 hover:border-white/30 transition-colors"
                  >
                    <div>
                      <div className="font-orbitron text-[11px] font-bold text-white tracking-wide">
                        {item.name}
                      </div>
                      <div className="mt-1 font-tech text-[10px] text-[#39ff88] font-bold tracking-wider">
                        {item.effect}
                      </div>
                      <div className="mt-1 font-sans text-[10px] text-white/50 leading-tight">
                        {item.description}
                      </div>
                    </div>
                    <div className="mt-3 flex items-center justify-between pt-2 border-t border-white/10">
                      <span className="font-orbitron text-xs font-black text-[#ffd319]">
                        {item.cost} PTS
                      </span>
                      <button
                        type="button"
                        disabled={!canAfford}
                        onClick={() => onBuyItem?.(item)}
                        className={`rounded px-2.5 py-1 font-orbitron text-[10px] font-bold tracking-wider transition-all ${
                          canAfford
                            ? 'border border-[#00f0ff]/60 bg-[#00f0ff]/15 text-[#00f0ff] hover:bg-[#00f0ff]/30 hover:shadow-[0_0_8px_#00f0ff]'
                            : 'border border-white/10 text-white/30 cursor-not-allowed'
                        }`}
                      >
                        [ ◻︎ BUY ]
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Footer controls with PS5 Button Glyphs */}
        <div className="mt-6 flex items-center justify-between border-t border-white/10 pt-3 font-tech text-xs text-white/50">
          <span>
            {lineIndex + 1} / {story.lines.length}
          </span>
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={onClose}
              className="text-white/40 hover:text-white transition-colors"
            >
              [ESC] SKIP
            </button>
            <button
              type="button"
              onClick={() => {
                if (isLast) onClose()
                else {
                  setLineIndex((prev) => prev + 1)
                  audioPing?.()
                }
              }}
              className="font-bold text-[#00f0ff] hover:text-[#9ffcff] transition-colors"
            >
              {isLast
                ? story.entityId === 'merchant-ghost'
                  ? '[ E / ✕ ACCEPT PROTOTYPE // 领取原型狙击枪 ]'
                  : '[ E / ✕ COMPLETE // 确认关闭 ]'
                : '[ E / ◻︎ ADVANCE // 下一句 ]'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
