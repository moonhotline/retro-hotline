#!/usr/bin/env python3
"""Compose the three approved 125 BPM masters into an 80-bar game loop.

Requires NumPy and FFmpeg. Inputs remain untouched. Example:
python3 tools/compose_combat_bgm.py --warm warm.wav --original original.wav --trap trap.wav
"""
import argparse
import hashlib
import json
import math
from pathlib import Path
import re
import shutil
import subprocess
import wave
import numpy as np

RATE = 44100
TARGET_LUFS = -14.0
CROSSFADE = 0.96  # half a 4/4 bar at 125 BPM


def read(path, duration, ffmpeg):
    with wave.open(str(path), 'rb') as wav:
        spec = (wav.getnchannels(), wav.getsampwidth(), wav.getframerate(), wav.getnframes())
        assert spec == (2, 2, RATE, round(duration * RATE)), (path, spec)
        audio = np.frombuffer(wav.readframes(wav.getnframes()), dtype='<i2').reshape(-1, 2).astype(np.float64) / 32768
    result = subprocess.run([ffmpeg, '-hide_banner', '-nostats', '-i', str(path), '-af', 'ebur128=peak=true',
                             '-f', 'null', '-'], capture_output=True, text=True, check=True)
    summary = result.stderr[result.stderr.rfind('Summary:'):]
    lufs = float(re.search(r'I:\s+(-?[\d.]+) LUFS', summary).group(1))
    gain_db = TARGET_LUFS - lufs
    return audio * 10 ** (gain_db / 20), {
        'file': path.name, 'sha256': hashlib.sha256(path.read_bytes()).hexdigest(),
        'duration': duration, 'input_lufs': lufs, 'gain_db': round(gain_db, 2),
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ('warm', 'original', 'trap'):
        parser.add_argument('--' + name, type=Path, required=True)
    parser.add_argument('--output-dir', type=Path, default=Path(__file__).resolve().parents[1] / 'frontend/public/audio')
    args = parser.parse_args()
    ffmpeg = shutil.which('ffmpeg')
    if not ffmpeg:
        parser.error('FFmpeg is required')
    tracks, inputs = [], []
    for name, duration in [('warm', 61.44), ('original', 30.72), ('trap', 61.44)]:
        audio, info = read(getattr(args, name), duration, ffmpeg)
        tracks.append(audio)
        inputs.append(info)
    output = np.concatenate(tracks)
    count = round(CROSSFADE * RATE)
    u = np.arange(count) / (count - 1)
    incoming = .5 - .5 * np.cos(np.pi * u)
    boundaries = [0, len(tracks[0]), len(tracks[0]) + len(tracks[1])]
    # At each downbeat continue the outgoing loop while introducing the incoming
    # one on its own first downbeat. Overlap does not remove beats or change tempo.
    # The final Trap -> warm handoff is baked into the start of the complete loop.
    for index, boundary in enumerate(boundaries):
        old = tracks[(index - 1) % 3][:count]
        new = tracks[index][:count]
        output[boundary:boundary + count] = old * (1 - incoming[:, None]) + new * incoming[:, None]
    peak = float(np.max(np.abs(output)))
    mastering_gain = min(1.0, .9 / peak)
    output *= mastering_gain
    assert len(output) == round(153.6 * RATE)
    assert np.isfinite(output).all()
    args.output_dir.mkdir(parents=True, exist_ok=True)
    wav_path = args.output_dir / 'bgm_combat.wav'
    rng = np.random.default_rng(125803)
    dither = rng.random(output.shape) - rng.random(output.shape)
    pcm = np.rint(output * 32767 + dither).astype('<i2')
    assert np.max(np.abs(pcm.astype(np.int32))) < 32767
    with wave.open(str(wav_path), 'wb') as wav:
        wav.setnchannels(2)
        wav.setsampwidth(2)
        wav.setframerate(RATE)
        wav.writeframes(pcm.tobytes())
    decoded = pcm.astype(np.float64) / 32768
    seam = float(np.max(np.abs(decoded[0] - decoded[-1])))
    derivative = float(np.sqrt(np.mean(np.diff(decoded, axis=0) ** 2)))
    assert seam < max(.006, 4 * derivative)
    windows = decoded[:len(decoded) // 4410 * 4410].reshape(-1, 4410, 2)
    assert np.sqrt(np.mean(windows ** 2, axis=(1, 2))).min() > .012
    assert np.max(np.abs(decoded.mean(axis=0))) < .003
    transitions = []
    for boundary in boundaries:
        jump = float(np.max(np.abs(decoded[boundary] - decoded[boundary - 1])))
        assert jump < max(.025, 4 * derivative)
        transitions.append({'time': boundary / RATE, 'duration': CROSSFADE, 'sample_jump': jump})
    ogg_path = args.output_dir / 'bgm_combat.ogg'
    subprocess.run([ffmpeg, '-v', 'error', '-y', '-i', str(wav_path), '-c:a', 'libopus', '-b:a', '192k', '-vbr', 'on', str(ogg_path)], check=True)
    report = {'bpm': 125, 'bars': 80, 'duration': 153.6, 'target_lufs': TARGET_LUFS,
              'sample_rate': RATE, 'channels': 2, 'bits_per_sample': 16, 'inputs': inputs,
              'master_gain_db': 20 * math.log10(mastering_gain), 'seam': seam,
              'transitions': transitions,
              'sha256': {p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in (wav_path, ogg_path)}}
    (args.output_dir / 'combat_suite.json').write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps(report, indent=2), flush=True)


if __name__ == '__main__':
    main()
