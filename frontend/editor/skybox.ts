import { CanvasTexture, EquirectangularReflectionMapping, SRGBColorSpace } from 'three/webgpu'
import { readAsset } from './assetStore'
import type { Sky } from './document'

function paintedSky(night: boolean) {
  const canvas = document.createElement('canvas')
  canvas.width = 1024
  canvas.height = 512
  const context = canvas.getContext('2d')!
  const gradient = context.createLinearGradient(0, 0, 0, canvas.height)
  for (const [height, color] of (night
    ? [[0, '#111830'], [0.37, '#243759'], [0.52, '#476586'], [0.72, '#27344a'], [1, '#182137']]
    : [[0, '#357ab7'], [0.38, '#82b6dc'], [0.52, '#d8e8ef'], [0.74, '#b8c9d5'], [1, '#9cabb7']]) as [number, string][]) {
    gradient.addColorStop(height, color)
  }
  context.fillStyle = gradient
  context.fillRect(0, 0, canvas.width, canvas.height)
  if (night) {
    for (let i = 1; i <= 370; i++) {
      const x = (i * 397.79) % 1024
      const y = (i * i * 53.75) % 227
      context.fillStyle = `rgba(222,239,255,${0.16 + (i % 10) * 0.055})`
      context.fillRect(x, y, i % 19 === 0 ? 2 : 1, i % 19 === 0 ? 2 : 1)
    }
  }
  return canvas
}

export async function loadSkyTexture(sky: Sky, signal: AbortSignal) {
  if (sky.kind === 'white') return null
  let canvas: HTMLCanvasElement
  if (sky.kind === 'image') {
    const file = await readAsset(sky.id)
    signal.throwIfAborted()
    const bitmap = await createImageBitmap(file)
    try {
      signal.throwIfAborted()
      if (Math.abs(bitmap.width / bitmap.height - 2) > 0.06) throw new Error('天空盒图片需要是 2:1 的全景图。')
      canvas = document.createElement('canvas')
      canvas.width = Math.min(bitmap.width, 4096)
      canvas.height = Math.round(canvas.width / 2)
      canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    } finally {
      bitmap.close()
    }
  } else {
    canvas = paintedSky(sky.kind === 'night')
  }
  const texture = new CanvasTexture(canvas, EquirectangularReflectionMapping)
  texture.colorSpace = SRGBColorSpace
  return texture
}
