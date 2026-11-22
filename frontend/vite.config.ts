import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    include: ['three/addons/loaders/GLTFLoader.js'],
  },
  resolve: {
    alias: [{ find: /^three$/, replacement: 'three/webgpu' }],
    dedupe: ['react', 'react-dom', 'react-is'],
  },
})
