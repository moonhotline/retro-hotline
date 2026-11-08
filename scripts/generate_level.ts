import { execSync } from 'node:child_process'
import * as fs from 'node:fs'
import * as path from 'node:path'

/**
 * Level Generator Tooling using Codex CLI Astra (gpt-6-astra).
 * Usage: pnpm run generate:level "brief description of the stage"
 */

const userPrompt = process.argv.slice(2).join(' ').trim()
if (!userPrompt) {
  console.error('Usage: pnpm run generate:level "<Level description>"')
  console.error('Example: pnpm run generate:level "Neon rooftop helipad with sniper drones and corporate sabotage plot"')
  process.exit(1)
}

const SYSTEM_PROMPT = `
You are a game designer for Retro Hotline / Neon Bay (PS5 aesthetic cyberpunk shooter).
Generate a strictly valid JSON object matching the LevelManifest schema below:

interface LevelManifest {
  id: string // e.g. "stage-04-helipad"
  code: string // e.g. "CH04_HELIPAD"
  chapter: number
  name: string // e.g. "ROOFTOP EXTRACTION"
  subtitle: string // e.g. "CORP TOWER - FLOOR 88"
  briefing: string // Short 1-2 sentence mission briefing
  environment: {
    districtId: string
    districtName: string
    skyColor: number // hex number like 0x16042e
    groundColor: number // hex
    fogColor: number // hex
    fogDensity: number // 0.001 - 0.005
    neonPrimary: number // hex like 0x00f0ff
    neonSecondary: number // hex like 0xff2975
    neonAmbient: number // hex like 0x9a2be2
    trafficLanes: boolean
    rainIntensity: number // 0.0 - 1.0
  }
  audio: {
    trackName: string
    baseBpm: number // 116 - 144
    rootNote: string // e.g. "Am", "Fm", "Dm"
    scale: "phrygian" | "aeolian" | "cyberpunk_minor" | "synthwave"
    bassType: "reese" | "acid" | "sub_pulse"
    trackIndex: number // 0, 1, or 2
  }
  storyEntities: Array<{
    id: string
    kind: "terminal" | "informant_npc" | "data_cache" | "extraction_door"
    position: [number, number, number]
    interactionRadius: number // typically 3.0
    promptLabel: string // e.g. "◻︎ HACK CONSOLE" or "✕ CONTACT INFORMANT"
    dialogue: {
      title: string
      badge: string
      lines: Array<{
        speaker: string
        roleBadge: string
        text: string
      }>
    }
    onCompleteAction?: "unlock_door" | "trigger_wave" | "complete_stage"
  }>
  rooms: Array<{
    roomId: string
    roomName: string
    bounds: { minX: number; maxX: number; minZ: number; maxZ: number }
    spawnTrigger: "on_enter" | "on_hack_terminal" | "immediate"
    waves: Array<{
      delayMs: number
      spawnOrigin?: [number, number, number]
      drones: Array<{
        type: "swarm" | "brawler" | "gunner" | "enforcer" | "marksman" | "boss"
        count: number
      }>
    }>
    parTimeSeconds: number
  }>
}

STRICT CONSTRAINTS:
1. Deep obsidian and neon PS5 cyberpunk style.
2. ABSOLUTELY ZERO EMOJIS in any text field or dialogue.
3. Punchy, concise dialogue (max 2 lines per dialogue entry).
4. Output MUST BE ONLY THE RAW JSON OBJECT. No explanation, no markdown backticks, no comments.
`

console.log(`[LevelGenerator] Calling Codex CLI Astra for: "${userPrompt}"...`)

try {
  const fullPrompt = `${SYSTEM_PROMPT}\nUser Request: ${userPrompt}\nOutput raw JSON:`
  // Invoke codex exec with model gpt-6-astra
  const rawOutput = execSync(`codex exec "${fullPrompt.replace(/"/g, '\\"')}"`, {
    encoding: 'utf-8',
    maxBuffer: 10 * 1024 * 1024,
  })

  // Extract JSON from output (strip codex preamble and markdown if any)
  const jsonMatch = rawOutput.match(/\{[\s\S]*\}/)
  if (!jsonMatch) {
    throw new Error('No valid JSON object found in Codex output: ' + rawOutput)
  }

  const parsed = JSON.parse(jsonMatch[0])
  if (!parsed.id || !parsed.name || !parsed.rooms) {
    throw new Error('Parsed object missing required LevelManifest properties.')
  }

  const outDir = path.resolve(process.cwd(), 'frontend/game/levels/manifests')
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true })
  }

  const safeFilename = `${parsed.id.replace(/[^a-zA-Z0-9_-]/g, '_')}.ts`
  const targetPath = path.join(outDir, safeFilename)

  const tsContent = `import type { LevelManifest } from '../types'\n\nexport const ${parsed.code || 'STAGE'}: LevelManifest = ${JSON.stringify(parsed, null, 2)}\n`
  fs.writeFileSync(targetPath, tsContent, 'utf-8')

  console.log(`[LevelGenerator] Successfully generated level: ${targetPath}`)
  console.log(`[LevelGenerator] Level ID: ${parsed.id} | Name: ${parsed.name} | Rooms: ${parsed.rooms.length}`)
} catch (err) {
  console.error('[LevelGenerator] Generation failed:', err)
  process.exit(1)
}
