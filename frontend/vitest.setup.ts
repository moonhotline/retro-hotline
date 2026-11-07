import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'
import '@testing-library/jest-dom/vitest'

declare module 'vitest' {
  interface TaskMeta {
    description?: string
  }
}

afterEach(cleanup)
