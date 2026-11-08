import type { LevelManifest } from '../types'

export const STAGE_01_BAY_BRIDGE: LevelManifest = {
  id: 'stage-01-bay-bridge',
  code: 'CH01_BAY_BRIDGE',
  chapter: 1,
  name: 'BAY BRIDGE RUNNER',
  subtitle: 'SAN FRANCISCO / NEON SECTOR 01',
  briefing: 'Intercept the rogue drone convoy along the lower deck of the Bay Bridge before they establish network uplink.',
  environment: {
    districtId: 'bay-bridge-lower',
    districtName: 'BAY BRIDGE CAUSEWAY',
    skyColor: 0x16042e,
    groundColor: 0x05070e,
    fogColor: 0x16042e,
    fogDensity: 0.0018,
    neonPrimary: 0x00f0ff,
    neonSecondary: 0xff2975,
    neonAmbient: 0x9a2be2,
    trafficLanes: true,
    rainIntensity: 0.2,
  },
  audio: {
    trackName: 'BAY BRIDGE RUNNER',
    baseBpm: 116,
    rootNote: 'Am',
    scale: 'synthwave',
    bassType: 'sub_pulse',
    trackIndex: 0,
  },
  storyEntities: [
    {
      id: 'merchant-ghost',
      kind: 'hacker_merchant',
      position: [-4.5, 1.8, 160],
      interactionRadius: 4.0,
      promptLabel: '◻︎ BLACK MARKET // 幽灵黑市',
      dialogue: {
        title: 'BLACK MARKET // GHOST',
        badge: 'CONTRABAND',
        lines: [
          {
            speaker: 'GHOST // 黑客黑市商人',
            roleBadge: 'BLACK MARKET OPERATIVE',
            textEn: 'There you are, runner. Welcome to the quiet side of Neon Bay.',
            textZh: '你来了，跑者。欢迎来到霓虹湾的寂静一面。',
          },
          {
            speaker: 'GHOST // 黑客黑市商人',
            roleBadge: 'BLACK MARKET OPERATIVE',
            textEn: 'Take this prototype: GAUSS SNIPER // 高斯狙击步枪. Hold RMB to activate precision scope zoom.',
            textZh: '拿上这件原型武器：GAUSS SNIPER // 高斯狙击步枪。按住鼠标右键启用瞄准镜缩放。',
          },
        ],
      },
      onCompleteAction: 'gift_sniper',
      shopItems: [
        {
          id: 'item-nano-repair',
          name: 'NANO REPAIR KIT // 纳米修复药剂',
          description: 'Emergency bio-synthetic nanites restoring physical integrity.',
          effect: '+50 HP // 恢复生命',
          cost: 300,
          kind: 'heal',
        },
        {
          id: 'item-overclock-trigger',
          name: 'OVERCLOCK TRIGGER // 超频扳机驱动',
          description: 'Superconducting firing mechanism overclocking weapon cycler.',
          effect: '+25% SPEED // 提升射速',
          cost: 500,
          kind: 'attack_speed',
        },
        {
          id: 'item-gauss-ammo',
          name: 'RAIL AMMO CACHE // 高斯狙击弹匣',
          description: 'High-density accelerated slugs for prototype Gauss rifle.',
          effect: '+5 SLUGS // 补充弹药',
          cost: 200,
          kind: 'ammo',
        },
      ],
    },
    {
      id: 'terminal-ch01-relay',
      kind: 'terminal',
      position: [0, 1.8, -120],
      interactionRadius: 3.5,
      promptLabel: '◻︎ BREACH TERMINAL',
      dialogue: {
        title: 'TACTICAL INTERCEPT // RELAY 09',
        badge: 'SEC-LEVEL 1',
        lines: [
          {
            speaker: 'ORACLE // 先知中继',
            roleBadge: 'DISPATCH',
            text: 'Target drone convoy detected along the lower span.',
            textEn: 'Target drone convoy detected along the lower span.',
            textZh: '检测到目标无人机编队正穿过大桥下层主跨。',
          },
          {
            speaker: 'OPERATOR // 跑者',
            roleBadge: 'VANGUARD',
            text: 'Override in progress. Disabling perimeter security lock.',
            textEn: 'Override in progress. Disabling perimeter security lock.',
            textZh: '战术重载进行中。正在解除外围安全闭锁。',
          },
        ],
      },
      onCompleteAction: 'unlock_door',
    },
    {
      id: 'npc-ch01-informant',
      kind: 'informant_npc',
      position: [8, 1.8, 120],
      interactionRadius: 3.5,
      promptLabel: '✕ CONTACT INFORMANT',
      dialogue: {
        title: 'AGENT FREQUENCY // 友军通讯',
        badge: 'ALLIED INTEL',
        lines: [
          {
            speaker: 'OPERATIVE K // 特工 K',
            roleBadge: 'FIELD OPERATIVE',
            text: 'The suspension tower ahead is locked down by heavy enforcers. Keep your parry ready.',
            textEn: 'The suspension tower ahead is locked down by heavy enforcers. Keep your parry ready.',
            textZh: '前方悬索塔已被重装执法者封锁。随时准备脉冲弹反。',
          },
          {
            speaker: 'OPERATOR // 跑者',
            roleBadge: 'VANGUARD',
            text: 'Understood. Initiating chronological purge.',
            textEn: 'Understood. Initiating chronological purge.',
            textZh: '明白。启动时序净化。',
          },
        ],
      },
      onCompleteAction: 'trigger_wave',
    },
  ],
  rooms: [
    {
      roomId: 'room-01-causeway',
      roomName: 'OUTER CAUSEWAY',
      bounds: { minX: -30, maxX: 30, minZ: -380, maxZ: -120 },
      spawnTrigger: 'immediate',
      waves: [
        {
          delayMs: 300,
          spawnOrigin: [0, 2, -300],
          drones: [
            { type: 'swarm', count: 3 },
            { type: 'brawler', count: 2 },
          ],
        },
      ],
      parTimeSeconds: 40,
    },
    {
      roomId: 'room-02-main-span',
      roomName: 'MAIN SPAN',
      bounds: { minX: -30, maxX: 30, minZ: -120, maxZ: 140 },
      spawnTrigger: 'on_enter',
      waves: [
        {
          delayMs: 400,
          spawnOrigin: [0, 3, 0],
          drones: [
            { type: 'gunner', count: 3 },
            { type: 'enforcer', count: 2 },
          ],
        },
      ],
      parTimeSeconds: 50,
    },
    {
      roomId: 'room-03-anchor-tower',
      roomName: 'SUSPENSION TOWER',
      bounds: { minX: -30, maxX: 30, minZ: 140, maxZ: 380 },
      spawnTrigger: 'on_enter',
      waves: [
        {
          delayMs: 500,
          spawnOrigin: [0, 3, 260],
          drones: [
            { type: 'marksman', count: 2 },
            { type: 'enforcer', count: 2 },
            { type: 'boss', count: 1 },
          ],
        },
      ],
      parTimeSeconds: 70,
    },
  ],
}
