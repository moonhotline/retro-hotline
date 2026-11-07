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
