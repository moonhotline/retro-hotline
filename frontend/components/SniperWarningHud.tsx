import type { SniperHackState } from '../game/types'

export function SniperWarningHud({ state }: { state?: SniperHackState }) {
  if (!state || (state.warnings.length === 0 && state.cooldown <= 0)) return null
  const prompt = state.status === 'ready' ? '[F] HACK / 劫持'
    : state.status === 'redirected' ? 'SHOT REDIRECTED / 已转向'
      : state.status === 'blocked' ? 'PATH BLOCKED / 路径受阻'
        : state.status === 'cooldown' ? `HACK ${state.cooldown.toFixed(1)}s`
          : 'AIM AT DRONE / 瞄准另一架无人机'
  return (
    <div className="sniper-hud" aria-label="Sniper threat warnings">
      {state.warnings.map((warning) => (
        <div key={warning.id}
          className={`sniper-warning${warning.urgent ? ' sniper-urgent' : ''}${warning.redirected ? ' sniper-redirected' : ''}`}
          style={{ left: `${50 + Math.sin(warning.bearing) * 43}%`, top: `${50 - Math.cos(warning.bearing) * 34}%` }}
          data-redirected={warning.redirected}
          role="progressbar" aria-label={warning.redirected ? 'Redirected sniper charge' : 'Incoming sniper charge'}
          aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(warning.progress * 100)}>
          <svg viewBox="0 0 48 48" aria-hidden="true">
            <circle className="sniper-charge-track" cx="24" cy="24" r="17" />
            <circle className="sniper-charge-fill" cx="24" cy="24" r="17" pathLength="100"
              strokeDasharray={`${warning.progress * 100} 100`} transform="rotate(-90 24 24)" />
            <path d={warning.urgent && !warning.redirected ? 'M24 14 L34 32 H14 Z M24 21 V25 M24 28 V29' : 'M17 26 L24 18 L31 26 M24 18 V32'}
              transform={warning.urgent && !warning.redirected ? undefined : `rotate(${warning.bearing * 180 / Math.PI} 24 24)`} />
          </svg>
          <span>{warning.redirected ? 'HACK' : warning.urgent ? 'FIRE' : 'LOCK'}</span>
        </div>
      ))}
      <div className={`sniper-hack-prompt${state.status === 'ready' || state.status === 'redirected' ? ' sniper-redirected' : ''}`}
        data-hack-status={state.status}>{prompt}</div>
    </div>
  )
}
