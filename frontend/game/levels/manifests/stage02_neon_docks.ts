import type { LevelManifest } from '../types'

export const STAGE_02_NEON_DOCKS: LevelManifest = {
  id: 'stage-02-neon-docks',
  code: 'CH02_NEON_DOCKS',
  chapter: 2,
  name: 'HOTLINE MIDNIGHT',
  subtitle: 'CARGO BASIN / PIER 48',
  briefing: 'Infiltrate the automated shipping terminal and sever the weaponized drone distribution line.',
  environment: {
    districtId: 'neon-docks-pier48',
    districtName: 'NEON DOCKS / PIER 48',
    skyColor: 0x090214,
    groundColor: 0x030408,
    fogColor: 0x090214,
    fogDensity: 0.0025,
    neonPrimary: 0xff9f1c,
    neonSecondary: 0xff2975,
    neonAmbient: 0x00f0ff,
    trafficLanes: false,
    rainIntensity: 0.6,
  },
  audio: {
    trackName: 'HOTLINE MIDNIGHT',
    baseBpm: 128,
    rootNote: 'Fm',
    scale: 'phrygian',
    bassType: 'acid',
    trackIndex: 1,
  },
  storyEntities: [
    {
      id: 'terminal-ch02-crane',
      kind: 'terminal',
      position: [-12, 1.8, -40],
      interactionRadius: 3.5,
      promptLabel: '◻︎ OVERRIDE CARGO CRANE',
      dialogue: {
        title: 'CARGO CONSOLE // BAY CRANE 04',
        badge: 'PORT-AUTHORITY',
        lines: [
          { speaker: 'ORACLE', roleBadge: 'DISPATCH', text: 'High-tier combat units detected inside shipping containers.' },
          { speaker: 'OPERATOR', roleBadge: 'VANGUARD', text: 'Depressurizing bay. Hostiles emerging on the platform.' },
        ],
      },
      onCompleteAction: 'trigger_wave',
    },
  ],
  rooms: [
    {
      roomId: 'room-01-container-yard',
      roomName: 'CONTAINER YARD',
      bounds: { minX: -30, maxX: 30, minZ: -300, maxZ: -60 },
      spawnTrigger: 'immediate',
      waves: [
        {
          delayMs: 300,
          spawnOrigin: [-10, 2, -200],
          drones: [
            { type: 'brawler', count: 3 },
            { type: 'gunner', count: 2 },
          ],
        },
      ],
      parTimeSeconds: 45,
    },
    {
      roomId: 'room-02-crane-gantry',
      roomName: 'CRANE GANTRY',
      bounds: { minX: -30, maxX: 30, minZ: -60, maxZ: 180 },
      spawnTrigger: 'on_enter',
      waves: [
        {
          delayMs: 400,
          spawnOrigin: [10, 4, 80],
          drones: [
            { type: 'marksman', count: 3 },
            { type: 'enforcer', count: 2 },
          ],
        },
      ],
      parTimeSeconds: 60,
    },
  ],
}
