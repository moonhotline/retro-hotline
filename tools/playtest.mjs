#!/usr/bin/env node
/**
 * Automated browser play-test + regression harness.
 *
 * Drives the real game in Chromium through Playwright, plays it with real
 * keyboard / mouse input, and records evidence (stats JSON + screenshots):
 *   - console / page errors
 *   - frame pacing (avg FPS, p95 frame time), draw calls, GPU resources
 *   - regressions: weapon swap, fire, reload, punch, slide, enemy combat,
 *     zone travel, death + restart, music continuity
 *   - leak / "corpse" check: scene object count + GPU geometries return to
 *     baseline after enemies die and after a restart
 *
 * Usage:
 *   node tools/playtest.mjs [--url http://localhost:5173] [--out docs/evidence/round-0] [--headed]
 *
 * Playwright is not a project dependency (keeps the bundle lean); it is
 * resolved from PLAYWRIGHT_DIR, the local node_modules, or the npx cache.
 */
import { createRequire } from 'node:module'
import { mkdirSync, writeFileSync, readdirSync, existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { homedir } from 'node:os'

const args = process.argv.slice(2)
const arg = (name, def) => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 ? args[i + 1] : def
}
const URL = arg('url', 'http://localhost:5173')
const OUT = resolve(arg('out', 'docs/evidence/latest'))
const HEADED = args.includes('--headed')
const COMBAT_SECONDS = Number(arg('combat', '20'))

function loadPlaywright() {
  const candidates = []
  if (process.env.PLAYWRIGHT_DIR) candidates.push(process.env.PLAYWRIGHT_DIR)
  candidates.push(process.cwd())
  const npx = join(homedir(), '.npm/_npx')
  if (existsSync(npx)) {
    for (const d of readdirSync(npx)) candidates.push(join(npx, d))
  }
  for (const c of candidates) {
    try {
      const req = createRequire(join(c, 'package.json'))
      return req('playwright')
    } catch {
      /* try next */
    }
  }
  throw new Error('Playwright not found. Run `npx playwright --version` once or set PLAYWRIGHT_DIR.')
}

const { chromium } = loadPlaywright()
mkdirSync(OUT, { recursive: true })

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const results = { url: URL, startedAt: new Date().toISOString(), checks: [], samples: {}, errors: [] }
const check = (name, pass, detail = {}) => {
  results.checks.push({ name, pass: !!pass, ...detail })
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}  ${JSON.stringify(detail)}`)
}

const browser = await chromium.launch({
  headless: !HEADED,
  args: [
    '--autoplay-policy=no-user-gesture-required',
    '--use-angle=metal',
    '--enable-gpu',
    '--ignore-gpu-blocklist',
    '--enable-unsafe-swiftshader',
  ],
})
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
page.on('console', (m) => {
  if (m.type() === 'error' || m.type() === 'warning') {
    results.errors.push({ type: m.type(), text: m.text().slice(0, 400) })
  }
})
page.on('pageerror', (e) => results.errors.push({ type: 'pageerror', text: String(e).slice(0, 400) }))

const stats = () => page.evaluate(() => window.__neon.stats())
const neon = (fn, ...a) => page.evaluate(({ fn, a }) => window.__neon[fn](...a), { fn, a })
const shot = (name) => page.screenshot({ path: join(OUT, `${name}.png`) })

async function sampleFps(label, ms = 3000) {
  await sleep(ms)
  const s = await stats()
  results.samples[label] = {
    fps: +s.fps.toFixed(1),
    frameMsP95: +s.frameMsP95.toFixed(1),
    drawCalls: s.drawCalls,
    lines: s.lines,
    triangles: s.triangles,
    geometries: s.geometries,
    textures: s.textures,
    sceneObjects: s.sceneObjects,
    enemies: s.enemies,
  }
  console.log(`SAMPLE ${label}`, JSON.stringify(results.samples[label]))
  return s
}

try {
  await page.goto(URL, { waitUntil: 'networkidle' })
  await page.waitForFunction(() => !!window.__neon, null, { timeout: 20000 })
  results.gl = await page.evaluate(() => {
    const c = document.createElement('canvas').getContext('webgl2')
    const ext = c && c.getExtension('WEBGL_debug_renderer_info')
    return ext ? c.getParameter(ext.UNMASKED_RENDERER_WEBGL) : 'unknown'
  })
  console.log('GL renderer:', results.gl)

  // ---- console UX: real keyboard/buttons, responsive layout, modal focus ----
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.evaluate(() => document.fonts.ready)
  await shot('standby-desktop')
  await page.keyboard.press('Enter')
  await page.waitForSelector('[data-ps5-phase="dashboard"]')
  check('Enter initializes the hub without launching combat', (await stats()).status === 'menu')
  await shot('hub-desktop')
  check('desktop hub includes its footer without scrolling', await page.locator('.console-shell').evaluate((el) => el.scrollHeight <= el.clientHeight + 1))
  await page.getByRole('button', { name: 'CONTROLS & TACTICS', exact: true }).click()
  await page.waitForSelector('dialog[open]')
  await shot('controls-desktop')
  check('controls clearly reserve keyboard V/G and separate C slide', await page.locator('dialog').innerText().then((text) => text.includes('V and G are keyboard only') && text.includes('Slide · ground only')))
  await page.keyboard.press('Tab')
  check('native dialog traps keyboard focus', await page.evaluate(() => !!document.activeElement?.closest('dialog')))
  await page.keyboard.press('Escape')
  check('Escape closes controls and restores the invoker', await page.evaluate(() => !document.querySelector('dialog').open && document.activeElement?.textContent.includes('CONTROLS & TACTICS')))
  await page.getByRole('button', { name: 'MEDIA', exact: true }).click()
  await shot('media-desktop')
  const originalTrack = (await stats()).music.trackIndex
  await page.keyboard.press('KeyN')
  const nextTrack = (await stats()).music
  check('N changes the live synth title and BPM in media', nextTrack.trackIndex === (originalTrack + 1) % 3 && await page.locator('.console-track').innerText().then((text) => text.includes(nextTrack.trackName) && text.includes(String(nextTrack.bpm))))
  await page.locator('.console-track-button').click()
  check('track button cycles the same synth engine', (await stats()).music.trackIndex === (originalTrack + 2) % 3)
  await page.keyboard.press('KeyN')
  await page.getByRole('button', { name: 'GAMES', exact: true }).click()
  await page.keyboard.press('KeyO')
  await page.setViewportSize({ width: 390, height: 844 })
  await shot('standby-mobile')
  await page.keyboard.press('Enter')
  await shot('hub-mobile')
  check('mobile hub has no horizontal overflow', await page.locator('.console-shell').evaluate((el) => el.scrollWidth <= el.clientWidth))
  await page.locator('.console-footer').scrollIntoViewIfNeeded()
  await shot('hub-mobile-activities')
  await page.keyboard.press('KeyC')
  await shot('controls-mobile')
  await page.locator('.console-control-note').scrollIntoViewIfNeeded()
  await shot('controls-mobile-bottom')
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: 'MEDIA', exact: true }).click()
  await shot('media-mobile')
  await page.keyboard.press('Escape')
  await page.keyboard.press('KeyO')
  await page.emulateMedia({ reducedMotion: 'reduce' })
  check('reduced motion disables both ambient animations', await page.locator('.console-ribbons, .ps5-ambient-ribbon').evaluateAll((els) => els.every((el) => getComputedStyle(el).animationName === 'none')))
  await shot('standby-reduced-motion')
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.setViewportSize({ width: 1280, height: 720 })

  // Synthetic Gamepad API fixture; no physical controller telemetry is claimed.
  await page.evaluate(() => {
    window.__savedGetGamepads = navigator.getGamepads.bind(navigator)
    window.__consolePad = { index: 0, id: 'DualSense test fixture', connected: true, mapping: 'standard', buttons: Array.from({ length: 17 }, () => ({ pressed: false })) }
    navigator.getGamepads = () => [window.__consolePad]
  })
  await sleep(650)
  check('controller connection is live; battery remains unavailable', await page.locator('.console-controller').innerText().then((text) => text.includes('CONNECTED') && text.includes('POLL') && text.includes('—')))
  await page.evaluate(() => { window.__consolePad.buttons[0].pressed = true })
  await sleep(250)
  check('holding controller cross only initializes once', (await stats()).status === 'menu' && await page.locator('[data-ps5-phase="dashboard"]').count() === 1)
  await shot('controller-simulated')
  await page.evaluate(() => { navigator.getGamepads = window.__savedGetGamepads; delete window.__consolePad; delete window.__savedGetGamepads })
  await page.keyboard.press('KeyO')
  await sleep(650)
  check('controller disconnect restores keyboard status', await page.locator('.console-controller').innerText().then((text) => text.includes('OFFLINE')))

  await sampleFps('menu', 3000)
  await shot('01-menu')

  // ---- start (wake from standby, then launch through the real UI) ----
  await page.keyboard.press('Enter')
  await sleep(400)
  const playBtn = page.getByRole('button', { name: /launch protocol|play game/i })
  if (await playBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
    await playBtn.click()
  } else {
    await neon('start')
  }
  await page.waitForFunction(() => window.__neon.stats().status === 'playing', null, { timeout: 5000 })
  const s0 = await stats()
  check('start → playing', s0.status === 'playing', { status: s0.status })
  const musicStart = s0.music
  await neon('setGod', true)
  // Three.js uploads static geometry on first visibility. Warm the expanded map
  // before the leak baseline, so later district visits do not look like leaks.
  for (const [x, z, yaw] of [[0, -330, 0], [-2, 330, Math.PI], [0, 460, Math.PI], [0, 620, 0], [0, 0, 0], [0, 0, Math.PI], [0, 180, 0]]) {
    await neon('setPos', x, 2.4, z)
    await neon('look', yaw, 0)
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))))
  }
  await sleep(600)
  const s0b = await stats()
  const freshObjects = s0b.sceneObjects
  const freshGeometries = s0b.geometries
  await shot('02-spawn')

  // ---- weapon swap ----
  await page.keyboard.press('KeyQ')
  await sleep(350)
  let s = await stats()
  const swapped = s.weapon === 'deagle'
  await page.keyboard.press('KeyQ')
  await sleep(350)
  s = await stats()
  check('weapon swap Q (rifle→deagle→rifle)', swapped && s.weapon === 'rifle', { weapon: s.weapon })

  // ---- fire ----
  const ammo0 = s.ammo.rifle
  await page.mouse.move(640, 360)
  await page.mouse.down()
  await sleep(500)
  await page.mouse.up()
  s = await stats()
  check('fire (LMB) consumes ammo', s.ammo.rifle < ammo0, { before: ammo0, after: s.ammo.rifle })
  check('held rifle fires continuously; mouse does not trigger parry/slam', ammo0 - s.ammo.rifle >= 5 && s.abilities.pulseParry.remaining === 0 && s.abilities.kineticSlam.remaining === 0, { shotsIn500ms: ammo0 - s.ammo.rifle })

  // ---- reload ----
  await page.keyboard.press('KeyR')
  await sleep(100)
  const reloading = (await stats()).reloading
  await sleep(1500)
  s = await stats()
  check('reload R refills mag', reloading && !s.reloading && s.ammo.rifle === 32, {
    reloading,
    ammo: s.ammo.rifle,
  })

  // ---- punch ----
  await page.keyboard.press('KeyF')
  await sleep(60)
  s = await stats()
  check('punch F triggers cooldown', s.punchCd > 0, { punchCd: s.punchCd })

  // ---- slide ----
  const p0 = s.pos
  await page.keyboard.down('KeyW')
  await sleep(150)
  await page.keyboard.press('KeyC')
  await sleep(80)
  const sl = await stats()
  await sleep(400)
  await page.keyboard.up('KeyW')
  s = await stats()
  const moved = Math.hypot(s.pos.x - p0.x, s.pos.z - p0.z)
  check('slide C while moving', sl.slideT > 0 && moved > 3, { slideT: sl.slideT, moved: +moved.toFixed(2) })
  check('C does not trigger kinetic slam', sl.abilities.kineticSlam.remaining === 0)

  // ---- combat: fight real enemies for N seconds with real mouse input ----
  const baseObjects = (await stats()).sceneObjects
  await neon('skipIntermission')
  const killsBefore = (await stats()).kills
  let peakEnemies = 0
  const tEnd = Date.now() + COMBAT_SECONDS * 1000
  let shots = 0
  while (Date.now() < tEnd) {
    const d = await neon('aimNearest')
    const cur = await stats()
    peakEnemies = Math.max(peakEnemies, cur.enemies)
    if (d > 0 && d < 90) {
      await page.mouse.down()
      await sleep(180)
      await page.mouse.up()
      shots++
    } else {
      await sleep(150)
    }
    if (cur.ammo[cur.weapon] === 0) await sleep(1300)
  }
  const combat = await sampleFps('combat', 200)
  await shot('03-combat')
  check('enemies spawn and are killable', combat.kills > killsBefore && peakEnemies > 0, {
    kills: combat.kills - killsBefore,
    peakEnemies,
    shots,
    wave: combat.wave,
  })

  // ---- corpse / leak check: kill everything still alive, let FX expire ----
  await neon('clearEnemies')
  await sleep(1500)
  s = await stats()
  const extra = s.sceneObjects - baseObjects
  // pickups / caches may legitimately remain; each pickup group = 5 objects, enemies must be 0
  const allowed = s.pickups * 5 + s.shockwaves + s.tracers
  check('no enemy corpses after kills', s.enemies === 0 && extra <= allowed, {
    enemies: s.enemies,
    sceneObjects: s.sceneObjects,
    baseObjects,
    pickups: s.pickups,
    extra,
  })

  // If wave clear triggered a Neon Hack draft, select card 1 via click or keyboard to advance
  let curState = await stats()
  if (curState.draftOpen) {
    const card = page.locator('.hack-card').first()
    if (await card.isVisible({ timeout: 2000 }).catch(() => false)) {
      await card.click()
    } else {
      await page.keyboard.press('Digit1')
    }
    await sleep(400)
  }

  // ---- zone travel ----
  const zones = [
    ['zone-plaza', 0, 2.4, -330],
    ['zone-courtyard', -2, 2.4, 330],
    ['zone-silicon-valley', 0, 2.4, 460],
    ['zone-bridge', 0, 2.4, 0],
  ]
  for (const [name, x, y, z] of zones) {
    await neon('setPos', x, y, z)
    await neon('look', name === 'zone-silicon-valley' ? Math.PI : 0, 0)
    await sampleFps(name, 1500)
    await shot(`04-${name}`)
    if (name === 'zone-silicon-valley') {
      s = await stats()
      check('campus travel is walkable past z=400 with a live district badge', s.pos.z > 400 && Math.abs(s.pos.y - 2.4) < 0.1 && s.district === 'SILICON VALLEY // QUANTUM CAMPUS' && await page.locator('.hud-district').textContent().then((text) => text === s.district), { pos: s.pos, district: s.district })
      await neon('setPos', 0, 2.4, 420)
      await sleep(3000)
      s = await stats()
      check('campus jump pad lands on the Quantum Vault', s.pos.z > 480 && s.pos.z < 560 && Math.abs(s.pos.y - 11.3) < 0.1, { pos: s.pos })
      await shot('04-quantum-vault')
    }
  }
  s = await stats()
  check('zone travel keeps playing', s.status === 'playing', { status: s.status })

  // ---- pause / resume ----
  await page.keyboard.press('Escape')
  await sleep(300)
  const paused = (await stats()).status
  await page.mouse.click(640, 360)
  await sleep(400)
  s = await stats()
  check('pause/resume', ['paused', 'playing'].includes(paused) && s.status === 'playing', {
    paused,
    after: s.status,
  })

  // ---- death + restart ----
  await neon('setGod', false)
  await neon('hurt', 9999)
  await sleep(500)
  s = await stats()
  const over = s.status === 'over'
  await shot('05-gameover')
  await page.getByRole('button', { name: /try again/i }).click()
  await page.waitForFunction(() => window.__neon.stats().status === 'playing', null, { timeout: 5000 })
  await sleep(400)
  s = await stats()
  check('death → game over → restart', over && s.status === 'playing' && s.health === 100, {
    over,
    status: s.status,
    health: s.health,
  })
  // Restart must not leave previous-run enemies (the "corpse" bug): the scene
  // graph must be identical in size to a fresh run.
  check('restart clears enemies (scene back to fresh size)', s.enemies === 0 && s.sceneObjects === freshObjects, {
    enemies: s.enemies,
    wave: s.wave,
    sceneObjects: s.sceneObjects,
    freshObjects,
    leakedObjects: s.sceneObjects - freshObjects,
  })
  check('GPU geometries do not leak across restart', s.geometries <= freshGeometries + 100, {
    geometries: s.geometries,
    freshGeometries,
  })

  // ---- music continuity across all state changes ----
  const m = s.music
  check('music never restarted (step monotonic, ctx running)', m.ctx === 'running' && m.step > musicStart.step, {
    start: musicStart,
    end: m,
  })

  // ---- steady-state perf in fresh run ----
  await neon('setGod', true)
  await neon('skipIntermission')
  await sampleFps('fresh-run', 4000)
  await shot('06-fresh-run')
} catch (e) {
  results.errors.push({ type: 'harness', text: String(e && e.stack ? e.stack : e).slice(0, 800) })
  console.error(e)
  await shot('99-failure').catch(() => {})
} finally {
  results.finishedAt = new Date().toISOString()
  results.passed = results.checks.filter((c) => c.pass).length
  results.total = results.checks.length
  results.consoleErrors = results.errors.filter((e) => e.type !== 'warning').length
  writeFileSync(join(OUT, 'results.json'), JSON.stringify(results, null, 2))
  console.log(`\n${results.passed}/${results.total} checks passed, ${results.consoleErrors} errors → ${OUT}`)
  await browser.close()
  if (results.passed !== results.total || results.consoleErrors > 0) process.exitCode = 1
}
