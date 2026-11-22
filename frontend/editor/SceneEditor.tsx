import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createObject, loadScene, objectLabels, saveScene, type ObjectKind, type SceneObject, type Transform, type XYZ } from './document'
import type { createViewport, TransformMode } from './viewport'
import './editor.css'

type IconName = ObjectKind | 'move' | 'rotate' | 'scale' | 'frame' | 'reset' | 'plus' | 'copy' | 'trash'
const paths: Record<IconName, string> = {
  camera: 'M2.5 5.5h10v9h-10zM12.5 8.5l5-3v9l-5-3',
  directional: 'M10 6.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7zM10 1.5v2m0 13v2m8.5-8.5h-2m-13 0h-2M16 4l-1.5 1.5m-9 9L4 16m12 0-1.5-1.5m-9-9L4 4',
  point: 'M6.8 13a5 5 0 1 1 6.4 0L12 15.5H8L6.8 13zm1.2 5h4m-2-2.5v-4',
  sphere: 'M10 2.5a7.5 7.5 0 1 0 0 15 7.5 7.5 0 0 0 0-15zM2.5 10h15M10 2.5c3.7 4.2 3.7 10.8 0 15-3.7-4.2-3.7-10.8 0-15z',
  move: 'M10 2v16M2 10h16M7.5 4.5 10 2l2.5 2.5m-5 11L10 18l2.5-2.5m-8-8L2 10l2.5 2.5m11-5L18 10l-2.5 2.5',
  rotate: 'M16 6.5a7 7 0 1 0 1 6M16 2.5V7h-4.5',
  scale: 'M8 3H3v5m9-5h5v5m-5 9h5v-5m-9 5H3v-5m4 1 6-6',
  frame: 'M7 3H3v4m10-4h4v4m0 6v4h-4M3 13v4h4m3-8.5v3m-1.5-1.5h3',
  reset: 'M4 9.5 10 4l6 5.5V17H4zM8 17v-5h4v5',
  plus: 'M10 4v12M4 10h12',
  copy: 'M6.5 6.5h10v10h-10zM13 3.5H3.5V13',
  trash: 'M3.5 5h13M7.5 5V3h5v2M5.5 5l.8 12h7.4l.8-12M8 8v6m4-6v6',
}
const modes = [
  { value: 'translate', icon: 'move', label: '移动' },
  { value: 'rotate', icon: 'rotate', label: '旋转' },
  { value: 'scale', icon: 'scale', label: '缩放' },
] as const
const transformRows = [
  ['position', '位置', 0.1],
  ['rotation', '旋转', 1],
  ['scale', '缩放', 0.1],
] as const
const axes = ['X', 'Y', 'Z'] as const

function Icon({ name }: { name: IconName }) {
  return <svg aria-hidden="true" width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor"
    strokeWidth="1.45" strokeLinecap="round" strokeLinejoin="round"><path d={paths[name]} /></svg>
}

function Numeric({ label, value, step, min, max, onChange }: {
  label: string
  value: number
  step: number
  min?: number
  max?: number
  onChange: (value: number) => void
}) {
  const [draft, setDraft] = useState<string | null>(null)
  return <input type="number" aria-label={label} step={step} min={min} max={max}
    value={draft ?? Number(value.toFixed(3))}
    onChange={event => setDraft(event.target.value)}
    onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur() }}
    onBlur={event => {
      const next = event.currentTarget.valueAsNumber
      if (draft !== null && Number.isFinite(next)) onChange(Math.min(max ?? Infinity, Math.max(min ?? -Infinity, next)))
      setDraft(null)
    }} />
}

function Properties({ object, update, remove }: {
  object: SceneObject
  update: (patch: Partial<SceneObject>) => void
  remove: () => void
}) {
  const [copied, setCopied] = useState(false)
  return <>
    <div className="editor-object-fields">
      <label className="editor-detail-field">名称
        <input value={object.name} maxLength={64} onChange={event => update({ name: event.target.value })} />
      </label>
      <div className="editor-detail-field">
        <label htmlFor="editor-object-id">对象 ID</label>
        <div className="editor-id">
          <input id="editor-object-id" readOnly value={object.id} onFocus={event => event.target.select()} />
          <button type="button" title="复制 ID" aria-label="复制 ID" onClick={async () => {
            try {
              await navigator.clipboard.writeText(object.id)
              setCopied(true)
            } catch {
              const input = document.querySelector<HTMLInputElement>('#editor-object-id')
              input?.focus()
              input?.select()
            }
          }}><Icon name="copy" /></button>
        </div>
        {copied && <span role="status" className="editor-copy-status">已复制</span>}
      </div>
    </div>
    <section className="editor-detail-section" aria-label="变换坐标">
      <h3>变换 <small>世界坐标</small></h3>
      {transformRows.map(([field, title, step]) => <div className="editor-vector" key={field}>
        <div className="editor-vector-label">{title}<small>{field === 'position' ? 'm' : field === 'rotation' ? '°' : '×'}</small></div>
        <div className="editor-axes-inputs">
          {axes.map((axis, index) => <label key={axis} data-axis={axis}>
            <span>{axis}</span>
            <Numeric label={title + ' ' + axis} value={object[field][index]!} step={step}
              min={field === 'scale' ? 0.01 : undefined} onChange={value => {
                const vector: XYZ = [...object[field]]
                vector[index] = value
                update({ [field]: vector })
              }} />
          </label>)}
        </div>
      </div>)}
    </section>
    {object.kind === 'camera' && <section className="editor-detail-section">
      <h3>相机</h3>
      <label className="editor-detail-line">垂直视场角
        <Numeric label="垂直视场角" value={object.fov} step={1} min={10} max={120} onChange={fov => update({ fov })} />
      </label>
    </section>}
    {(object.kind === 'directional' || object.kind === 'point') && <section className="editor-detail-section">
      <h3>光照</h3>
      <label className="editor-detail-line">颜色
        <input type="color" value={object.color} onChange={event => update({ color: event.target.value })} />
      </label>
      <label className="editor-detail-line">强度
        <Numeric label="强度" min={0} value={object.intensity} step={0.1} onChange={intensity => update({ intensity })} />
      </label>
    </section>}
    <section className="editor-detail-section">
      <button className="editor-remove" type="button" onClick={remove}><Icon name="trash" />删除对象</button>
    </section>
  </>
}

export function SceneEditor({ force, onForce, displayPicker }: {
  force: boolean
  onForce: (force: boolean) => void
  displayPicker: ReactNode
}) {
  const [objects, setObjects] = useState(loadScene)
  const [selected, setSelected] = useState<string | null>(() => objects.find(item => item.kind === 'camera')?.id ?? objects[0]?.id ?? null)
  const [mode, setMode] = useState<TransformMode>('translate')
  const [preview, setPreview] = useState<string | null>(null)
  const [backend, setBackend] = useState('')
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(true)
  const mount = useRef<HTMLDivElement>(null)
  const compass = useRef<SVGSVGElement>(null)
  const engine = useRef<ReturnType<typeof createViewport> | null>(null)
  const object = objects.find(item => item.id === selected)
  const snapshot = useRef({ objects, selected, mode, preview })

  useEffect(() => {
    snapshot.current = { objects, selected, mode, preview }
    engine.current?.update(objects, selected, mode, preview)
  }, [objects, selected, mode, preview])

  useEffect(() => { setSaved(saveScene(objects)) }, [objects])

  useEffect(() => {
    const host = mount.current
    const orientation = compass.current
    if (!host || !orientation) return
    let cancelled = false
    let viewport: ReturnType<typeof createViewport> | undefined
    setBackend('')
    setError('')
    function reportError(cause: unknown) {
      if (!cancelled) setError(cause instanceof Error ? cause.message : String(cause))
    }
    void import('./viewport').then(async ({ createViewport }) => {
      if (cancelled) return
      viewport = createViewport(host, orientation, force, {
        select: setSelected,
        transform(id: string, transform: Transform) {
          setObjects(items => items.map(item => item.id === id ? { ...item, ...transform } : item))
        },
        error: reportError,
      })
      engine.current = viewport
      const activeBackend = await viewport.ready
      if (cancelled || !activeBackend) return
      setBackend(activeBackend)
      const current = snapshot.current
      viewport.update(current.objects, current.selected, current.mode, current.preview)
    }).catch(reportError)
    return () => {
      cancelled = true
      engine.current = null
      viewport?.dispose()
    }
  }, [force])

  function select(id: string | null) {
    setPreview(null)
    setSelected(id)
  }

  function add(kind: ObjectKind) {
    const base = objectLabels[kind]
    let name = base
    for (let number = 2; objects.some(item => item.name === name); number++) name = base + ' ' + number
    const next = createObject(kind, name)
    setObjects(items => [...items, next])
    select(next.id)
  }

  return <div className="scene-editor">
    <aside className="editor-outliner" aria-label="场景对象">
      <div className="editor-panel-head">
        <h2>场景对象</h2>
        <output className="editor-count">{objects.length}</output>
      </div>
      <div className="editor-object-list">
        {objects.map(item => <button type="button" key={item.id} onClick={() => select(item.id)}
          onDoubleClick={() => engine.current?.frameSelection()} aria-pressed={selected === item.id}
          data-kind={item.kind}><Icon name={item.kind} /><span>{item.name || objectLabels[item.kind]}</span></button>)}
        {!objects.length && <p>从上方的「添加」放入场景对象。</p>}
      </div>
      <div className="editor-lab-tools">
        <h2>Dev Lab</h2>
        {displayPicker}
        <label className="toggle"><span>强制 WebGL2</span><input type="checkbox" checked={force}
          onChange={event => onForce(event.target.checked)} /></label>
      </div>
    </aside>

    <section className="editor-center" aria-label="场景编辑器">
      <div className="editor-toolbar">
        <div className="editor-add">
          <Icon name="plus" />
          <select aria-label="添加场景对象" value="" onChange={event => { if (event.target.value) add(event.target.value as ObjectKind) }}>
            <option value="" disabled>添加</option>
            {(Object.keys(objectLabels) as ObjectKind[]).map(kind => <option value={kind} key={kind}>{objectLabels[kind]}</option>)}
          </select>
        </div>
        <div className="editor-toolgroup" role="group" aria-label="变换工具">
          {modes.map(item => <button type="button" key={item.value} aria-pressed={mode === item.value} disabled={!object || !!preview}
            onClick={() => setMode(item.value)} aria-label={item.label} title={item.label}><Icon name={item.icon} /><span>{item.label}</span></button>)}
        </div>
        <div className="editor-toolgroup editor-navigation" role="group" aria-label="视口操作">
          <button type="button" title="聚焦选中对象" aria-label="聚焦选中对象" disabled={!object || !!preview}
            onClick={() => engine.current?.frameSelection()}><Icon name="frame" /></button>
          <button type="button" title="重置编辑视角" aria-label="重置编辑视角" disabled={!!preview}
            onClick={() => engine.current?.resetView()}><Icon name="reset" /></button>
          {(object?.kind === 'camera' || preview) && <button type="button" aria-pressed={!!preview}
            aria-label={preview ? '退出相机' : '预览相机'} title={preview ? '退出相机' : '预览相机'}
            onClick={() => setPreview(preview ? null : object?.id ?? null)}><Icon name="camera" />
            <span>{preview ? '退出相机' : '预览相机'}</span></button>}
        </div>
      </div>
      <div className="editor-view">
        <div className="editor-canvas" ref={mount} />
        <div className="editor-view-label">{preview ? (object?.name || '相机预览') : '透视 · 世界坐标'}</div>
        <svg className="editor-compass" ref={compass} viewBox="0 0 88 88" role="img"
          aria-label="世界坐标轴 X、Y、Z" aria-hidden={!!preview}>
          <circle cx="44" cy="44" r="38" fill="#fff" fillOpacity=".77" stroke="#dae2e9" />
          {axes.map((axis, i) => <g data-axis={axis} key={axis}>
            <line x1="44" y1="44" x2={44 + (i === 0 ? 21 : i === 2 ? -21 : 0)} y2={i === 1 ? 19 : 55} />
            <text x={44 + (i === 0 ? 29 : i === 2 ? -29 : 0)} y={i === 1 ? 12 : 61}>{axis}</text>
          </g>)}
          <circle cx="44" cy="44" r="2.2" fill="#546776" />
        </svg>
        {!preview && <>
          <div className="editor-view-hint editor-view-hint--mouse">左拖旋转 <span>·</span> 右拖平移 <span>·</span> 滚轮缩放</div>
          <div className="editor-view-hint editor-view-hint--touch">单指旋转 <span>·</span> 双指平移和缩放</div>
        </>}
        {error && <p className="render-error" role="alert">渲染失败 · {error}</p>}
      </div>
      <footer className="editor-status">
        <span><i />{backend || (error ? '渲染失败' : '正在初始化')}</span>
        {!preview && <span>网格 1 m</span>}
        <span className="editor-save">{saved ? '已保存在此浏览器' : '浏览器存储不可用'}</span>
      </footer>
    </section>

    <aside className="editor-properties" aria-label="对象属性">
      <div className="editor-panel-head">
        <h2>对象属性</h2>
        {object && <span className="editor-kind"><Icon name={object.kind} />{objectLabels[object.kind]}</span>}
      </div>
      {object ? <Properties key={object.id} object={object} update={patch => {
        setObjects(items => items.map(item => item.id === object.id ? { ...item, ...patch } as SceneObject : item))
      }} remove={() => {
        setObjects(items => items.filter(item => item.id !== object.id))
        select(null)
      }} /> : <p className="editor-empty">选中场景对象以编辑坐标和属性。</p>}
    </aside>
  </div>
}
