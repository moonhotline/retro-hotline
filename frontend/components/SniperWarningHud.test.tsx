import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { expect, it, vi } from 'vitest'
import { SniperWarningHud } from './SniperWarningHud'

it('shows directional charge without relying on color and exposes the F action and redirect confirmation', () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  const container = document.createElement('div')
  const root = createRoot(container)
  const warning = { id: 'sniper', bearing: Math.PI / 2, progress: 0.8, urgent: true, redirected: false }
  try {
    act(() => root.render(createElement(SniperWarningHud, { state: { warnings: [warning], status: 'ready', cooldown: 0 } })))
    const indicator = container.querySelector('[role="progressbar"]') as HTMLElement
    expect(indicator.getAttribute('aria-valuenow')).toBe('80')
    expect(indicator.style.left).toBe('93%')
    expect(container.textContent).toContain('FIRE')
    expect(container.textContent).toContain('[F] HACK / 劫持')
    act(() => root.render(createElement(SniperWarningHud, { state: { warnings: [{ ...warning, redirected: true }], status: 'redirected', cooldown: 6 } })))
    expect(container.textContent).toContain('已转向')
    expect(container.querySelector('[data-redirected="true"]')).not.toBeNull()
    act(() => root.render(createElement(SniperWarningHud, { state: { warnings: [], status: 'none', cooldown: 0 } })))
    expect(container.childElementCount).toBe(0)
  } finally {
    act(() => root.unmount())
    vi.unstubAllGlobals()
  }
})
