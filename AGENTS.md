# AGENTS.md — Autonomous Agent Directives for Retro Hotline / Neon Bay

This document establishes the mandatory operational protocols and constraints for all AI coding agents working on this repository.

---

## 1. Automated Workflow Mandate (STRICT: Never Wait for User Prompts)

Whenever you complete a feature, bug fix, redesign, or refactor:
1. **Verification**:
   - Run tests: `./node_modules/.bin/vitest run` (100% pass required).
   - Run TypeScript check: `cd frontend && ./node_modules/.bin/tsc --noEmit` (exit code 0 required).
   - Run production build: `cd frontend && ./node_modules/.bin/vite build` (must succeed).
2. **Commit & Push**:
   - Stage and commit with clean, conventional commit messages (`feat: ...`, `fix: ...`, `refactor: ...`).
   - Push branch to remote `origin`.
3. **PR Submission & Auto-Merge**:
   - Automatically open or update the Pull Request targeting `main` via `gh pr create` or `gh pr view`.
   - Automatically merge the PR into `main` (using `gh pr merge --merge` or `gh pr merge --squash`).
4. **Vercel Deployment Verification**:
   - Verify deployment status via `vercel ls` or Vercel API.
   - Confirm that the production deployment status reaches `● Ready`.
   - If any deployment failure occurs, diagnose, fix, and verify immediately.
5. **No Reminders Needed**:
   - **Do NOT ask the user if you should submit, merge, or check Vercel deployment.**
   - Execute this end-to-end pipeline autonomously every single time.

---

## 2. Design System & UX Constraints

- **PS5 Console Aesthetic**:
  - Deep obsidian dark background (`#060810` / `#0d1226`) with ambient floating ribbons (`ps5-ambient-ribbon`).
  - High-contrast console controls (PlayStation button glyphs: `✕`, `○`, `△`, `◻︎`).
  - Native modal dialogs with backdrop blur (`backdrop:bg-black/75 backdrop:backdrop-blur-md`).
- **ABSOLUTELY ZERO EMOJIS**:
  - Under no circumstances should emojis (such as 🎮, 🔍, ⚙, ♪, 🎧, etc.) be added to UI components, buttons, or HUD text.
  - All icons must be pure SVG vector paths or PlayStation glyphs.
- **ABSOLUTELY ZERO TEXT DUMPING (禁止堆砌文字)**:
  - Do not place long narrative paragraphs, backstory essays, or walls of marketing copy on the console standby or dashboard UI.
  - Keep badges punchy and concise (e.g. `PS5™ PRO ENHANCED`, `120 FPS`, `TEMPEST 3D AUDIO`).
  - Activity tiles must remain crisp, structured, and minimal.
  - 商店文案只保留短商品名、直接效果、价格与购买/离开操作；禁止重复描述、营销段落、角色头衔和多层双语标签堆叠。商店打开后直接展示商品，不用对白阻挡购买。

---

## 3. Audio Architecture & Safety Rules

- **Procedural WebAudio Synthesis**:
  - Never overwrite or discard procedural WebAudio synthesis in `frontend/game/music.ts` (`SynthMusic`).
  - Studio WAV soundtracks in `frontend/public/audio/` (`bgm_menu.wav`, `bgm_combat.wav`) exist as high-fidelity alternatives, not replacements.
- **Protected Sound Effects**:
  - `sfx_combo_pickup.wav` (crystal chime / combo multiplier pickup) is user-approved and must remain untouched.
  - Any regenerated sound effects (`sfx_laser_shoot.wav`, `sfx_heavy_cannon.wav`, `sfx_enemy_explosion.wav`, `sfx_player_hit.wav`) must follow high-fidelity synthesis formulas (clean attack, zero DC offset, peak normalized).

---

## 4. Permanent Controls & Asset Quality Rules (STRICT)

- **PERMANENTLY BANNED KEYS & MECHANICS (NEVER RE-ADD)**:
  - The **`V`**, **`C`**, **`ControlLeft`**, and **`G`** keybindings — and all **Pulse Parry**, **Slide**, and **Kinetic Slam** gameplay logic, HUD pills, and controls manual entries — are **PERMANENTLY DELETED** and must **NEVER** be added back in any future iteration.
  - Core combat controls stay streamlined: `W A S D` (move/drive), `SPACE` (jump / wall climb / drift), `SHIFT` (phase dash / nitrous), `LMB` (fire), `RMB` (zoom / melee), `E` (glory kill / interact / enter-exit vehicle), `F` (sniper hack / melee), `Q / 1-4` (swap weapon), `R` (reload).
- **Route B Procedural Industrial Craft**:
  - Avoid raw low-poly geometric primitives (`BoxGeometry`, `OctahedronGeometry`, `TetrahedronGeometry`, `DodecahedronGeometry`) for visible foreground hero assets and enemies; use continuous multi-section lofted/curved/beveled procedural Three.js geometry and GLSL optical shaders.

---

## 5. Testing & Playtest Protocol

- All core combat systems (glory kills, phase dash, hitstop, sniper hack, neon hacks, vehicle driving) must have matching unit tests in `frontend/game/*.test.ts`.
- Mocks in tests must match the public API of `SynthMusic` and `SoundEffects` (`setVolume`, `setMuted`, `setComboRank`, `triggerFilterDrop`).
