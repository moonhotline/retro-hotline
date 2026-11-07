# Retro Hotline — project facts

Last reviewed: 2026-11-08 (Asia/Shanghai).

> Retro Hotline is a single-player 3D browser FPS featuring dual weapons, slide kicks, melee combat, stagger-based glory kills, wave survival and a procedural WebAudio synthwave soundtrack.

## Identity

- Official project: **Retro Hotline**.
- Other names used by the project: **NEON BAY**, **Bay Bridge Shooter**.
- Official playable URL: https://retro.oodai.space/
- Repository: https://github.com/moonhotline/retro-hotline
- Maintainer: [moonhotline](https://github.com/moonhotline).
- Category: browser game, first-person shooter, arcade wave survival.
- Input: desktop keyboard and mouse; pointer-lock aiming.
- Current code location: [feat/game-evolution](https://github.com/moonhotline/retro-hotline/tree/feat/game-evolution), tracked in [PR #1](https://github.com/moonhotline/retro-hotline/pull/1).
- This review establishes source presence and the visible live menu, not a new full gameplay certification.

## Current source and evidence

| Fact | Evidence at reviewed source revision |
| --- | --- |
| React 19, Three.js, Vite and TypeScript | [frontend/package.json](https://github.com/moonhotline/retro-hotline/blob/3abaa7f0233bec6b3a5583d368ef6d707c15c4b1/frontend/package.json) |
| Keyboard/mouse controls, two weapons and game states | [GamePage.tsx](https://github.com/moonhotline/retro-hotline/blob/3abaa7f0233bec6b3a5583d368ef6d707c15c4b1/frontend/pages/GamePage.tsx) |
| Stagger-based glory kills | [gloryKill.ts](https://github.com/moonhotline/retro-hotline/blob/3abaa7f0233bec6b3a5583d368ef6d707c15c4b1/frontend/game/combat/gloryKill.ts) |
| Enemy waves and archetypes | [waves.ts](https://github.com/moonhotline/retro-hotline/blob/3abaa7f0233bec6b3a5583d368ef6d707c15c4b1/frontend/game/waves.ts) |
| Code-built world with randomized elements | [map.ts](https://github.com/moonhotline/retro-hotline/blob/3abaa7f0233bec6b3a5583d368ef6d707c15c4b1/frontend/game/map.ts) |
| Procedural original dark synthwave score | [music.ts](https://github.com/moonhotline/retro-hotline/blob/3abaa7f0233bec6b3a5583d368ef6d707c15c4b1/frontend/game/music.ts) |
| Bundled WAV files also exist | [public/audio](https://github.com/moonhotline/retro-hotline/tree/3abaa7f0233bec6b3a5583d368ef6d707c15c4b1/frontend/public/audio) |

The live menu was observed with the NEON BAY / NO MERCY EDITION title, desktop controls, a START button, a glory-kill control and a WebAudio music credit.

## Development direction

Seeded modular districts, richer solid architecture, extra traversal skills, environmental executions and Roguelite build progression are planned or exploratory. The concept cover illustrates this direction, not current gameplay rendering.

There are no published claims here about player counts, awards, benchmark guarantees, multiplayer, touch support or a released seeded level generator. The previous README declared MIT, but no standalone LICENSE file was present at this review.

## 中文摘要

Retro Hotline 是单人霓虹风格的 3D 网页 FPS，游戏内曾使用 NEON BAY / Bay Bridge Shooter 名称。当前源码包含双武器、滑铲、近战、失衡处决、波次战斗和 WebAudio 配乐。程序化关卡生成、更多技能和 Roguelite 构筑属于后续开发方向。宣传封面是概念图。

## Media

- [Concept cover](../assets/retro-hotline-cover.jpg): AI-generated artwork adapted from the owner-selected Retro Hotline image; not an in-engine screenshot.
- [Live game](https://retro.oodai.space/): source for the current playable presentation.
