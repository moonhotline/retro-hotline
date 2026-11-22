import { useEffect, useRef, useState } from 'react'
import { Game } from './game/Game'
import { WorldSession, readSave } from './game/world/session'
import { SceneEditor } from './editor/SceneEditor'
import { Home } from './home/Home'
import { concepts } from './lab/catalog'
import type { Display, LabOptions, createRuntime } from './lab/runtime'

const initial: LabOptions = { dev: false, display: 'editor', volume: true, scan: true, roughness: 0.24 }

function textField(target: EventTarget | null) {
  return target instanceof HTMLElement &&
    (target.matches('input:not([type=checkbox]), textarea, select') || target.isContentEditable)
}

export default function App() {
  const [options, setOptions] = useState(initial)
  const [home, setHome] = useState(true)
  const [session, setSession] = useState<WorldSession | null>(null)
  const [run, setRun] = useState(0)
  const [motionPaused, setMotionPaused] = useState(false)
  const [force, setForce] = useState(() => new URLSearchParams(location.search).get('renderer') === 'webgl2')
  const [backend, setBackend] = useState<string | null>(null)
  const [triangles, setTriangles] = useState<number | null>(null)
  const [compare, setCompare] = useState(false)
  const [error, setError] = useState('')
  const host = useRef<HTMLDivElement>(null)
  const runtime = useRef<ReturnType<typeof createRuntime> | null>(null)
  const currentOptions = useRef(options)
  const showHome = home && !options.dev
  const showEditor = options.dev && options.display === 'editor'

  useEffect(() => {
    currentOptions.current = options
    void runtime.current?.setOptions(options)
  }, [options])

  useEffect(() => {
    const mount = host.current
    if (!mount) return
    let cancelled = false
    let engine: ReturnType<typeof createRuntime> | undefined
    setBackend(null)
    setTriangles(null)
    setError('')
    void import('./lab/runtime').then(async ({ createRuntime }) => {
      if (cancelled) return
      engine = createRuntime(mount, force, setTriangles, setError)
      runtime.current = engine
      const activeBackend = await engine.ready
      if (cancelled) return
      setBackend(activeBackend)
      await engine.setOptions(currentOptions.current)
    }).catch((cause: unknown) => {
      if (!cancelled) setError(cause instanceof Error ? cause.message : String(cause))
    })
    return () => {
      cancelled = true
      runtime.current = null
      engine?.dispose()
    }
  }, [force, options.dev, showEditor])

  useEffect(() => {
    function handleKey(event: KeyboardEvent) {
      if (event.code !== 'KeyP' || event.repeat || event.isComposing ||
        event.ctrlKey || event.altKey || event.metaKey || textField(event.target)) return
      setOptions(value => ({ ...value, dev: !value.dev }))
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [])

  function update(change: Partial<LabOptions>) {
    setOptions(value => ({ ...value, ...change }))
  }

  if (showHome) {
    return <Home
      onEnterGame={() => {
        setSession(current => current ?? new WorldSession(readSave()))
        setHome(false)
      }}
      onEnterLab={() => update({ dev: true })}
      motionPaused={motionPaused}
      onToggleMotion={() => setMotionPaused(value => !value)}
    />
  }

  if (!options.dev && session) return <Game key={run} session={session} force={force} volume={options.volume}
    onHome={() => setHome(true)} onLab={() => update({ dev: true })} onRestart={() => {
      const next = new WorldSession(null)
      next.save()
      setSession(next)
      setRun(value => value + 1)
    }} />

  const concept = concepts.find(item => item.id === options.display)
  const dark = options.dev && Boolean(concept)
  const comparison = dark && compare && concept
  const displayPicker = <label className="field">预览
    <select value={options.display} onChange={event => {
      setError('')
      update({ display: event.target.value as Display })
    }}>
      <option value="editor">场景编辑器</option>
      <option value="blank">空白空间</option>
      <option value="materials">光照与材质</option>
      <optgroup label="概念模型">
        {concepts.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
      </optgroup>
    </select>
  </label>

  return (
    <main className={`workspace${dark ? ' workspace--dark' : ''}${showEditor ? ' workspace--editor' : options.dev ? ' workspace--dev' : ''}`}>
      <header className="topbar">
        <button className="wordmark wordmark--home" type="button" aria-label="返回首页" onClick={() => {
          setHome(true)
          update({ dev: false })
        }}><span className="mark" aria-hidden="true" />RETRO HOTLINE</button>
        <button className="space-toggle" aria-keyshortcuts="P" onClick={() => update({ dev: !options.dev })}>
          {options.dev ? (home ? '返回首页' : '返回主游戏') : '进入 Dev Lab'} <kbd>P</kbd>
        </button>
      </header>

      {showEditor ? <SceneEditor force={force} onForce={setForce} displayPicker={displayPicker} /> :
      <section className={`stage${comparison ? ' stage--compare' : ''}`} aria-label={options.dev ? 'Dev Lab' : '主游戏空间'}>
        <div ref={host} className="viewport" />
        {comparison && (
          <figure className="reference">
            <img src={`/concepts/${concept.reference}.webp`} alt={`${concept.name}概念图`} />
            <figcaption>概念图</figcaption>
          </figure>
        )}
        {error && <p className="render-error" role="alert">渲染失败 · {error}</p>}
      </section>}

      {options.dev && !showEditor && (
        <aside className="inspector" aria-label="调试面板">
          <div className="inspector-heading">
            <h1>Dev Lab</h1>
            <output className="backend">{backend ?? '初始化中'}</output>
          </div>
          {displayPicker}

          {options.display === 'materials' && (
            <div className="controls">
              <label className="toggle"><span>GLSL 体积光</span><input type="checkbox" checked={options.volume}
                onChange={event => update({ volume: event.target.checked })} /></label>
              <label className="field">
                <span>圆环粗糙度 <output>{options.roughness.toFixed(2)}</output></span>
                <input type="range" min="0.04" max="0.98" step="0.01" value={options.roughness}
                  onChange={event => update({ roughness: Number(event.target.value) })} />
              </label>
              <label className="toggle"><span>TSL 扫描纹</span><input type="checkbox" checked={options.scan}
                onChange={event => update({ scan: event.target.checked })} /></label>
            </div>
          )}

          {concept && (
            <div className="controls">
              <div className="metric"><span>模型三角面</span><output>{triangles?.toLocaleString('zh-CN') ?? '加载中'}</output></div>
              {concept.id === 'docks' && (
                <label className="toggle"><span>GLSL 体积光</span><input type="checkbox" checked={options.volume}
                  onChange={event => update({ volume: event.target.checked })} /></label>
              )}
              <label className="toggle"><span>对照概念图</span><input type="checkbox" checked={compare}
                onChange={event => {
                  if (event.target.checked) runtime.current?.resetCamera()
                  setCompare(event.target.checked)
                }} /></label>
              {(concept.id === 'craw' || concept.id === 'bug') && (
                <button className="action" disabled={triangles === null} onClick={() => runtime.current?.playRupture()}>
                  预览核心破裂
                </button>
              )}
              <p className="orbit-hint">拖动旋转 · 滚动缩放</p>
            </div>
          )}

          <label className="toggle"><span>强制 WebGL2</span><input type="checkbox" checked={force}
            onChange={event => setForce(event.target.checked)} /></label>
        </aside>
      )}
    </main>
  )
}
