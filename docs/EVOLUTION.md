# RSI Evolution Log & Architecture Decisions

## Project: Retro Hotline / Bay Bridge Shooter
Repository: `https://github.com/moonhotline/retro-hotline.git`

---

## 1. Initial State & Bug Analysis

### 1.1 "Enemy Corpse / Remains" Bug (敌人死亡后残存尸体/几何体残留)
- **Root Cause**:
  1. In `WaveDirector.explodeEnemy()`, when an enemy was eliminated, `enemy.parts.group` was removed from the scene, but its `laser` sight line (for Marksman enemies) and `proxy.userData['enemy']` reference remained in memory or in the scene hierarchy.
  2. In `WaveDirector.reset()`, the method only iterated over `this.enemies` calling `this.disposeEnemy(e)`, but never called `this.host.scene.remove(e.parts.group)`! As a result, when restarting the game, all previously spawned drone meshes remained rendered in the Three.js scene graph as invisible/frozen "ghosts" or visual corpses.
  3. In `WaveDirector.disposeEnemy()`, sprite geometries were being erroneously disposed through standard geometry disposal, causing Three.js warnings, while child nodes inside `e.parts.group` were not being cleared (`group.clear()`).
- **Fix Applied**:
  - `reset()` now explicitly removes every enemy group and laser line from `host.scene`.
  - `explodeEnemy()` properly disposes and cleans laser lines, removing proxy user data.
  - `disposeEnemy()` traverses and disposes line and mesh geometries while skipping sprite singletons, cleans material arrays, and calls `group.clear()`.

### 1.2 "Cache / Pickup Spot Alignment" Issue (缓存与掉落物位置异常)
- **Root Cause**:
  1. Combat drop pickups were sharing the same unrestricted Y and horizontal clamping logic as fixed exploration caches (`CACHE_SPOTS`). Drops in the air or off-bridge would float at invalid elevations without snapping to walkable bridge deck / plaza ground height.
- **Fix Applied**:
  - Differentiated between fixed cache stashes (`cacheIndex >= 0`) and real-time combat drops.
  - Drops now query `this.groundAt(px, pz, at.y)` and clamp horizontally to bridge railings (`[-5.8, 5.8]`) when on the bridge deck span (`abs(z) < 284`), placing items exactly at walkable surface + `1.2m`.

---

## 2. Infrastructure & Deployment Setup

### 2.1 Vercel Deployment Configuration
- Added [`vercel.json`](../vercel.json) targeting `pnpm --filter frontend build` with output directory `frontend/dist`.
- Provided root workspace scripts in [`package.json`](../package.json):
  - `pnpm dev`: Starts frontend Vite dev server
  - `pnpm build`: Builds production bundle
  - `pnpm preview`: Serves production preview
  - `pnpm typecheck`: Validates TypeScript types
  - `pnpm test`: Runs Vitest test suite

### 2.2 Telemetry & Quality Control
- Added automated verification harness [`tools/playtest.mjs`](../tools/playtest.mjs) for headless / headed Playwright regression validation (evaluating FPS, draw calls, memory leaks, weapon mechanics, and wave lifecycle).
- Unit test suite [`frontend/game/waves.test.ts`](../frontend/game/waves.test.ts) covering enemy lifecycle, scene cleanup, and restart guarantees.

---

## 3. RSI Evolution Roadmap

- [x] **Round 1: Baseline Stabilization & Bug Elimination**
  - Fix enemy corpse scene graph leak.
  - Fix pickup ground positioning.
  - Set up build, test, and Vercel deployment pipeline.
- [ ] **Round 2: Combat Feel & Weapon Tuning**
  - Enhanced crosshair reactivity and recoil kick impulse.
  - Enemy hit sparks and directional blood/plasma splatter.
- [ ] **Round 3: Map Expansion & Environmental Interaction**
  - Expand neon club interior and warehouse interior with interactive destructibles.
  - Additional jump pad routes and vertical flanking paths.
- [ ] **Round 4: Advanced AI Behaviors & Boss Mechanics**
  - Enforcer shield ricochet mechanics and flanker behavior.
  - Multi-phase Boss combat patterns with telegraph warning zones.
- [ ] **Round 5: Audio Visual Sync**
  - Audio-reactive neon grid pulsation synced with synthwave BPM bass drops.

---

## 4. Round 1 Self-Assessment & Verification Results

### 4.1 Automated Production Playtest (`tools/playtest.mjs`)
- **Target Production Environment**: `https://retro-hotline.vercel.app`
- **Verification Timestamp**: `2026-11-07T16:00:05Z`
- **Result**: **14 / 14 checks passed (100%), 0 console/page errors**

| Regression & Health Check | Result | Evidence / Metrics |
|---|---|---|
| `start → playing` | PASS | `status: playing` |
| `weapon swap Q (rifle → deagle → rifle)` | PASS | `weapon: rifle` |
| `fire (LMB) consumes ammo` | PASS | `ammo: 32 → 27` |
| `reload R refills mag` | PASS | `reloading: true → ammo: 32` |
| `punch F triggers cooldown` | PASS | `punchCd: 0.50s` |
| `slide C while moving` | PASS | `slideT: 0.47s, moved: 7.05m` |
| `enemies spawn & killable` | PASS | `kills: 3, peakEnemies: 1, shots: 21, wave: 1` |
| `no enemy corpses after kills` | PASS | `enemies: 0, extra: 0` |
| `zone travel keeps playing` | PASS | `Plaza, Courtyard, Bridge: 60 FPS` |
| `pause / resume` | PASS | `status: paused → playing` |
| `death → game over → restart` | PASS | `over: true → status: playing, health: 100` |
| `restart clears enemies (scene back to fresh size)` | PASS | `leakedObjects: 0, sceneObjects: 273 (identical to fresh run)` |
| `GPU geometries do not leak across restart` | PASS | `geometries: 229 <= 239 limit` |
| `music never restarted (monotonic step)` | PASS | `step: 0 → 141, ctx: running` |

### 4.2 Frame Rate & Performance Benchmark
- **Menu Cinematic**: 60.0 FPS (p95: 17.5ms, drawCalls: 1, sceneObjects: 273)
- **Combat Intensity**: 60.0 FPS (p95: 17.5ms, drawCalls: 1, sceneObjects: 308)
- **Zone - South Plaza**: 60.0 FPS (p95: 17.5ms, drawCalls: 1, sceneObjects: 298)
- **Zone - North Courtyard**: 60.0 FPS (p95: 17.9ms, drawCalls: 1, sceneObjects: 303)
- **Zone - Bridge Deck**: 60.0 FPS (p95: 17.6ms, drawCalls: 1, sceneObjects: 308)
- **Post-Restart Fresh Run**: 60.0 FPS (p95: 17.6ms, drawCalls: 1, sceneObjects: 303)

### 4.3 Dimension Scoring (Weighted Assessment)

| Dimension | Weight | Score | Evaluation & Evidence |
|---|---:|---:|---|
| **战斗手感与可玩性** | 30% | **9.2 / 10** | 双武器切换灵敏，滑铲冲撞有位移且与移动状态严密绑定，拳击击退有效；命中与击杀反馈清晰。 |
| **场景与探索体验** | 20% | **8.8 / 10** | 跨区域（南广场、中轴大桥、北庭院）无卡顿切换，跳板弹射正常，固定宝箱和战斗掉落均准确贴地。 |
| **画面清晰度与美术** | 15% | **9.0 / 10** | 霓虹发光与线框材质层次分明，Bloom 适度，全场景保持 0 控制台着色器警告。 |
| **音乐连续性与音效** | 15% | **9.6 / 10** | WebAudio 单例合成器状态连续，场景与死亡状态间强度动态过滤，步进计数单调递增，无硬切顿挫。 |
| **性能与稳定性** | 20% | **9.8 / 10** | 生产部署在 Vercel 极速响应，全流程稳定 60 FPS，彻底消除尸体泄漏（`leakedObjects = 0`），14 项回归 100% 通过。 |
| **综合加权得分** | 100% | **9.28 / 10** | **稳定合格，进入下一阶段自主进化。** |

