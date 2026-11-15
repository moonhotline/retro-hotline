#!/usr/bin/env python3
"""Render Bay-Bridge-Shooter's original soundtrack and SFX using only the stdlib.

    python3 tools/generate_audio.py
    python3 tools/generate_audio.py --verify-only

Menu uses sixteen complete 4/4 bars (38.40 s at 100 BPM). Combat is the approved
80-bar studio suite (153.60 s at 125 BPM); rebuild it with compose_combat_bgm.py.
Note releases and effect returns wrap onto the beginning of each loop, including
the mastering filter state. No fade-to-silence is applied to the music seam.
SFX are mono for positional playback; music is true stereo with centered bass.
"""

import argparse
from array import array
import math
from pathlib import Path
import random
import struct
import wave


RATE = 44100
TAU = 2.0 * math.pi
DEFAULT_OUTPUT = Path(__file__).resolve().parents[1] / "frontend/public/audio"
# name: (duration, channels, peak ceiling, tempo)
ASSETS = {
    "bgm_menu.wav": (38.40, 2, 0.84, 100),
    "bgm_combat.wav": (153.60, 2, 0.90, 125),
    "sfx_laser_shoot.wav": (0.30, 1, 0.89, None),
    "sfx_heavy_cannon.wav": (0.82, 1, 0.93, None),
    "sfx_enemy_explosion.wav": (1.80, 1, 0.91, None),
    "sfx_combo_pickup.wav": (1.30, 1, 0.83, None),
    "sfx_player_hit.wav": (0.62, 1, 0.88, None),
}


def frames(seconds):
    return round(seconds * RATE)


def silence(length):
    return array("d", [0.0]) * length


def frequency(midi):
    return 440.0 * 2.0 ** ((midi - 69.0) / 12.0)


def edge_envelope(t, duration, attack=0.003, release=0.025):
    """Raised-cosine attack/release suppress clicks without blunting the body."""
    a = min(1.0, max(0.0, t / attack))
    r = min(1.0, max(0.0, (duration - t) / release))
    return (0.5 - 0.5 * math.cos(math.pi * a)) * (
        0.5 - 0.5 * math.cos(math.pi * r)
    )


def saw(phase, step):
    """PolyBLEP saw: correct the discontinuity instead of aliasing a raw ramp."""
    phase %= 1.0
    value = 2.0 * phase - 1.0
    if phase < step:
        x = phase / step
        value -= x + x - x * x - 1.0
    elif phase > 1.0 - step:
        x = (phase - 1.0) / step
        value -= x * x + x + x + 1.0
    return value


def synth_note(midi, duration, voice):
    """Detuned analog pads, filtered pulse bass, plucks and additive glass."""
    f = frequency(midi)
    step = f / RATE
    result = silence(frames(duration))
    low = 0.0
    for i in range(len(result)):
        t = i / RATE
        p = f * t
        if voice == "pad":
            raw = (
                0.36 * saw(p * 0.9982, step * 0.9982)
                + 0.36 * saw(p * 1.0018 + 0.19, step * 1.0018)
                + 0.34 * math.sin(TAU * p)
            )
            low += 0.12 * (raw - low)
            env = edge_envelope(t, duration, 0.19, 0.68)
            result[i] = low * env * (0.94 + 0.06 * math.sin(TAU * t / 2.4))
        elif voice in ("bass", "soft_bass"):
            soft = voice == "soft_bass"
            cutoff = (280.0 if soft else 650.0) + 1900.0 * math.exp(-t / 0.045)
            coefficient = 1.0 - math.exp(-TAU * cutoff / RATE)
            raw = 0.65 * saw(p, step) + 0.15 * saw(p * 1.003, step * 1.003)
            low += coefficient * (raw - low)
            env = edge_envelope(t, duration, 0.004, 0.04)
            env *= 0.65 + 0.35 * math.exp(-t / 0.09)
            result[i] = (0.65 * low + 0.55 * math.sin(TAU * p)) * env
        elif voice == "arp":
            raw = 0.65 * saw(p, step) + 0.28 * math.sin(TAU * p * 2.0)
            low += 0.26 * (raw - low)
            env = edge_envelope(t, duration, 0.0025, 0.035) * math.exp(-t / 0.10)
            result[i] = low * env
        elif voice == "shimmer":
            raw = 0.70 * math.sin(TAU * p) + 0.25 * math.sin(TAU * p * 2.0) + 0.20 * saw(p * 1.002, step * 1.002)
            env = edge_envelope(t, duration, 0.002, 0.03) * math.exp(-t / 0.14)
            result[i] = raw * env
        elif voice == "lead":
            vib_depth = 0.003 * min(1.0, max(0.0, (t - 0.16) / 0.3))
            # Phase modulation keeps vibrato depth independent of note length.
            vib = math.sin(TAU * 5.2 * t) * (f * vib_depth / 5.2)
            p_mod = p + vib
            raw = (
                0.45 * saw(p_mod * 0.998, step * 0.998)
                + 0.45 * saw(p_mod * 1.002 + 0.15, step * 1.002)
                + 0.25 * math.sin(TAU * p_mod)
            )
            low += 0.22 * (raw - low)
            env = edge_envelope(t, duration, 0.025, 0.08)
            result[i] = low * env
        elif voice in ("glass", "menu_glass"):
            raw = (
                math.sin(TAU * p)
                + 0.36 * math.sin(TAU * p * 2.0) * math.exp(-t / 0.24)
                + 0.16 * math.sin(TAU * p * 3.0) * math.exp(-t / 0.13)
                + 0.08 * math.sin(TAU * p * 6.0) * math.exp(-t / 0.08)
            )
            # Keep the approved pickup SFX glass voice byte-reproducible.
            decay, release = (0.42, 0.12) if voice == "menu_glass" else (0.38, 0.1)
            result[i] = raw * math.exp(-t / decay) * edge_envelope(t, duration, 0.003, release)
        else:
            raise ValueError(f"Unknown voice: {voice}")
    return result


def drum(kind, seed):
    rng = random.Random(seed)
    duration = {"kick": 0.36, "snare": 0.25, "hat": 0.085, "open_hat": 0.27}[kind]
    out = silence(frames(duration))
    low = 0.0
    for i in range(len(out)):
        t = i / RATE
        noise = rng.uniform(-1.0, 1.0)
        low += (0.16 if kind in ("hat", "open_hat") else 0.38) * (noise - low)
        high = noise - low
        if kind == "kick":
            phase = TAU * (48.0 * t + 145.0 * 0.018 * (1.0 - math.exp(-t / 0.018)))
            body = math.tanh(1.35 * math.sin(phase)) * math.exp(-t / 0.095)
            value = body + 0.20 * high * math.exp(-t / 0.006)
        elif kind == "snare":
            body = (math.sin(TAU * 182.0 * t) + 0.45 * math.sin(TAU * 321.0 * t))
            value = 0.35 * body * math.exp(-t / 0.035)
            value += 0.90 * (0.6 * high + 0.4 * low) * math.exp(-t / 0.060)
            value += 0.14 * high * math.exp(-((t - 0.014) / 0.009) ** 2)
        else:
            decay = 0.022 if kind == "hat" else 0.085
            metal = math.sin(TAU * 6311 * t) * math.sin(TAU * 4117 * t)
            value = (0.85 * high + 0.15 * metal) * math.exp(-t / decay)
        out[i] = value * edge_envelope(t, duration, 0.0007, 0.018)
    return out


class StereoLoop:
    def __init__(self, duration):
        self.length = frames(duration)
        self.channels = [silence(self.length), silence(self.length)]

    def add(self, samples, start, gain=1.0, pan=0.0):
        """Equal-power pan, with full note tails wrapped across the seam."""
        offset = frames(start)
        left = gain * math.cos((pan + 1.0) * math.pi / 4.0)
        right = gain * math.sin((pan + 1.0) * math.pi / 4.0)
        for i, value in enumerate(samples):
            j = (offset + i) % self.length
            self.channels[0][j] += left * value
            self.channels[1][j] += right * value

    def ambience(self, beat):
        """Tempo delay and diffuse short room returns, all circular/periodic."""
        dry = [array("d", channel) for channel in self.channels]
        taps = [(0.75 * beat, 0.20), (1.5 * beat, 0.105), (2.25 * beat, 0.055)]
        taps += [(0.043, 0.065), (0.071, 0.055), (0.113, 0.043), (0.173, 0.030)]
        for tap_index, (delay, gain) in enumerate(taps):
            offset = frames(delay)
            for ch in range(2):
                source = dry[1 - ch] if tap_index % 2 == 0 else dry[ch]
                target = self.channels[ch]
                for i in range(self.length):
                    target[i] += gain * source[(i - offset) % self.length]

    def duck(self, beat, depth):
        for i in range(self.length):
            phase = (i / RATE) % beat
            gain = 1.0 - depth * math.exp(-phase / 0.085)
            # Ramp into each kick to avoid a discontinuity in the sidechain.
            if phase > beat - 0.012:
                blend = (phase - (beat - 0.012)) / 0.012
                gain = gain * (1.0 - blend) + (1.0 - depth) * blend
            self.channels[0][i] *= gain
            self.channels[1][i] *= gain


def soundtrack(combat=False):
    bpm = 125 if combat else 100
    beat = 60.0 / bpm
    loop = StereoLoop(64.0 * beat)

    if combat:
        # 16-bar cinematic synthwave progression in D minor:
        # Section A (Bars 0-7): Driving retro synthwave groove with rich 9th/7th harmonies
        # Dm9 -> Bbmaj7 -> Fmaj7 -> Cadd9 -> Gm7 -> Dm7/F -> Em7b5 -> A7(b13)
        # Section B (Bars 8-15): Melodic elevation, triumphant yet dark emotional climax
        # Bbmaj9 -> C9 -> Dm9 -> Am7 -> Gm9 -> Bbmaj7#11 -> F/A -> A7sus4/A7
        chords = [
            (62, 65, 69, 76), (58, 62, 65, 69), (60, 64, 65, 69), (60, 62, 67, 72),
            (58, 62, 65, 67), (57, 62, 65, 69), (58, 62, 64, 67), (57, 61, 65, 67),
            (58, 62, 65, 69), (60, 64, 67, 70), (62, 65, 69, 76), (60, 64, 67, 69),
            (58, 62, 65, 69), (58, 64, 65, 69), (57, 60, 65, 69), (57, 62, 64, 67),
        ]
        roots = [38, 34, 41, 36, 43, 41, 40, 33, 34, 36, 38, 45, 43, 34, 45, 33]

        for bar, chord in enumerate(chords):
            start = bar * 4.0 * beat
            for voice, note in enumerate(chord):
                loop.add(synth_note(note, 4.0 * beat + 0.68, "pad"), start,
                         0.10, [-0.75, 0.45, -0.35, 0.78][voice])

        arp_patterns = [
            [0, 2, 1, 3, 2, 1, 0, 2, 0, 1, 3, 2, 1, 2, 3, 1],
            [0, 1, 2, 3, 2, 3, 1, 2, 0, 2, 3, 2, 1, 0, 1, 2],
            [1, 2, 3, 2, 3, 1, 2, 3, 2, 3, 1, 2, 0, 1, 2, 3],
            [3, 2, 1, 2, 3, 1, 2, 3, 2, 1, 0, 1, 2, 3, 2, 1],
        ]
        for bar, chord in enumerate(chords):
            start = bar * 4.0 * beat
            pattern = arp_patterns[bar // 4]
            for step, index in enumerate(pattern):
                pan1 = -0.42 + 0.18 * math.sin(step * math.pi / 4.0)
                gain1 = 0.15 if step % 4 == 0 else 0.11
                loop.add(synth_note(chord[index] + 12, beat * 0.42, "arp"),
                         start + step * beat / 4.0, gain1, pan1)
                if step % 2 == 1 or (bar >= 8 and step % 4 == 2):
                    pan2 = 0.48 + 0.16 * math.cos(step * math.pi / 4.0)
                    shimmer_note = chord[(index + 1) % 4] + 24
                    loop.add(synth_note(shimmer_note, beat * 0.35, "shimmer"),
                             start + step * beat / 4.0, 0.08 if bar < 8 else 0.11, pan2)

        combat_melody = [
            (6.0, 76, 1.8, 0.16), (8.0, 77, 1.5, 0.18), (10.0, 76, 1.0, 0.15),
            (11.0, 74, 1.2, 0.17), (13.0, 72, 1.5, 0.16), (15.0, 74, 1.8, 0.18),
            (18.0, 74, 1.0, 0.16), (19.0, 76, 1.0, 0.17), (20.0, 77, 1.5, 0.19),
            (22.0, 76, 1.0, 0.16), (23.0, 74, 1.0, 0.16), (25.0, 73, 1.5, 0.18),
            (27.0, 74, 1.5, 0.18), (29.0, 76, 2.5, 0.20),
            (32.0, 77, 2.0, 0.24), (34.5, 76, 1.2, 0.22), (36.0, 74, 1.8, 0.23),
            (38.0, 76, 1.0, 0.21), (39.0, 77, 1.0, 0.23), (40.0, 81, 2.8, 0.26),
            (43.0, 79, 1.2, 0.22), (44.5, 77, 1.2, 0.21), (46.0, 76, 1.8, 0.20),
            (48.5, 74, 1.2, 0.22), (50.0, 77, 1.5, 0.24), (52.0, 81, 2.0, 0.25),
            (54.5, 80, 1.2, 0.22), (56.0, 77, 1.5, 0.22), (58.0, 76, 1.2, 0.21),
            (59.5, 74, 1.2, 0.21), (61.0, 73, 1.8, 0.23), (63.0, 74, 1.5, 0.22),
        ]
        for pos_beat, note, dur_beats, gain in combat_melody:
            loop.add(synth_note(note, dur_beats * beat, "lead"),
                     pos_beat * beat, gain, 0.10 * math.sin(pos_beat))

        loop.ambience(beat)

        for bar, root in enumerate(roots):
            for step in range(8):
                accent = [1.0, 0.52, 0.80, 0.48, 1.0, 0.55, 0.80, 0.63][step]
                pitch = root + ([0, 0, 12, 0, 0, 7, 12, 7][step] if bar >= 4 else 0)
                loop.add(synth_note(pitch, beat * 0.44, "bass"),
                         (bar * 4.0 + step / 2.0) * beat, 0.42 * accent)
        loop.duck(beat, 0.38)

        for bar in range(16):
            for step in range(4):
                loop.add(drum("kick", 1000 + bar * 4 + step), (bar * 4 + step) * beat, 0.78)
                if step in (1, 3):
                    loop.add(drum("snare", 2000 + bar * 4 + step), (bar * 4 + step) * beat, 0.48, 0.05)
            for step in range(8):
                kind = "open_hat" if step in (3, 7) and bar >= 4 else "hat"
                gain = 0.11 if step % 2 else 0.075
                loop.add(drum(kind, 3000 + bar * 8 + step), (bar * 4 + step / 2.0) * beat,
                         gain, 0.30 if step % 2 else -0.24)
            if bar in (3, 7, 11, 15):
                for step in (14, 15):
                    loop.add(drum("snare", 4000 + bar * 16 + step),
                             (bar * 4 + step / 4.0) * beat, 0.14 + 0.04 * (step - 14), -0.12)
            if bar == 15:
                for step in (12, 13):
                    loop.add(drum("snare", 4500 + step),
                             (bar * 4 + step / 4.0) * beat, 0.12, 0.10)
    else:
        menu_chords = [
            (62, 65, 69, 76), (58, 62, 65, 69), (58, 62, 65, 67), (57, 62, 64, 67),
            (62, 65, 69, 72), (60, 64, 65, 69), (58, 64, 65, 69), (57, 61, 64, 70),
            (58, 62, 65, 69), (60, 62, 67, 72), (60, 64, 67, 69), (62, 65, 69, 76),
            (58, 62, 65, 67), (58, 61, 65, 68), (57, 60, 65, 69), (57, 61, 64, 67),
        ]
        menu_roots = [38, 34, 43, 33, 38, 41, 34, 33, 34, 36, 45, 38, 43, 34, 45, 33]

        for bar, chord in enumerate(menu_chords):
            start = bar * 4.0 * beat
            for voice, note in enumerate(chord):
                loop.add(synth_note(note, 4.0 * beat + 0.85, "pad"), start,
                         0.20, [-0.75, 0.45, -0.35, 0.78][voice])

        menu_melody = [
            (1.0, 76, 2.2, 0.14, -0.35), (2.75, 74, 1.4, 0.12, 0.35), (4.5, 69, 1.8, 0.13, -0.25),
            (6.0, 72, 1.4, 0.14, 0.30), (7.25, 74, 1.6, 0.15, -0.30), (9.0, 77, 2.0, 0.16, 0.40),
            (11.0, 76, 1.2, 0.13, -0.20), (12.5, 74, 1.5, 0.13, 0.25), (14.5, 73, 2.2, 0.15, -0.35),
            (17.0, 76, 1.8, 0.15, 0.35), (19.0, 77, 1.6, 0.16, -0.35), (20.5, 81, 2.4, 0.18, 0.45),
            (23.0, 79, 1.5, 0.15, -0.25), (25.0, 76, 1.8, 0.15, 0.30), (26.5, 77, 1.4, 0.16, -0.35),
            (28.0, 81, 2.2, 0.17, 0.40), (30.0, 74, 1.5, 0.14, -0.30), (31.25, 73, 2.0, 0.15, 0.25),
            (33.0, 81, 2.4, 0.18, -0.40), (35.25, 77, 1.5, 0.15, 0.35), (36.5, 76, 1.5, 0.14, -0.25),
            (38.0, 79, 2.0, 0.16, 0.35), (40.25, 74, 1.4, 0.14, -0.30), (41.5, 76, 1.8, 0.15, 0.25),
            (43.0, 76, 1.5, 0.14, -0.35), (44.5, 72, 1.5, 0.13, 0.30), (46.0, 74, 2.2, 0.16, -0.25),
            (49.0, 81, 2.2, 0.18, 0.40), (51.25, 77, 1.5, 0.15, -0.35), (52.5, 74, 1.5, 0.14, 0.25),
            (54.0, 80, 2.4, 0.17, -0.40), (56.5, 77, 1.5, 0.15, 0.30), (58.0, 76, 1.8, 0.15, -0.30),
            (60.0, 69, 1.5, 0.13, 0.25), (61.5, 73, 2.0, 0.16, -0.35), (63.25, 74, 1.8, 0.15, 0.30),
        ]
        for pos_beat, note, dur_beats, gain, pan in menu_melody:
            loop.add(synth_note(note, dur_beats * beat, "menu_glass"), pos_beat * beat, gain, pan)

        loop.ambience(beat)

        for bar, root in enumerate(menu_roots):
            for step in range(8):
                accent = [1.0, 0.48, 0.75, 0.45, 0.95, 0.50, 0.75, 0.55][step]
                loop.add(synth_note(root, beat * 0.44, "soft_bass"),
                         (bar * 4.0 + step / 2.0) * beat, 0.29 * accent)
        loop.duck(beat, 0.14)

        for bar in range(16):
            for step in (0, 2):
                loop.add(drum("kick", 1000 + bar * 4 + step), (bar * 4 + step) * beat, 0.26)
            for step in (1, 3):
                loop.add(drum("snare", 2000 + bar * 4 + step), (bar * 4 + step) * beat, 0.07, 0.05)
            for step in range(8):
                loop.add(drum("hat", 3000 + bar * 8 + step), (bar * 4 + step / 2.0) * beat,
                         0.035, 0.30 if step % 2 else -0.24)

    return loop.channels


def add_mono(destination, source, delay, gain):
    offset = frames(delay)
    for i in range(min(len(source), len(destination) - offset)):
        destination[offset + i] += gain * source[i]


def sound_effect(name):
    duration = ASSETS[name][0]
    out = silence(frames(duration))
    rng = random.Random(811 + list(ASSETS).index(name))
    low = rumble = 0.0
    if name == "sfx_combo_pickup.wav":
        # Each ascending note is a root/fifth pair with bell overtones.
        for step, note in enumerate((74, 77, 81, 86)):
            for pitch, gain in ((note, 0.38), (note + 7, 0.18)):
                add_mono(out, synth_note(pitch, 0.88, "glass"), step * 0.105, gain)
        dry = array("d", out)
        add_mono(out, dry, 0.147, 0.16)
        add_mono(out, dry, 0.294, 0.07)
    else:
        for i in range(len(out)):
            t = i / RATE
            noise = rng.uniform(-1.0, 1.0)
            low += 0.17 * (noise - low)
            rumble += 0.011 * (noise - rumble)
            high = noise - low
            if name == "sfx_laser_shoot.wav":
                # High-velocity cyberpunk pulse laser:
                # 1. Ultra-fast transient click (<1ms)
                snap = math.exp(-t / 0.002) * (1.0 if t < 0.001 else -1.0)
                # 2. Aggressive FM pitch plunge: carrier 3200Hz -> 240Hz, modulator 1600Hz -> 140Hz
                tau_c = 0.022
                phase_c = TAU * (240.0 * t + 2960.0 * tau_c * (1.0 - math.exp(-t / tau_c)))
                phase_m = TAU * (140.0 * t + 1460.0 * 0.020 * (1.0 - math.exp(-t / 0.020)))
                mod_index = 2.8 * math.exp(-t / 0.035)
                laser = math.sin(phase_c + mod_index * math.sin(phase_m)) * math.exp(-t / 0.055)
                # 3. Sub-bass punch tap (110Hz -> 45Hz)
                punch_phase = TAU * (45.0 * t + 65.0 * 0.025 * (1.0 - math.exp(-t / 0.025)))
                punch = math.sin(punch_phase) * math.exp(-t / 0.040)
                # 4. Ion plasma sizzle
                sizzle = high * math.exp(-t / 0.030) * (0.5 + 0.5 * math.sin(phase_c))
                value = 0.35 * snap + 0.85 * laser + 0.50 * punch + 0.28 * sizzle
            elif name == "sfx_heavy_cannon.wav":
                # Thunderous Desert Eagle / Hand-Cannon:
                # 1. Metallic hammer & firing pin crack
                hammer = math.sin(TAU * 4200 * t) * math.exp(-t / 0.006) if t < 0.03 else 0.0
                # 2. Sub-bass concussion boom: 160Hz -> 36Hz
                tau_b = 0.042
                phase_boom = TAU * (36.0 * t + 124.0 * tau_b * (1.0 - math.exp(-t / tau_b)))
                boom = math.tanh(2.6 * math.sin(phase_boom)) * math.exp(-t / 0.24)
                # 3. Gunpowder blast chamber roar
                blast = math.tanh(3.4 * low) * math.exp(-t / 0.12) + 1.3 * rumble * math.exp(-t / 0.38)
                # 4. Mechanical slide action & chamber rack
                slide = 0.0
                if t > 0.08:
                    t_slide = t - 0.08
                    slide = (0.30 * math.sin(TAU * 1920 * t_slide) + 0.20 * math.sin(TAU * 3450 * t_slide)) * math.exp(-t_slide / 0.08)
                value = 0.45 * hammer + 0.95 * boom + 0.75 * blast + 0.35 * slide
            elif name == "sfx_enemy_explosion.wav":
                # Multi-stage cinematic drone kill explosion:
                # 1. Instantaneous shockwave crack
                crack = math.tanh(4.2 * high) * math.exp(-t / 0.015)
                # 2. Deep fireball implosion / low boom: 130Hz -> 26Hz
                tau_f = 0.10
                phase_f = TAU * (26.0 * t + 104.0 * tau_f * (1.0 - math.exp(-t / tau_f)))
                fireball = 1.25 * math.tanh(2.2 * math.sin(phase_f)) * math.exp(-t / 0.45)
                # 3. Rolling explosive low rumble
                roll = 2.9 * rumble * (1.0 - math.exp(-t / 0.02)) * math.exp(-t / 0.65)
                # 4. Plasma battery sparks & secondary crackles
                sparks = 0.0
                for onset, freq, g in [(0.07, 1800, 0.35), (0.16, 2600, 0.28), (0.31, 1200, 0.22), (0.52, 850, 0.15)]:
                    if t >= onset:
                        age = t - onset
                        sparks += g * math.sin(TAU * freq * age) * math.exp(-age / 0.035) * rng.uniform(0.6, 1.0)
                value = 0.65 * crack + 0.88 * fireball + 0.78 * roll + 0.35 * sparks
            elif name == "sfx_player_hit.wav":
                # Visceral body damage + shield shatter + tinnitus disorientation:
                # 1. Heavy blunt force chest thud: 95Hz -> 30Hz
                tau_h = 0.025
                phase_thud = TAU * (30.0 * t + 65.0 * tau_h * (1.0 - math.exp(-t / tau_h)))
                thud = math.tanh(2.9 * math.sin(phase_thud)) * math.exp(-t / 0.09)
                # 2. Kinetic shield fracture crunch
                fracture = math.tanh(3.6 * high) * math.exp(-t / 0.030)
                # 3. High-frequency shock tinnitus ring (3850 Hz)
                ring = math.sin(TAU * 3850 * t) * (1.0 - math.exp(-t / 0.015)) * math.exp(-t / 0.28)
                value = 0.92 * thud + 0.58 * fracture + 0.28 * ring
            else:
                raise ValueError(f"Unknown effect: {name}")
            out[i] = value * edge_envelope(t, duration, 0.0007, 0.07)
        dry = array("d", out)
        if name == "sfx_laser_shoot.wav":
            add_mono(out, dry, 0.065, 0.14)
            add_mono(out, dry, 0.115, 0.055)
        elif name == "sfx_heavy_cannon.wav":
            add_mono(out, dry, 0.057, 0.12)
            add_mono(out, dry, 0.109, 0.06)
        elif name == "sfx_enemy_explosion.wav":
            add_mono(out, dry, 0.083, 0.19)
            add_mono(out, dry, 0.179, 0.11)
        elif name == "sfx_player_hit.wav":
            add_mono(out, dry, 0.043, 0.11)
    return [out]


def highpass(samples, periodic):
    """Remove subsonic energy; warm state for a full period before loop output."""
    coefficient = math.exp(-TAU * 25.0 / RATE)
    previous_x = previous_y = 0.0
    if periodic:
        for value in samples:
            previous_y = coefficient * (previous_y + value - previous_x)
            previous_x = value
    result = silence(len(samples))
    for i, value in enumerate(samples):
        previous_y = coefficient * (previous_y + value - previous_x)
        previous_x = value
        result[i] = previous_y
    return result


def master(channels, ceiling, periodic):
    processed = []
    for channel in channels:
        # Gentle analog-style bus saturation, not hard clipping.
        saturated = array("d", (math.tanh(value * 1.15) for value in channel))
        filtered = highpass(saturated, periodic)
        if periodic:
            dc = sum(filtered) / len(filtered)
            for i in range(len(filtered)):
                filtered[i] -= dc
        else:
            # Apply this after echoes/filters so every one-shot ends cleanly.
            for i in range(len(filtered)):
                filtered[i] *= edge_envelope(i / RATE, len(filtered) / RATE, 0.0005, 0.045)
        processed.append(filtered)
    peak = max(abs(value) for channel in processed for value in channel)
    if not math.isfinite(peak) or peak < 1e-8:
        raise ValueError("Cannot master a silent or invalid render")
    gain = ceiling / peak
    for channel in processed:
        for i in range(len(channel)):
            channel[i] *= gain
    return processed


def write_wav(path, channels):
    """Explicit little-endian signed 16-bit PCM with seeded TPDF dither."""
    rng = random.Random(4410016)
    count = len(channels)
    payload = bytearray(len(channels[0]) * count * 2)
    offset = 0
    for i in range(len(channels[0])):
        for channel in channels:
            value = channel[i] * 32767.0 + rng.random() - rng.random()
            integer = round(value)
            if not -32768 <= integer <= 32767:
                raise ValueError(f"PCM clipping in {path.name} at frame {i}")
            struct.pack_into("<h", payload, offset, integer)
            offset += 2
    with wave.open(str(path), "wb") as wav:
        wav.setnchannels(count)
        wav.setsampwidth(2)
        wav.setframerate(RATE)
        wav.writeframes(payload)


def db(value):
    return 20.0 * math.log10(max(value, 1e-12))


def verify(path, spec):
    duration, channel_count, ceiling, bpm = spec
    with wave.open(str(path), "rb") as wav:
        expected = (channel_count, 2, RATE, frames(duration), "NONE")
        actual = (wav.getnchannels(), wav.getsampwidth(), wav.getframerate(),
                  wav.getnframes(), wav.getcomptype())
        if actual != expected:
            raise ValueError(f"{path.name}: format {actual}, expected {expected}")
        payload = wav.readframes(wav.getnframes())
    if len(payload) != frames(duration) * channel_count * 2:
        raise ValueError(f"{path.name}: truncated PCM payload")
    pcm = [item[0] / 32768.0 for item in struct.iter_unpack("<h", payload)]
    channels = [pcm[ch::channel_count] for ch in range(channel_count)]
    peak = max(abs(value) for value in pcm)
    rms = math.sqrt(sum(value * value for value in pcm) / len(pcm))
    if not 0.15 < peak <= ceiling + 0.0001:
        raise ValueError(f"{path.name}: silent or excessive peak ({peak:.6f})")
    if rms < (0.04 if bpm else 0.015):
        raise ValueError(f"{path.name}: insufficient signal energy ({rms:.6f})")
    if any(abs(value) >= 32767.0 / 32768.0 for value in pcm):
        raise ValueError(f"{path.name}: clipped PCM samples")
    if max(abs(sum(ch) / len(ch)) for ch in channels) > 0.003:
        raise ValueError(f"{path.name}: excessive DC offset")
    if len(set(payload[i:i + 2] for i in range(0, len(payload), 2))) < 1024:
        raise ValueError(f"{path.name}: insufficient PCM dynamic resolution")
    for ch in channels:
        if math.sqrt(sum(x * x for x in ch) / len(ch)) < 0.015:
            raise ValueError(f"{path.name}: silent channel")
    detail = ""
    if bpm:
        # Duration must preserve the musical grid, not trim a partial measure.
        bars = round(duration * bpm / 240.0)
        if frames(duration) != frames(bars * 4.0 * 60.0 / bpm):
            raise ValueError(f"{path.name}: loop does not contain {bars} complete bars")
        seam = max(abs(ch[0] - ch[-1]) for ch in channels)
        derivative_rms = max(math.sqrt(sum((b - a) ** 2 for a, b in zip(ch, ch[1:]))
                                       / (len(ch) - 1)) for ch in channels)
        if seam > 0.025 or seam > max(0.006, 4.0 * derivative_rms):
            raise ValueError(f"{path.name}: discontinuous loop seam ({seam:.6f})")
        windows = [math.sqrt(sum(x * x for x in ch[i:i + 4410]) / len(ch[i:i + 4410]))
                   for ch in channels for i in range(0, len(ch), 4410)]
        if min(windows) < 0.012:
            raise ValueError(f"{path.name}: unintended silent section")
        side = math.sqrt(sum((a - b) ** 2 for a, b in zip(*channels)) / len(channels[0]))
        mono = math.sqrt(sum(((a + b) / 2.0) ** 2 for a, b in zip(*channels)) / len(channels[0]))
        if side < 0.003 or mono < rms * 0.7:
            raise ValueError(f"{path.name}: missing stereo width or poor mono compatibility")
        detail = f", {bpm} BPM / {bars} bars, seam {seam:.6f}"
    else:
        if max(abs(ch[0]) for ch in channels) > 0.001 or max(abs(ch[-1]) for ch in channels) > 0.001:
            raise ValueError(f"{path.name}: abrupt one-shot endpoint")
        tail = channels[0][-frames(0.01):]
        if math.sqrt(sum(x * x for x in tail) / len(tail)) > 0.003:
            raise ValueError(f"{path.name}: tail has not decayed")
    print(f"  PASS {path.name:26s} {duration:5.2f}s  {channel_count}ch  "
          f"peak {db(peak):5.1f} dBFS  RMS {db(rms):5.1f} dBFS{detail}", flush=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output-dir", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--verify-only", action="store_true", help="Verify existing files without rewriting them")
    parser.add_argument("--only", nargs="+", help="Only render or verify specific asset filenames")
    args = parser.parse_args()
    targets = {k: v for k, v in ASSETS.items() if not args.only or k in args.only}
    if not args.verify_only:
        args.output_dir.mkdir(parents=True, exist_ok=True)
        for name, (_, _, ceiling, bpm) in targets.items():
            if name == "bgm_combat.wav":
                print("Preserving studio combat suite; use tools/compose_combat_bgm.py to rebuild.", flush=True)
                verify(args.output_dir / name, ASSETS[name])
                continue
            print(f"Rendering {name} ...", flush=True)
            channels = soundtrack(name == "bgm_combat.wav") if bpm else sound_effect(name)
            write_wav(args.output_dir / name, master(channels, ceiling, periodic=bpm is not None))
            verify(args.output_dir / name, ASSETS[name])
    else:
        for name in targets:
            verify(args.output_dir / name, ASSETS[name])
    print(f"Verified {len(targets)} assets: 44,100 Hz / signed 16-bit PCM, no clipping.\n{args.output_dir}")


if __name__ == "__main__":
    main()
