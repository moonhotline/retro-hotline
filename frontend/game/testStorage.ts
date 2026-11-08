import { vi } from 'vitest'

/** Use jsdom's real origin-scoped Storage, avoiding Node 25's global Storage shim. */
export function installTestStorage() {
  const frame = document.createElement('iframe')
  document.body.appendChild(frame)
  const storage = frame.contentWindow!.localStorage
  frame.remove()
  storage.clear()
  vi.stubGlobal('localStorage', storage)
}
