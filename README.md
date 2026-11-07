# RETRO HOTLINE (NEON BAY)

> **Miami Nights Protocol · 1989**
> A high-speed, neon-drenched browser FPS inspired by *Hotline Miami* aesthetics, featuring tight movement mechanics, dual weaponry, combo multipliers, and an original procedural WebAudio synthwave soundtrack.

---

## 🎮 Features

- **High-Octane Movement**: Sprint, slide kick through enemies, jump pads, and punch lunges.
- **Weapon Arsenal**:
  - **Pulse Rifle**: High fire-rate automatic neon blaster with armor chipping.
  - **Desert Eagle**: Heavy hand-cannon with armor-piercing capabilities, high critical damage, and hit-stop impact feel.
- **Dynamic Wave Director**: Diverse drone archetypes (Seeker, Brawler, Gunner, Enforcer, Marksman, Boss) with smart behaviors, laser sight telegraphing, and spatial audio cues.
- **Combo & Streak System**: Chain kills to climb multiplier tiers (`×2 DOUBLE UP!` to `×5 CARNAGE!`) with bullet-time slow-mo triggers.
- **Living Audio**:
  - 100% procedural WebAudio synthwave score with seamless intensity morphing between menu, intermission, and combat.
  - Directional stereo-panned sound effects for hostile attacks and proximity threats.
- **Vercel Ready**: Full single-command deployment support with modern Vite build pipeline.

---

## 🛠️ Tech Stack

- **Graphics**: [Three.js](https://threejs.org/) (Custom line primitives, glow sprites, post-processing bloom & ACES tone mapping)
- **Framework**: [React 19](https://react.dev/) + [Vite](https://vitejs.dev/)
- **Styling**: [Tailwind CSS](https://tailwindcss.com/)
- **Audio**: WebAudio API (Real-time procedural additive synthesis & lookahead scheduler)
- **Testing**: [Vitest](https://vitest.dev/)

---

## 🚀 Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (>= 18)
- [pnpm](https://pnpm.io/) (>= 9)

### Installation

```bash
pnpm install
```

### Running Locally

```bash
# Start development server
pnpm dev

# Type checking
pnpm typecheck

# Run unit tests
pnpm test
```

### Controls

| Action | Key / Input |
|---|---|
| **Move / Sprint** | `WASD` / `Shift` |
| **Shoot / Reload** | `LMB` / `R` |
| **Swap Weapon** | `Q` |
| **Melee Punch** | `F` or `RMB` |
| **Slide** | `C` or `Ctrl` |
| **Jump** | `Space` |
| **Toggle Music** | `M` |
| **Pause / Resume** | `Esc` / Click |

---

## 🐛 Bug Fixes & Improvements

- **Enemy Corpse & Entity Leak Fix**: Resolved issue where defeated enemy meshes, collider proxies, and laser sights remained in the Three.js scene hierarchy or leaked references during restarts and wave resets.
- **Particle & Resource Recycling**: Added full cleanup of particle buffers, shockwaves, and slide hit sets on player restart.
- **Pickups & Cache Spot Alignment**: Corrected world positioning logic for hidden exploration caches and combat drops.
- **Post-Processing & Visual Clarity**: Balanced bloom passes and tone mapping for readable target acquisition while preserving neon aesthetic.

---

## 📄 License

MIT
