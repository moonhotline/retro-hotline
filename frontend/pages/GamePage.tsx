import { useEffect, useRef, useState } from 'react'
import { GameEngine } from '../game/engine'
import { MUSIC_CREDIT } from '../game/music'
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

function MuteButton({ muted, onClick }: { muted: boolean; onClick: () => void }) {
  return (
    <button
      onClick={(e) => {
        e.stopPropagation()
        onClick()
      }}
      className="pointer-events-auto absolute right-4 top-4 z-20 rounded-lg border border-white/10 bg-black/40 px-3 py-1.5 font-tech text-xs text-white/70 backdrop-blur-md transition-colors hover:text-white"
    >
      ♪ {muted ? 'OFF' : 'ON'}
    </button>
  )
}

export default function GamePage() {
  const containerRef = useRef<HTMLDivElement>(null)
  const engineRef = useRef<GameEngine | null>(null)
  const [hud, setHud] = useState<HudState>(INITIAL_HUD)

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
  const showHud = status === 'playing' || status === 'paused'

  return (
    <div
      ref={containerRef}
      className={`relative h-screen w-screen select-none overflow-hidden bg-[#0d0221] ${
        status === 'playing' ? 'cursor-none' : 'cursor-default'
      }`}
      onContextMenu={(e) => e.preventDefault()}
    >
      {showHud && <Hud hud={hud} />}
      <MuteButton muted={hud.muted} onClick={() => engineRef.current?.toggleMute()} />

      <div className="crt-vignette" />

      {status === 'menu' && (
        <div className="absolute inset-0 z-10 flex items-center justify-center overflow-hidden bg-[#0d0221]/55">
          <div className="menu-grid-floor" />
          <div className="absolute left-0 right-0 top-[38%] h-[2px] bg-[#ff2975] shadow-[0_0_24px_6px_rgba(255,41,117,0.8)]" />
          <div className="neon-panel relative z-10 mx-4 max-h-[calc(100dvh-2rem)] max-w-2xl overflow-y-auto rounded-2xl p-6 text-white sm:p-10">
            <div className="font-tech text-xs font-semibold uppercase tracking-[0.5em] text-[#9ffcff]">
              Miami Nights Protocol · 1989
            </div>
            <h1 className="chrome-title mt-2 font-orbitron text-5xl font-black italic tracking-tight">
              NEON BAY
            </h1>
            <h2 className="font-orbitron text-xl font-bold tracking-[0.35em] text-[#ff9fc4]">
              NO MERCY EDITION
            </h2>
            <p className="mt-4 text-sm leading-relaxed text-white/75">
              The bridge is lost territory. Chain kills for score multipliers, slide through
              brawlers, deck armored enforcers with the Eagle, break marksman las-lock with cover,
              and hunt hidden stashes across the plaza, the arcade and the rooftops.
            </p>
            <ControlsGrid />
            <button
              onClick={() => engineRef.current?.start()}
              className="neon-btn mt-8 w-full rounded-xl px-10 py-4 font-orbitron text-lg font-bold italic"
            >
              START
            </button>
            <p className="mt-3 text-center font-tech text-xs text-white/40">
              CLICK LOCKS YOUR MOUSE · ESC PAUSES
            </p>
            <p className="mt-1 text-center font-tech text-[10px] text-white/30">{MUSIC_CREDIT}</p>
          </div>
        </div>
      )}

      {status === 'paused' && (
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
