import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { HackTerminal } from '../components/HackTerminal'
import { NEON_HACKS } from './combat/modifiers'

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
function render(count = 3) {
  const onSelect = vi.fn()
  const audio = { gloryPing: vi.fn() }
  act(() => root.render(createElement(HackTerminal, { hacks: NEON_HACKS.slice(0, count), wave: 2, onSelect, audio })))
  return { onSelect, audio, cards: [...container.querySelectorAll('button')] }
}
function key(value: string, options: KeyboardEventInit = {}) {
  act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: value, bubbles: true, cancelable: true, ...options })) })
}

describe('HackTerminal input', () => {
  it('renders nothing and does not capture keys when there are no cards', () => {
    render(0)
    const gameplay = vi.fn()
    window.addEventListener('keydown', gameplay)
    key('w')
    expect(container.childElementCount).toBe(0)
    expect(gameplay).toHaveBeenCalledOnce()
    window.removeEventListener('keydown', gameplay)
  })
  it('shows names, tiers, taglines and descriptions and gives focus to the first card', () => {
    const { cards } = render()
    expect(container.querySelector('[role="dialog"]')?.getAttribute('aria-modal')).toBe('true')
    expect(cards).toHaveLength(3)
    expect(document.activeElement).toBe(cards[0])
    for (const hack of NEON_HACKS.slice(0, 3)) {
      expect(container.textContent).toContain(hack.name.split(' // ')[0])
      expect(container.textContent).toContain(hack.tier)
      expect(container.textContent).toContain(hack.tagline)
      expect(container.textContent).toContain(hack.description)
    }
  })

  it.each(['1', '2', '3'])('focuses card %s with its number and installs once with Enter', (number) => {
    const { onSelect, audio, cards } = render()
    key(number)
    expect(document.activeElement).toBe(cards[Number(number) - 1])
    expect(audio.gloryPing).toHaveBeenCalledOnce()
    expect(onSelect).not.toHaveBeenCalled()
    key('Enter')
    key('Enter', { repeat: true })
    key('Enter')
    expect(onSelect).toHaveBeenCalledExactlyOnceWith(NEON_HACKS[Number(number) - 1]!.id)
  })

  it('installs by clicking a card without bubbling into gameplay', () => {
    const { onSelect, cards } = render()
    const click = vi.fn()
    document.addEventListener('click', click)
    act(() => cards[2]!.click())
    expect(onSelect).toHaveBeenCalledExactlyOnceWith(NEON_HACKS[2]!.id)
    expect(click).not.toHaveBeenCalled()
    document.removeEventListener('click', click)
  })

  it('traps Tab in the draft and blocks Escape, gameplay input and repeated number keys', () => {
    const { onSelect, audio, cards } = render()
    const gameplay = vi.fn()
    window.addEventListener('keydown', gameplay)
    key('Tab', { shiftKey: true })
    expect(document.activeElement).toBe(cards[2])
    key('Tab')
    expect(document.activeElement).toBe(cards[0])
    key('Escape')
    key('w')
    key('2', { repeat: true })
    expect(document.activeElement).toBe(cards[0])
    expect(audio.gloryPing).not.toHaveBeenCalled()
    expect(gameplay).not.toHaveBeenCalled()
    expect(onSelect).not.toHaveBeenCalled()
    window.removeEventListener('keydown', gameplay)
  })

  it('supports a one-card fallback and ignores nonexistent numbered slots', () => {
    const { onSelect, audio, cards } = render(1)
    key('3')
    key('Tab')
    expect(audio.gloryPing).not.toHaveBeenCalled()
    expect(document.activeElement).toBe(cards[0])
    key('Enter')
    expect(onSelect).toHaveBeenCalledExactlyOnceWith(NEON_HACKS[0]!.id)
  })

  it('removes its listener and restores focus when unmounted', () => {
    const previous = document.createElement('button')
    document.body.appendChild(previous)
    previous.focus()
    const { onSelect } = render()
    act(() => root.render(null))
    expect(document.activeElement).toBe(previous)
    key('Enter')
    expect(onSelect).not.toHaveBeenCalled()
    previous.remove()
  })
})
