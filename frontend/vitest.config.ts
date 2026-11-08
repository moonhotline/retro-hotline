import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [react()],
  resolve: {
    dedupe: ['react', 'react-dom', 'react-is'],
  },
  test: {
    name: 'frontend',
    pool: 'threads',
    execArgv: ["--permission","--allow-fs-read=frontend","--allow-fs-read=backend","--allow-fs-read=node_modules","--allow-fs-read=vitest.config.mjs","--allow-fs-read=package.json","--allow-fs-read=pnpm-workspace.yaml","--allow-fs-read=public","--allow-fs-read=/Users/alexander/develop"],
    maxWorkers: 1,
    includeTaskLocation: true,
    globals: false,
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    include: ['**/*.{test,spec}.{js,mjs,cjs,ts,jsx,tsx}'],
  },
})
