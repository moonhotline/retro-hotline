import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'
import '@testing-library/jest-dom/vitest'

const store = new Map<string, string>()
Storage.prototype.getItem = function (k: string) { return store.get(k) ?? null }
Storage.prototype.setItem = function (k: string, v: string) { store.set(k, String(v)) }
Storage.prototype.removeItem = function (k: string) { store.delete(k) }
Storage.prototype.clear = function () { store.clear() }
Object.defineProperty(Storage.prototype, 'length', {
  configurable: true,
  get() { return store.size },
})
Storage.prototype.key = function (i: number) { return Array.from(store.keys())[i] ?? null }

const mockStorage = Object.create(Storage.prototype)
if (typeof window !== 'undefined') {
  Object.defineProperty(window, 'localStorage', { configurable: true, writable: true, value: mockStorage })
}
try {
  globalThis.localStorage = mockStorage
} catch {}

declare module 'vitest' {
  interface TaskMeta {
    description?: string
  }
}

afterEach(cleanup)
