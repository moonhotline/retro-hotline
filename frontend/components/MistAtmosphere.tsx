import { useEffect, useRef } from 'react'
import './MistAtmosphere.css'

/** Shared, silent atmosphere. Canvas is capped at 30 fps and 1.25x DPR. */
export function MistAtmosphere() {
  const hostRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const host = hostRef.current
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d', { alpha: true })
    if (!host || !canvas || !ctx) return
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)')
    let reduced = motion.matches
    let width = 1
    let height = 1
    let frame = 0
    let previous = 0
    let elapsed = 18
    let visible = true
    let pointerX = 0
    let pointerY = 0
    let driftX = 0
    let driftY = 0

    const draw = () => {
      ctx.clearRect(0, 0, width, height)
      driftX += (pointerX - driftX) * 0.035
      driftY += (pointerY - driftY) * 0.035
      ctx.save()
      ctx.translate(reduced ? 0 : driftX, reduced ? 0 : driftY)
      ctx.globalCompositeOperation = 'screen'

      const prismX = width * 0.72
      const prismY = height * (0.49 + Math.sin(elapsed * 0.11) * 0.018)
      const prismSize = Math.min(width * 0.17, height * 0.23, 180)
      const facets = [
        [prismX, prismY - prismSize],
        [prismX - prismSize * 0.72, prismY + prismSize * 0.55],
        [prismX + prismSize * 0.83, prismY + prismSize * 0.35],
      ]
      const prismPath = () => {
        ctx.beginPath()
        facets.forEach(([x, y], i) => i ? ctx.lineTo(x!, y!) : ctx.moveTo(x!, y!))
        ctx.closePath()
      }
      const glass = ctx.createLinearGradient(prismX - prismSize, prismY - prismSize, prismX + prismSize, prismY + prismSize)
      glass.addColorStop(0, 'rgba(165, 225, 255, 0.015)')
      glass.addColorStop(0.48, 'rgba(188, 224, 245, 0.085)')
      glass.addColorStop(0.52, 'rgba(213, 168, 237, 0.035)')
      glass.addColorStop(1, 'rgba(120, 175, 231, 0.005)')
      prismPath()
      ctx.fillStyle = glass
      ctx.fill()
      ctx.lineWidth = 0.9
      ctx.strokeStyle = 'rgba(173, 221, 243, 0.35)'
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(prismX, prismY - prismSize)
      ctx.lineTo(prismX + prismSize * 0.1, prismY + prismSize * 0.12)
      ctx.lineTo(prismX - prismSize * 0.72, prismY + prismSize * 0.55)
      ctx.moveTo(prismX + prismSize * 0.1, prismY + prismSize * 0.12)
      ctx.lineTo(prismX + prismSize * 0.83, prismY + prismSize * 0.35)
      ctx.strokeStyle = 'rgba(189, 219, 240, 0.17)'
      ctx.stroke()

      // A folded membrane: threads bend together, then separate at the crest.
      // Different depth planes share the curve instead of moving as random lines.
      for (let layer = 0; layer < 3; layer++) {
        const gradient = ctx.createLinearGradient(width * 0.12, height, width, height * 0.1)
        gradient.addColorStop(0, 'rgba(70, 121, 171, 0)')
        gradient.addColorStop(0.35, `rgba(85, 172, 203, ${layer === 1 ? 0.17 : 0.07})`)
        gradient.addColorStop(0.72, `rgba(171, 220, 233, ${layer === 1 ? 0.38 : 0.14})`)
        gradient.addColorStop(1, 'rgba(202, 141, 182, 0.05)')
        ctx.strokeStyle = gradient
        for (let strand = 0; strand < 28; strand++) {
          const band = strand / 27 - 0.5
          ctx.beginPath()
          for (let point = 0; point <= 88; point++) {
            const u = point / 88
            const phase = u * 5.2 - elapsed * 0.055 + layer * 0.45
            const fold = Math.sin(phase) * 0.17 + Math.sin(u * 9.4 + elapsed * 0.04) * 0.045
            const spread = 0.035 + 0.17 * Math.sin(u * Math.PI) ** 2
            const x = width * (-0.15 + u * 1.35)
            const y = height * (0.53 + fold + band * spread + layer * 0.055)
            if (point === 0) ctx.moveTo(x, y)
            else ctx.lineTo(x, y)
          }
          ctx.lineWidth = strand % 9 === 0 ? 1.1 : 0.5
          ctx.stroke()
        }
      }

      // The same incident ribbon separates into wavelength bands at the prism.
      const spectrum = [
        [255, 116, 154], [255, 174, 112], [244, 218, 151],
        [125, 232, 198], [113, 209, 255], [153, 151, 255], [216, 142, 242],
      ]
      for (let color = 0; color < spectrum.length; color++) {
        const [r, g, b] = spectrum[color]!
        const beam = ctx.createLinearGradient(prismX - prismSize * 0.2, prismY, width * 1.08, prismY)
        beam.addColorStop(0, `rgba(${r}, ${g}, ${b}, 0)`)
        beam.addColorStop(0.16, `rgba(${r}, ${g}, ${b}, 0.14)`)
        beam.addColorStop(0.5, `rgba(${r}, ${g}, ${b}, 0.46)`)
        beam.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`)
        ctx.strokeStyle = beam
        for (let thread = 0; thread < 5; thread++) {
          ctx.beginPath()
          for (let step = 0; step <= 64; step++) {
            const u = step / 64
            const x = prismX - prismSize * 0.2 + u * (width * 1.15 - prismX)
            const separation = (color - 3) * (0.012 + u * u * 0.065) * height
            const bend = Math.sin(u * 3.2 + elapsed * 0.13) * height * 0.045 * u
            const y = prismY + prismSize * 0.13 + separation + bend + (thread - 2) * (1 + u * 3)
            if (!step) ctx.moveTo(x, y)
            else ctx.lineTo(x, y)
          }
          ctx.lineWidth = thread === 2 ? 1.5 : 0.55
          ctx.stroke()
        }
      }

      // Sparse dust has depth and drift; it never imitates a music visualizer.
      for (let i = 0; i < 38; i++) {
        const depth = 0.3 + ((i * 17) % 31) / 44
        const x = ((i * 0.618034 + elapsed * 0.0015 * depth) % 1) * width
        const y = ((i * 0.381966 - elapsed * 0.002 * depth) % 1 + 1) % 1 * height
        const alpha = (0.1 + 0.16 * (Math.sin(elapsed * 0.22 + i) + 1)) * depth
        ctx.fillStyle = `rgba(185, 226, 239, ${alpha})`
        ctx.beginPath()
        ctx.arc(x, y, 0.5 + depth * 0.9, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.restore()
    }

    const tick = (now: number) => {
      if (now - previous >= 1000 / 30) {
        elapsed += previous ? Math.min((now - previous) / 1000, 0.1) : 0
        previous = now
        draw()
      }
      frame = requestAnimationFrame(tick)
    }
    const sync = () => {
      cancelAnimationFrame(frame)
      previous = 0
      reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      const active = visible && !document.hidden && !reduced
      host.dataset.active = String(active)
      if (active) frame = requestAnimationFrame(tick)
      else if (!document.hidden && visible) draw()
    }
    const resize = () => {
      const bounds = host.getBoundingClientRect()
      width = Math.max(1, bounds.width)
      height = Math.max(1, bounds.height)
      const ratio = Math.min(window.devicePixelRatio || 1, 1.25, 1600 / width)
      canvas.width = Math.round(width * ratio)
      canvas.height = Math.round(height * ratio)
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0)
      draw()
    }
    const pointer = (event: PointerEvent) => {
      if (event.pointerType !== 'mouse' || reduced) return
      const bounds = host.getBoundingClientRect()
      pointerX = ((event.clientX - bounds.left) / width - 0.5) * 16
      pointerY = ((event.clientY - bounds.top) / height - 0.5) * 10
    }
    const observer = new ResizeObserver(resize)
    observer.observe(host)
    const intersection = new IntersectionObserver(([entry]) => {
      visible = !!entry?.isIntersecting
      sync()
    })
    intersection.observe(host)
    document.addEventListener('visibilitychange', sync)
    window.addEventListener('pointermove', pointer, { passive: true })
    motion.addEventListener('change', sync)
    // Some embedded browsers update the preference without emitting `change`.
    const preferenceTimer = window.setInterval(() => {
      if (visible && !document.hidden && window.matchMedia('(prefers-reduced-motion: reduce)').matches !== reduced) sync()
    }, 500)
    resize()
    sync()
    return () => {
      cancelAnimationFrame(frame)
      clearInterval(preferenceTimer)
      observer.disconnect()
      intersection.disconnect()
      document.removeEventListener('visibilitychange', sync)
      window.removeEventListener('pointermove', pointer)
      motion.removeEventListener('change', sync)
    }
  }, [])

  return (
    <div ref={hostRef} className="mist-atmosphere" aria-hidden="true">
      <div className="mist-volume mist-volume-cool" />
      <div className="mist-volume mist-volume-warm" />
      <div className="mist-horizon" />
      <canvas ref={canvasRef} />
      <div className="mist-edge" />
    </div>
  )
}
