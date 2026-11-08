import { useCallback, useEffect, useRef, useState } from 'react'
import { HackTerminal } from '../components/HackTerminal'
import type { HackId } from '../game/combat/modifiers'
import { GameEngine } from '../game/engine'
import type { AbilityStates, HudState, WeaponId } from '../game/types'
import '../game.css'

const INITIAL_HUD: HudState = {
  status: 'menu',
  health: 100,
  ammo: 32,
  mag: 32,
  reloading: false,
  reloadFrac: 0,
  score: 0,
  kills: 0,
  wave: 0,
  alive: 0,
  remaining: 0,
  combo: 0,
  mult: 1,
  comboFrac: 0,
  bestCombo: 0,
  hitMarkerId: 0,
  hitMarkerCrit: false,
  banner: '',
  bannerId: 0,
  popups: [],
  muted: false,
  weapon: 'rifle',
  overchargeFrac: 0,
  slideFrac: 1,
  draftOpen: false,
  draftHacks: [],
  activeHacks: [],
  abilities: {
    phaseDash: { cooldown: 2.5, remaining: 0, fill: 1, ready: true, active: false },
    pulseParry: { cooldown: 3.5, remaining: 0, fill: 1, ready: true, active: false },
    kineticSlam: { cooldown: 5, remaining: 0, fill: 1, ready: true, active: false },
  },
}

const ABILITY_INFO: { id: keyof AbilityStates; key: string; label: string }[] = [
  { id: 'phaseDash', key: 'SHIFT', label: 'DASH' },
  { id: 'pulseParry', key: 'V', label: 'PARRY' },
  { id: 'kineticSlam', key: 'G', label: 'SLAM' },
]

const WEAPON_INFO: Record<WeaponId, string> = {
  rifle: 'PULSE RIFLE',
  deagle: 'DESERT EAGLE',
}

const MULT_COLOR = ['', 'text-white', 'text-[#ffd319]', 'text-[#ff9f1c]', 'text-[#ff2975]', 'text-[#b18cff]']

function Crosshair() {
  const bar = 'absolute bg-[#9ffcff]/90'
  return (
    <div className="absolute left-1/2 top-1/2 h-6 w-6 -translate-x-1/2 -translate-y-1/2">
      <div className={`${bar} left-1/2 top-0 h-2 w-[2px] -translate-x-1/2`} />
      <div className={`${bar} bottom-0 left-1/2 h-2 w-[2px] -translate-x-1/2`} />
      <div className={`${bar} left-0 top-1/2 h-[2px] w-2 -translate-y-1/2`} />
      <div className={`${bar} right-0 top-1/2 h-[2px] w-2 -translate-y-1/2`} />
      <div className="absolute left-1/2 top-1/2 h-[3px] w-[3px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#ff2975]" />
    </div>
  )
}

function HitMarker({ id, crit }: { id: number; crit: boolean }) {
  if (id === 0) return null
  const color = crit ? '#ffd319' : '#ff2975'
  const bar = 'absolute h-[2px] w-3.5'
  return (
    <div key={id} className="hit-marker" style={{ color }}>
      <div className={`${bar} -left-5 -top-5 rotate-45 bg-current`} />
      <div className={`${bar} left-3 -top-5 -rotate-45 bg-current`} />
      <div className={`${bar} -left-5 top-4 -rotate-45 bg-current`} />
      <div className={`${bar} left-3 top-4 rotate-45 bg-current`} />
    </div>
  )
}

function Hud({ hud }: { hud: HudState }) {
  const wave = Math.max(hud.wave, 1)
  return (
    <div className="pointer-events-none absolute inset-0 select-none z-10">
      {/* damage vignette */}
      <div
        className="absolute inset-0 transition-opacity duration-300"
        style={{
          boxShadow: 'inset 0 0 160px rgba(255, 20, 60, 0.85)',
          opacity: Math.max(0, (70 - hud.health) / 70),
        }}
      />

      <Crosshair />
      <HitMarker id={hud.hitMarkerId} crit={hud.hitMarkerCrit} />

      <div className="ability-hud font-tech" aria-label="Cyber abilities">
        {ABILITY_INFO.map(({ id, key, label }) => {
          const ability = hud.abilities[id]
          const state = ability.active ? 'ACTIVE' : ability.ready ? 'READY' : `${ability.remaining.toFixed(1)}s`
          return (
            <div
              key={id}
              className={`ability-pill${ability.ready ? ' ability-ready' : ''}${ability.active ? ' ability-active' : ''}`}
              role="progressbar"
              aria-label={`${label}, ${state}`}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(ability.fill * 100)}
              aria-valuetext={state}
            >
              <span className="ability-fill" style={{ transform: `scaleX(${ability.fill})` }} />
              <span className="ability-label">[{key}] {label}</span>
              <span className="ability-state">{state}</span>
            </div>
          )
        })}
      </div>

      {/* combo + overdrive, under crosshair */}
      <div className="absolute left-1/2 top-[60%] flex -translate-x-1/2 flex-col items-center gap-2">
        {hud.overchargeFrac > 0 && (
          <div className="w-36">
            <div className="mb-0.5 text-center font-orbitron text-xs font-bold tracking-widest text-[#b18cff]">
              OVERDRIVE
            </div>
            <div className="h-[3px] overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full bg-gradient-to-r from-[#b18cff] to-[#ff2975]"
                style={{ width: `${hud.overchargeFrac * 100}%` }}
              />
            </div>
          </div>
        )}
        {hud.combo > 0 && (
          <div className="text-center">
            <div
              key={hud.combo}
              className={`combo-pop font-orbitron text-xl font-black italic ${MULT_COLOR[hud.mult] ?? ''}`}
            >
              ×{hud.mult}
            </div>
            <div className="mx-auto mt-0.5 h-[3px] w-20 overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full bg-[#ff2975] transition-[width] duration-150"
                style={{ width: `${hud.comboFrac * 100}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* banner */}
      {hud.banner && (
        <div key={hud.bannerId} className="banner font-orbitron text-4xl font-black text-white">
          <span className="glitch">{hud.banner}</span>
        </div>
      )}

      {/* score popups */}
      {(hud.popups ?? []).map((p) => (
        <div
          key={p.id}
          className={`popup font-orbitron text-base font-bold italic ${
            p.kind === 'heal'
              ? 'text-[#39ff88]'
              : p.kind === 'gem'
                ? 'text-[#ffd319]'
                : p.kind === 'crit'
                  ? 'text-[#ff9f1c]'
                  : 'text-[#9ffcff]'
          }`}
          style={{ left: `${p.x * 100}%`, top: `${p.y * 100}%` }}
        >
          {p.text}
        </div>
      ))}

      {/* wave */}
      <div className="absolute left-1/2 top-4 -translate-x-1/2 text-center">
        <div className="font-tech text-[10px] uppercase tracking-[0.4em] text-white/40">STAGE</div>
        <div className="font-orbitron text-lg font-bold text-white">{wave}</div>
        <div className="font-tech text-[11px] text-white/50">HOSTILES {hud.remaining}</div>
      </div>

      {/* score */}
      <div className="hud-panel absolute left-4 top-4 rounded-xl px-4 py-2">
        <div className="font-tech text-[10px] uppercase tracking-[0.3em] text-white/40">SCORE</div>
        <div className="font-orbitron text-2xl font-black text-white">{hud.score}</div>
        <div className="font-tech text-[10px] text-white/45">
          KILLS {hud.kills} · BEST ×{hud.bestCombo}
        </div>
      </div>

      {/* health + slide */}
      <div className="absolute bottom-4 left-4 w-52">
        {hud.activeHacks.length > 0 && (
          <div className="active-hacks font-tech" role="list" aria-label="Active neon hacks">
            {hud.activeHacks.map((hack) => (
              <span key={hack.id} className="active-hack-badge" data-tier={hack.tier} role="listitem"
                title={`${hack.name}: ${hack.description}`} aria-label={`${hack.name}: ${hack.description}`}>
                {hack.badge}
              </span>
            ))}
          </div>
        )}
        <div className="mb-1 flex items-end justify-between">
          <span className="font-tech text-[10px] uppercase tracking-[0.3em] text-white/40">HP</span>
          <span className="font-orbitron text-base font-bold text-white">{hud.health}</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full rounded-full transition-[width] duration-200"
            style={{
              width: `${hud.health}%`,
              background:
                hud.health > 50
                  ? 'linear-gradient(90deg,#00f0ff,#39ff88)'
                  : hud.health > 25
                    ? 'linear-gradient(90deg,#ffd319,#ff9f1c)'
                    : 'linear-gradient(90deg,#ff2975,#ff0535)',
            }}
          />
        </div>
        <div className="mt-2 flex items-center gap-2">
          <span className="font-tech text-[10px] uppercase tracking-widest text-white/40">SLIDE C</span>
          <div className="h-1 flex-1 overflow-hidden rounded-full bg-white/10">
            <div
              className={`h-full rounded-full transition-[width] duration-100 ${hud.slideFrac >= 1 ? 'bg-[#00f0ff]' : 'bg-white/40'}`}
              style={{ width: `${Math.max(hud.slideFrac, 0.06) * 100}%` }}
            />
          </div>
        </div>
      </div>

      {/* weapon + ammo */}
      <div className="absolute bottom-4 right-4 text-right">
        <div className="mb-2 flex items-center justify-end gap-1.5">
          {(['rifle', 'deagle'] as const).map((id) => {
            const active = hud.weapon === id
            return (
              <span
                key={id}
                className={`weapon-pill rounded-full px-3 py-0.5 font-tech text-[11px] ${
                  active ? (id === 'deagle' ? 'weapon-pill-active-gold' : 'weapon-pill-active') : ''
                }`}
              >
                {WEAPON_INFO[id]}
              </span>
            )
          })}
        </div>
        {hud.reloading ? (
          <div>
            <div className="font-orbitron text-lg font-bold italic text-[#ffd319] neon-pulse">
              RELOADING…
            </div>
            <div className="ml-auto mt-1 h-1 w-28 overflow-hidden rounded-full bg-white/10">
              <div className="h-full rounded-full bg-[#ffd319]" style={{ width: `${hud.reloadFrac * 100}%` }} />
            </div>
          </div>
        ) : (
          <div className="font-orbitron">
            <span className={`text-4xl font-black ${hud.ammo <= 6 ? 'text-[#ff2975]' : 'text-white'}`}>
              {hud.ammo}
            </span>
            <span className="ml-1 text-lg text-white/35">/{hud.mag}</span>
          </div>
        )}
        {hud.ammo <= 6 && !hud.reloading && (
          <div className="neon-pulse font-orbitron text-xs font-bold italic text-[#ff2975]">
            PRESS [R] TO RELOAD
          </div>
        )}
        <div className="font-tech text-[10px] uppercase tracking-widest text-white/35">
          Q SWAP · F PUNCH · E GLORY KILL
        </div>
      </div>
    </div>
  )
}

function Kbd({ children }: { children: string }) {
  return (
    <kbd className="rounded border border-white/15 bg-white/5 px-2 py-1 font-tech text-xs text-[#9ffcff]">
      {children}
    </kbd>
  )
}

function ControlsGrid() {
  return (
    <div className="mt-6 grid grid-cols-1 gap-x-6 gap-y-2 text-sm text-white/75 sm:grid-cols-2">
      <div className="flex items-center justify-between gap-4">
        <span>MOVE</span>
        <span className="flex gap-1">
          <Kbd>WASD</Kbd>
        </span>
      </div>
      <div className="flex items-center justify-between gap-4">
        <span>PHASE DASH / HOLD SPRINT</span>
        <Kbd>SHIFT</Kbd>
      </div>
      <div className="flex items-center justify-between gap-4">
        <span>PULSE PARRY</span>
        <Kbd>V</Kbd>
      </div>
      <div className="flex items-center justify-between gap-4">
        <span>KINETIC SLAM · IN AIR</span>
        <span className="flex gap-1"><Kbd>G</Kbd><Kbd>C</Kbd></span>
      </div>
      <div className="flex items-center justify-between gap-4">
        <span>SHOOT / RELOAD</span>
        <span className="flex gap-1">
          <Kbd>LMB</Kbd>
          <Kbd>R</Kbd>
        </span>
      </div>
      <div className="flex items-center justify-between gap-4">
        <span>SWAP WEAPON</span>
        <Kbd>Q</Kbd>
      </div>
      <div className="flex items-center justify-between gap-4">
        <span>PUNCH</span>
        <span className="flex gap-1">
          <Kbd>F</Kbd>
          <Kbd>RMB</Kbd>
        </span>
      </div>
      <div className="flex items-center justify-between gap-4">
        <span>GLORY KILL</span>
        <span className="flex gap-1">
          <Kbd>E</Kbd>
          <Kbd>F / RMB</Kbd>
        </span>
      </div>
      <div className="flex items-center justify-between gap-4">
        <span>SLIDE</span>
        <span className="flex gap-1">
          <Kbd>C</Kbd>
          <Kbd>CTRL</Kbd>
        </span>
      </div>
      <div className="flex items-center justify-between gap-4">
        <span>JUMP / MUSIC</span>
        <span className="flex gap-1">
          <Kbd>SPACE</Kbd>
          <Kbd>M</Kbd>
        </span>
      </div>
    </div>
  )
}

function DualSenseIcon({ className = 'h-5 w-8' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 40 26" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 5h16c3 0 5 2 6 6l3 10c.5 2-2 3-3.5 1.5L28 17H12l-5.5 5.5C5 24 2.5 23 3 21l3-10c1-4 3-6 6-6Z" />
      <path d="M15 5l1 6h8l1-6M9 10v6m-3-3h6" />
      <circle cx="15" cy="16" r="2" />
      <circle cx="25" cy="16" r="2" />
      <circle cx="30" cy="10" r=".8" fill="currentColor" stroke="none" />
      <circle cx="33" cy="13" r=".8" fill="currentColor" stroke="none" />
      <circle cx="27" cy="13" r=".8" fill="currentColor" stroke="none" />
      <circle cx="30" cy="16" r=".8" fill="currentColor" stroke="none" />
    </svg>
  )
}

function BatteryIcon() {
  return (
    <svg className="h-4 w-7" viewBox="0 0 28 16" fill="none" aria-label="Controller battery" role="img">
      <rect x="1" y="2" width="22" height="12" rx="2.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M26 6v4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M5 5v6m6-6v6m6-6v6" stroke="currentColor" strokeWidth="3" />
    </svg>
  )
}

function MuteButton({ muted, onClick }: { muted: boolean; onClick: () => void }) {
  return (
    <button
      onClick={(e) => {
        e.stopPropagation()
        onClick()
      }}
      type="button"
      aria-label={muted ? 'Turn audio on' : 'Turn audio off'}
      aria-pressed={!muted}
      className="pointer-events-auto absolute right-4 top-4 z-20 rounded-lg border border-white/10 bg-black/40 px-3 py-1.5 font-tech text-xs text-white/70 backdrop-blur-md transition-colors hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#9ffcff]"
    >
      AUDIO: {muted ? 'OFF' : 'ON'}
    </button>
  )
}

export default function GamePage() {
  const containerRef = useRef<HTMLDivElement>(null)
  const engineRef = useRef<GameEngine | null>(null)
  const initializeRef = useRef<HTMLButtonElement>(null)
  const playRef = useRef<HTMLButtonElement>(null)
  const controlsRef = useRef<HTMLDialogElement>(null)
  const [hud, setHud] = useState<HudState>(INITIAL_HUD)
  const [ps5Standby, setPs5Standby] = useState(true)
  const [showControls, setShowControls] = useState(false)
  const [clockTime, setClockTime] = useState(() => new Date().toLocaleTimeString([], {
    hour: '2-digit', minute: '2-digit', hour12: false,
  }))
  const applyHack = useCallback((id: HackId) => engineRef.current?.applyDraftHack(id), [])

  useEffect(() => {
    const updateTime = () => {
      const now = new Date()
      setClockTime(
        now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })
      )
    }
    updateTime()
    const timer = setInterval(updateTime, 1000)
    return () => clearInterval(timer)
  }, [])

  const playUiChime = useCallback(() => {
    if (hud.muted) return
    try {
      const audio = new Audio('/audio/sfx_combo_pickup.wav')
      audio.volume = 0.35
      void audio.play().catch(() => {})
    } catch {}
  }, [hud.muted])

  const wakeUpFromStandby = useCallback(() => {
    playUiChime()
    setPs5Standby(false)
  }, [playUiChime])

  const enterStandby = useCallback(() => {
    setShowControls(false)
    setPs5Standby(true)
  }, [])

  const startGame = useCallback(() => {
    setShowControls(false)
    playUiChime()
    engineRef.current?.start()
  }, [playUiChime])

  const toggleAudio = useCallback(() => engineRef.current?.toggleMute(), [])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const engine = new GameEngine(el, setHud)
    engineRef.current = engine
    return () => {
      engine.dispose()
      engineRef.current = null
    }
  }, [])

  const status = hud.status

  useEffect(() => {
    if (status !== 'menu') return
    const button = ps5Standby ? initializeRef.current : playRef.current
    button?.focus({ preventScroll: true })
  }, [status, ps5Standby])

  useEffect(() => {
    const dialog = controlsRef.current
    if (!dialog) return
    if (showControls && !ps5Standby && status === 'menu') {
      if (!dialog.open) dialog.showModal()
    } else if (dialog.open) {
      dialog.close()
    }
  }, [showControls, ps5Standby, status])

  useEffect(() => {
    if (status !== 'menu') return
    const handleKey = (e: KeyboardEvent) => {
      if (e.altKey || e.ctrlKey || e.metaKey || e.isComposing) return
      if (!['Enter', 'Space', 'KeyX', 'KeyC', 'KeyM', 'Escape', 'KeyO'].includes(e.code)) return

      // Keep hub shortcuts out of the engine's gameplay and mute handlers.
      e.stopImmediatePropagation()
      if (e.repeat) {
        e.preventDefault()
        return
      }

      if (ps5Standby) {
        e.preventDefault()
        if (['Enter', 'Space', 'KeyX'].includes(e.code)) {
          wakeUpFromStandby()
        }
        return
      }

      // Preserve native Enter/Space activation for whichever button has focus.
      if (['Enter', 'Space'].includes(e.code) && e.target instanceof Element && e.target.closest('button')) return
      e.preventDefault()
      if (e.code === 'Escape' || e.code === 'KeyO') {
        enterStandby()
      } else if (e.code === 'KeyC') {
        setShowControls((visible) => !visible)
      } else if (e.code === 'KeyM') {
        toggleAudio()
      } else if (!showControls && (e.code === 'KeyX' || e.code === 'Enter')) {
        startGame()
      }
    }
    window.addEventListener('keydown', handleKey, true)
    return () => window.removeEventListener('keydown', handleKey, true)
  }, [status, ps5Standby, showControls, wakeUpFromStandby, enterStandby, startGame, toggleAudio])

  const showHud = status === 'playing' || status === 'paused'

  return (
    <div
      ref={containerRef}
      className={`relative h-dvh w-full select-none overflow-hidden bg-[#0d0221] ${
        status === 'playing' ? 'cursor-none' : 'cursor-default'
      }`}
      onContextMenu={(e) => e.preventDefault()}
    >
      {showHud && <Hud hud={hud} />}
      {status !== 'menu' && <MuteButton muted={hud.muted} onClick={toggleAudio} />}

      {status !== 'menu' && <div className="crt-vignette" />}

      {status === 'menu' && (
        <div
          className="ps5-standby-screen absolute inset-0 z-10 isolate overflow-x-hidden overflow-y-auto text-white [scrollbar-color:#35506b_#060810] [&_button:focus-visible]:outline [&_button:focus-visible]:outline-2 [&_button:focus-visible]:outline-offset-4 [&_button:focus-visible]:outline-[#9ffcff]"
          data-ps5-phase={ps5Standby ? 'standby' : 'dashboard'}
        >
          <div className="ps5-ambient-ribbon motion-reduce:!animate-none" aria-hidden="true" />
          <svg
            className="pointer-events-none absolute inset-0 h-full w-full motion-reduce:!animate-none"
            style={{ animation: 'ps5-ambient-drift 18s ease-in-out infinite alternate' }}
            viewBox="0 0 1440 900"
            preserveAspectRatio="xMidYMid slice"
            fill="none"
            aria-hidden="true"
          >
            <path d="M-180 850C310 160 840 1180 1620 120" stroke="#369bdf" strokeWidth="70" opacity=".08" className="blur-2xl" />
            <path d="M-180 850C310 160 840 1180 1620 120" stroke="#7dd3fc" strokeWidth="1.5" opacity=".18" />
            <path d="M-180 870C360 230 870 1170 1620 180" stroke="#7dd3fc" strokeWidth="1" opacity=".08" />
          </svg>

          {ps5Standby ? (
            <main
              className="relative flex h-full min-h-[30rem] w-full cursor-pointer flex-col items-center justify-center px-5 py-24 text-center"
              onClick={wakeUpFromStandby}
              aria-label="PS5 standby"
            >
              <div className="absolute top-8 flex items-center gap-3 rounded-full border border-white/10 bg-white/[0.03] px-4 py-2 text-[10px] tracking-wider text-slate-300 sm:text-xs">
                <DualSenseIcon />
                <span>DUALSENSE™ CONNECTED</span>
                <span className="h-1.5 w-1.5 rounded-full bg-[#00f0ff] motion-safe:animate-pulse" />
              </div>

              <div className="mb-7 flex items-center gap-7 text-2xl" aria-hidden="true">
                <span className="ps5-glyph-cross">✕</span>
                <span className="ps5-glyph-circle">○</span>
                <span className="ps5-glyph-triangle">△</span>
                <span className="ps5-glyph-square">◻</span>
              </div>
              <h1 className="font-orbitron text-[clamp(2.75rem,7vw,6rem)] font-bold leading-none tracking-tight">
                NEON BAY
              </h1>
              <p className="mt-5 text-[10px] tracking-[0.24em] text-[#a6c5dc] sm:text-xs sm:tracking-[0.4em]">
                MIAMI NIGHTS PROTOCOL
              </p>
              <button
                ref={initializeRef}
                type="button"
                aria-keyshortcuts="Enter Space X"
                onClick={(event) => {
                  event.stopPropagation()
                  wakeUpFromStandby()
                }}
                className="mt-14 min-h-12 rounded-full border border-white/20 bg-white/5 px-5 py-4 text-[10px] font-medium tracking-wider text-white transition-colors hover:border-[#9ffcff]/60 hover:bg-white/10 motion-safe:animate-[neon-pulse_3.5s_ease-in-out_infinite] focus-visible:animate-none sm:px-8 sm:text-xs"
              >
                PRESS [✕ / ENTER] TO INITIALIZE
              </button>
            </main>
          ) : (
            <div className="relative mx-auto flex min-h-full w-full max-w-[1600px] flex-col gap-8 px-5 py-6 sm:px-10 lg:px-16 lg:py-8">
              <header className="flex flex-wrap items-center justify-between gap-x-8 gap-y-5">
                <div className="flex items-center gap-8 text-sm tracking-[0.15em]" role="tablist" aria-label="Console sections">
                  <button
                    id="ps5-games-tab"
                    type="button"
                    role="tab"
                    aria-selected="true"
                    aria-controls="ps5-game-hub"
                    className="relative min-h-11 font-semibold after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:bg-[#00f0ff]"
                  >
                    GAMES
                  </button>
                  <button type="button" role="tab" aria-selected="false" disabled title="Media is unavailable" className="min-h-11 text-slate-400">
                    MEDIA
                  </button>
                </div>

                <div className="flex flex-wrap items-center gap-4 text-xs text-slate-300 sm:gap-6">
                  <time className="tabular-nums tracking-wider">{clockTime}</time>
                  <div className="flex items-center gap-2.5 rounded-full border border-white/10 bg-white/5 py-1.5 pl-1.5 pr-3">
                    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#b8d8e9] text-xs font-semibold text-[#101c29]" aria-hidden="true">A</span>
                    <span className="text-[10px] font-medium tracking-wider sm:text-xs">ALEXANDER</span>
                    <span className="h-1.5 w-1.5 rounded-full bg-[#39ff88]" role="img" aria-label="Online" />
                  </div>
                  <div className="flex items-center gap-2 text-slate-300" aria-label="DualSense controller connected">
                    <DualSenseIcon />
                    <BatteryIcon />
                  </div>
                </div>
              </header>

              <main id="ps5-game-hub" role="tabpanel" aria-labelledby="ps5-games-tab" className="flex flex-1 flex-col justify-between gap-10">
                <section className="my-auto py-5 sm:py-8" aria-labelledby="ps5-game-title">
                  <div className="mb-6 flex flex-wrap items-center gap-2 text-[9px] font-medium tracking-wider sm:text-[10px]">
                    <span className="rounded border border-[#9ffcff]/30 bg-[#9ffcff]/5 px-2.5 py-1 text-[#b6efff]">PS5™ PRO ENHANCED</span>
                    <span className="rounded border border-white/15 px-2.5 py-1 text-slate-300">120 FPS</span>
                    <span className="rounded border border-white/15 px-2.5 py-1 text-slate-300">TEMPEST 3D AUDIO</span>
                  </div>
                  <h1 id="ps5-game-title" className="font-orbitron text-[clamp(2.75rem,7vw,6rem)] font-bold leading-none tracking-tight">
                    NEON BAY
                  </h1>
                  <p className="mt-4 text-xs tracking-[0.25em] text-[#a6c5dc] sm:text-sm">MIAMI NIGHTS · 1989</p>
                  <span className="mt-6 inline-block rounded border border-white/10 px-3 py-1.5 text-[10px] tracking-wider text-slate-300">
                    1 PLAYER · FPS · WAVE SURVIVAL
                  </span>

                  <div className="mt-8 flex flex-wrap items-center gap-3">
                    <button
                      ref={playRef}
                      type="button"
                      onClick={startGame}
                      aria-keyshortcuts="X Enter"
                      className="flex min-h-12 items-center gap-3 rounded-full bg-white px-8 py-3 text-sm font-semibold tracking-wider text-[#070913] transition-colors hover:bg-[#dff7ff]"
                    >
                      <span className="text-lg" aria-hidden="true">✕</span> PLAY GAME
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowControls(true)}
                      aria-keyshortcuts="C"
                      aria-haspopup="dialog"
                      className="ps5-sec-btn flex min-h-12 items-center gap-2 rounded-full px-5 py-3 text-xs tracking-wider"
                    >
                      <span className="ps5-glyph-square text-lg" aria-hidden="true">◻</span> CONTROLS & TACTICS
                    </button>
                    <button
                      type="button"
                      onClick={enterStandby}
                      aria-keyshortcuts="Escape O"
                      className="ps5-sec-btn flex min-h-12 items-center gap-2 rounded-full px-5 py-3 text-xs tracking-wider"
                    >
                      <span className="ps5-glyph-circle text-lg" aria-hidden="true">○</span> STANDBY
                    </button>
                    <button
                      type="button"
                      onClick={toggleAudio}
                      aria-keyshortcuts="M"
                      aria-pressed={!hud.muted}
                      className="flex min-h-12 items-center gap-2 rounded-full px-4 py-3 text-xs tracking-wider text-slate-300 transition-colors hover:bg-white/5 hover:text-white"
                    >
                      <span className="ps5-glyph-triangle text-lg" aria-hidden="true">△</span> AUDIO: {hud.muted ? 'OFF' : 'ON'}
                    </button>
                  </div>
                </section>

                <section aria-label="Activities" className="grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-4">
                  {[
                    { title: 'WAVE SURVIVAL', detail: 'ENDLESS WAVES', glyph: '✕', color: 'ps5-glyph-cross' },
                    { title: 'ARSENAL LOADOUT', detail: 'PULSE RIFLE + EAGLE', glyph: '◻', color: 'ps5-glyph-square' },
                    { title: 'STREAK TARGET', detail: '×5 CARNAGE', glyph: '△', color: 'ps5-glyph-triangle' },
                  ].map(({ title, detail, glyph, color }) => (
                    <article key={title} className="rounded-xl border border-white/10 bg-white/[0.03] p-5">
                      <h2 className="flex items-center justify-between gap-3 text-[10px] font-medium tracking-wider text-slate-300">
                        {title}<span className={`${color} text-lg`} aria-hidden="true">{glyph}</span>
                      </h2>
                      <p className="mt-3 text-sm font-medium tracking-wide sm:text-base">{detail}</p>
                    </article>
                  ))}
                </section>
              </main>

              <footer className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-white/10 pt-5 text-[11px] text-slate-300">
                <span><span className="ps5-glyph-cross" aria-hidden="true">✕</span> Play</span>
                <span aria-hidden="true">·</span>
                <span><span className="ps5-glyph-square" aria-hidden="true">◻</span> Controls</span>
                <span aria-hidden="true">·</span>
                <span><span className="ps5-glyph-triangle" aria-hidden="true">△</span> Audio Mode</span>
                <span aria-hidden="true">·</span>
                <span><span className="ps5-glyph-circle" aria-hidden="true">○</span> Standby</span>
              </footer>

              <dialog
                ref={controlsRef}
                aria-labelledby="ps5-controls-title"
                onCancel={(event) => {
                  event.preventDefault()
                  enterStandby()
                }}
                onClose={() => setShowControls(false)}
                onClick={(event) => {
                  if (event.target === event.currentTarget) setShowControls(false)
                }}
                className="m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-2xl overflow-y-auto rounded-2xl border border-white/15 bg-[#101725] p-6 text-white backdrop:bg-black/75 backdrop:backdrop-blur-md sm:p-8"
              >
                <div className="flex items-center justify-between gap-4 border-b border-white/10 pb-4">
                  <h2 id="ps5-controls-title" className="text-sm font-semibold tracking-wide sm:text-lg">CONTROLS & TACTICS</h2>
                  <button type="button" autoFocus onClick={() => setShowControls(false)} aria-label="Close controls" className="ps5-sec-btn flex h-11 w-11 shrink-0 items-center justify-center rounded-full">✕</button>
                </div>
                <ControlsGrid />
                <div className="mt-6 flex justify-end">
                  <button type="button" onClick={() => setShowControls(false)} className="ps5-sec-btn min-h-11 rounded-full px-6 py-2 text-xs tracking-wider">CLOSE (C)</button>
                </div>
              </dialog>
            </div>
          )}
        </div>
      )}

      {hud.draftOpen && (
        <HackTerminal hacks={hud.draftHacks} wave={hud.wave} onSelect={applyHack} audio={engineRef.current?.sfx} />
      )}

      {status === 'paused' && !hud.draftOpen && (
        <div
          className="absolute inset-0 z-10 flex items-center justify-center bg-[#0d0221]/60 backdrop-blur-[2px]"
          onClick={() => engineRef.current?.resume()}
        >
          <div className="neon-panel mx-4 max-w-md rounded-2xl p-8 text-center text-white">
            <h2 className="font-orbitron text-3xl font-black italic text-[#ff9fc4]">PAUSED</h2>
            <p className="mt-2 font-tech text-sm text-white/60">CLICK ANYWHERE TO RESUME</p>
            <div className="mt-6 flex justify-center gap-3">
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  engineRef.current?.resume()
                }}
                className="neon-btn-cyan neon-btn rounded-lg px-8 py-3 font-orbitron font-bold italic"
              >
                RESUME
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  engineRef.current?.restart()
                }}
                className="neon-btn rounded-lg px-8 py-3 font-orbitron font-bold italic"
              >
                RESTART
              </button>
            </div>
          </div>
        </div>
      )}

      {status === 'over' && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-gradient-to-b from-[#2a0220]/80 via-[#0d0221]/75 to-[#0d0221]/90 backdrop-blur-[2px]">
          <div className="neon-panel mx-4 max-w-md rounded-2xl p-10 text-center text-white">
            <h2
              className="font-orbitron text-4xl font-black italic text-[#ff2975]"
              style={{ textShadow: '0 0 18px rgba(255,41,117,0.9)' }}
            >
              YOU&apos;RE DONE
            </h2>
            <p className="mt-2 font-tech text-sm text-white/60">THE NEON WENT DARK… FOR NOW</p>
            <div className="mt-6 grid grid-cols-3 gap-4 text-center">
              <div>
                <div className="font-tech text-xs uppercase tracking-widest text-white/50">SCORE</div>
                <div className="font-orbitron text-2xl font-black text-[#9ffcff]">{hud.score}</div>
              </div>
              <div>
                <div className="font-tech text-xs uppercase tracking-widest text-white/50">KILLS</div>
                <div className="font-orbitron text-2xl font-black text-[#ff9fc4]">{hud.kills}</div>
              </div>
              <div>
                <div className="font-tech text-xs uppercase tracking-widest text-white/50">BEST</div>
                <div className="font-orbitron text-2xl font-black text-[#ffe191]">×{hud.bestCombo}</div>
              </div>
            </div>
            <button
              onClick={() => engineRef.current?.restart()}
              className="neon-btn mt-8 w-full rounded-xl px-10 py-4 font-orbitron text-lg font-bold italic"
            >
              TRY AGAIN
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
