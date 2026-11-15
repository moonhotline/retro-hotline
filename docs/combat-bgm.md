# Combat BGM suite

The game defaults to **NEON COMBAT SUITE**: warm arpeggio (61.44 s), original combat (30.72 s), then signature melody / Trap (61.44 s). The complete loop is **153.60 s / 80 bars / 125 BPM**.

`frontend/public/audio/bgm_combat.wav` is the stereo 44.1 kHz / 16-bit master. `bgm_combat.ogg` is the 192 kbps Ogg/Opus playback copy. `combat_suite.json` records source hashes, gain changes, transitions and output hashes.

Each source is matched to approximately −14 LUFS. At 0, 61.44 and 92.16 seconds, a 0.96-second raised-cosine transition blends the outgoing loop's first half-bar into the incoming source's first half-bar. Both downbeats remain aligned. No bars are removed, and the Trap-to-warm return is included at the suite loop boundary. This avoids the tempo shift caused by simply overlapping file endings and shortening the playlist.

## Playback

The first user gesture starts the existing WebAudio engine. While the studio file loads, the procedural score remains available; after decoding, one looping `AudioBufferSourceNode` fades in and the procedural buses fade out. There are no separate downloads or JS timers at transitions. Volume and mute share the same master bus. Intermission filtering, impact filter drops and time dilation apply to combat. Repeated starts, pauses, restarts and intensity changes do not restart the suite. A network/decode failure retains procedural music. Disposal aborts loading and releases audio resources.

Press **N** to cycle the suite and the three original procedural alternatives. Selection is persisted with the existing player profile; default index 0 now selects the studio suite. The original `SynthMusic` voices and sound effects remain intact.

## Rebuild

Requires Python, NumPy and FFmpeg with libopus. Supply the three approved source WAVs (their hashes are in the manifest):

```sh
python3 tools/compose_combat_bgm.py \
  --warm /path/to/bgm_combat_warm_arp_rework_125bpm_61s.wav \
  --original /path/to/bgm_combat.wav \
  --trap /path/to/bgm_combat_signature_trap_v2_125bpm_61s.wav
python3 tools/generate_audio.py --verify-only
```

The source `--original` must be the 30.72-second source master, not the replaced 153.60-second suite. The general procedural audio generator preserves and verifies the studio combat master instead of overwriting it. Other procedural assets retain their existing generator.

## Esc standby music

`bgm_menu.wav` is the supplied `01_menu_mist_105bpm.wav` (50.285714 s, 105 BPM), copied without audio processing; SHA256 `e950c754d0d0f43c066622fccd73b60da3c86d38ef5e3d58cdded0f3a049b5a5`. Intensity 0 (menu / Esc pause) enables this loop and fades combat out. Resuming play restores the selected combat music. Both decoded loops keep their clocks through switching; Mist uses the shared volume/mute bus without the combat low-pass filter. Failed loads retain procedural ambience. The three combat inputs above are already the supplied Downloads files and remain unchanged.
