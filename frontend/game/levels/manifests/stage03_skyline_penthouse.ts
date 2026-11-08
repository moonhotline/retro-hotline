import type { LevelManifest } from '../types'

export const STAGE_03_SKYLINE_PENTHOUSE: LevelManifest = {
  id: 'stage-03-skyline-penthouse',
  code: 'CH03_SKYLINE_PENTHOUSE',
  chapter: 3,
  name: 'CYBER OVERDRIVE',
  subtitle: 'EXECUTIVE SUITE / HELIPAD 88',
  briefing: 'Breach the executive penthouse and neutralize the rogue defense mainframe orchestrating the autonomous drone network.',
  environment: {
    districtId: 'skyline-penthouse-88',
    districtName: 'EXECUTIVE SUITE / FLOOR 88',
    skyColor: 0x200518,
    groundColor: 0x07020d,
    fogColor: 0x200518,
    fogDensity: 0.0015,
    neonPrimary: 0xff2975,
    neonSecondary: 0xffd319,
    neonAmbient: 0x00f0ff,
    trafficLanes: false,
    rainIntensity: 0.1,
  },
  audio: {
    trackName: 'CYBER OVERDRIVE',
    baseBpm: 140,
    rootNote: 'Em',
    scale: 'cyberpunk_minor',
    bassType: 'reese',
    trackIndex: 2,
  },
  storyEntities: [
    {
      id: 'terminal-ch03-mainframe',
      kind: 'terminal',
      position: [0, 1.8, 160],
      interactionRadius: 3.5,
      promptLabel: '◻︎ PURGE NEURAL MAINFRAME',
      dialogue: {
        title: 'BOARDROOM PROTOCOL // APEX AI',
        badge: 'SECURITY CLEARANCE ALPHA',
        lines: [
          { speaker: 'APEX AI', roleBadge: 'ADVERSARY', text: 'Perimeter compromised. Activating heavy armor defense matrix.' },
          { speaker: 'OPERATOR', roleBadge: 'VANGUARD', text: 'Your executive privilege has been revoked.' },
        ],
      },
      onCompleteAction: 'trigger_wave',
    },
  ],
  rooms: [
    {
      roomId: 'room-01-atrium',
      roomName: 'ATRIUM GALLERIA',
      bounds: { minX: -30, maxX: 30, minZ: -200, maxZ: 100 },
      spawnTrigger: 'immediate',
      waves: [
        {
          delayMs: 300,
          spawnOrigin: [0, 3, -50],
          drones: [
            { type: 'enforcer', count: 3 },
            { type: 'marksman', count: 2 },
          ],
        },
      ],
      parTimeSeconds: 50,
    },
    {
      roomId: 'room-02-helipad',
      roomName: 'APEX HELIPAD',
      bounds: { minX: -35, maxX: 35, minZ: 100, maxZ: 400 },
      spawnTrigger: 'on_enter',
      waves: [
        {
          delayMs: 400,
          spawnOrigin: [0, 4, 250],
          drones: [
            { type: 'boss', count: 1 },
            { type: 'gunner', count: 4 },
            { type: 'marksman', count: 2 },
          ],
        },
      ],
      parTimeSeconds: 80,
    },
  ],
}
