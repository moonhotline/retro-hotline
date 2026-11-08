import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { StoryModal } from './StoryModal'

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
  vi.unstubAllGlobals()
})

const SAMPLE_STORY = {
  open: true,
  entityId: 'term-01',
  title: 'INTERCEPTED RELAY',
  badge: 'SEC-1',
  lines: [
    {
      speaker: 'ORACLE',
      roleBadge: 'DISPATCH',
      textEn: 'Convoy approaching along the causeway.',
      textZh: '车队正沿堤道逼近。',
    },
    {
      speaker: 'OPERATOR',
      roleBadge: 'VANGUARD',
      textEn: 'Holding ground. Initiating hack.',
      textZh: '坚守阵地。启动破解。',
    },
  ],
  promptLabel: '◻︎ BREACH TERMINAL',
}

const SAMPLE_MERCHANT_STORY = {
  open: true,
  entityId: 'merchant-ghost',
  title: 'BLACK MARKET // GHOST',
  badge: 'CONTRABAND',
  lines: [
    {
      speaker: 'GHOST',
      roleBadge: 'BLACK MARKET',
      textEn: 'Welcome to the quiet side of Neon Bay.',
      textZh: '欢迎来到霓虹湾的寂静一面。',
    },
  ],
  promptLabel: '◻︎ BLACK MARKET',
  isShopOpen: true,
  shopItems: [
    {
      id: 'item-nano-repair',
      name: 'NANO REPAIR KIT',
      description: 'Emergency bio-synthetic nanites restoring physical integrity.',
      effect: '+50 HP // 恢复生命',
      cost: 300,
      kind: 'heal' as const,
    },
    {
      id: 'item-overclock-trigger',
      name: 'OVERCLOCK TRIGGER',
      description: 'Superconducting firing mechanism overclocking weapon cycler.',
      effect: '+25% SPEED // 提升射速',
      cost: 500,
      kind: 'attack_speed' as const,
    },
  ],
}

describe('StoryModal', () => {
  it('renders nothing when open is false', () => {
    act(() => {
      root.render(createElement(StoryModal, {
        story: { ...SAMPLE_STORY, open: false },
        onClose: vi.fn(),
      }))
    })
    expect(container.childElementCount).toBe(0)
  })

  it('renders bilingual subtitles (English & Chinese)', () => {
    act(() => {
      root.render(createElement(StoryModal, {
        story: SAMPLE_STORY,
        onClose: vi.fn(),
      }))
    })
    expect(container.textContent).toContain('INTERCEPTED RELAY')
    expect(container.textContent).toContain('ORACLE')
    expect(container.textContent).toContain('Convoy approaching along the causeway.')
    expect(container.textContent).toContain('车队正沿堤道逼近。')
  })

  it('advances on Space/Enter and closes on final line', () => {
    const onClose = vi.fn()
    const audioPing = vi.fn()
    act(() => {
      root.render(createElement(StoryModal, {
        story: SAMPLE_STORY,
        onClose,
        audioPing,
      }))
    })

    // Advance to line 2
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    })
    expect(container.textContent).toContain('OPERATOR')
    expect(container.textContent).toContain('Holding ground. Initiating hack.')
    expect(container.textContent).toContain('坚守阵地。启动破解。')
    expect(onClose).not.toHaveBeenCalled()

    // Advance past line 2 -> close
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    })
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('advances on key E and closes on final line', () => {
    const onClose = vi.fn()
    const audioPing = vi.fn()
    act(() => {
      root.render(createElement(StoryModal, {
        story: SAMPLE_STORY,
        onClose,
        audioPing,
      }))
    })

    // Advance to line 2 using Key E
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'e', code: 'KeyE', bubbles: true }))
    })
    expect(container.textContent).toContain('OPERATOR')
    expect(container.textContent).toContain('Holding ground. Initiating hack.')
    expect(onClose).not.toHaveBeenCalled()

    // Advance past line 2 -> close
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'E', code: 'KeyE', bubbles: true }))
    })
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('renders black market storefront and handles purchases', () => {
    const onBuyItem = vi.fn()
    act(() => {
      root.render(createElement(StoryModal, {
        story: SAMPLE_MERCHANT_STORY,
        score: 400,
        onClose: vi.fn(),
        onBuyItem,
      }))
    })

    expect(container.textContent).toContain('CONTRABAND SUPPLIES')
    expect(container.textContent).toContain('SCORE: 400 PTS')
    expect(container.textContent).toContain('NANO REPAIR KIT')
    expect(container.textContent).toContain('OVERCLOCK TRIGGER')

    const buyButtons = container.querySelectorAll('button')
    const nanoButton = Array.from(buyButtons).find((b) => b.textContent?.includes('BUY') && !b.disabled)
    expect(nanoButton).toBeDefined()
    act(() => {
      nanoButton?.click()
    })
    expect(onBuyItem).toHaveBeenCalledWith(expect.objectContaining({ id: 'item-nano-repair' }))

    // Overclock trigger costs 500 but score is 400 -> button must be disabled
    const disabledButton = Array.from(buyButtons).find((b) => b.disabled)
    expect(disabledButton).toBeDefined()
  })

  it('closes immediately on Escape key', () => {
    const onClose = vi.fn()
    act(() => {
      root.render(createElement(StoryModal, {
        story: SAMPLE_STORY,
        onClose,
      }))
    })
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    })
    expect(onClose).toHaveBeenCalledOnce()
  })
})
