"""Makes the sea's sounds for the game, into public/sounds/:

- wave.mp3, wave-2.mp3 ... wave-4.mp3: one wave breaking on the shingle beach: the swell
  rising, the crash, the wash running up the beach, and the stones rattling as it drags back.
- sea.mp3: the sea's roar from along the coast, waves breaking one after another (a loop).
- sea-wind.mp3: the wind off the open sea, steadier and more open than the forest's (a loop).

There are no recordings in them: they're noise, filtered and shaped here, then levelled with
ffmpeg to the same loudness as the recordings (about -21 LUFS, mono, 44.1 kHz). Each is made
the same way every time (the random numbers are seeded), so running this again gives the same
files. Plain Python (no numpy); needs ffmpeg on the PATH. From the repo:

    python survival/audio/make_sea.py
"""
import json
import math
import os
import random
import struct
import subprocess
import tempfile
import wave

RATE = 44100
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'public', 'sounds')
LOUDNESS = -21  # LUFS, like the other recordings
LOOP_LENGTH = 24  # seconds, like wind.mp3 and water.mp3
CROSSFADE = 3  # seconds of each loop's end faded into its start, so the join can't be heard


# --- Building blocks ---

def white(n, rng):
    return [rng.uniform(-1, 1) for _ in range(n)]


def brown(n, rng):
    """Noise with most of its weight down low (a random walk that keeps drifting back to 0)."""
    out, v = [0.0] * n, 0.0
    for i in range(n):
        v = 0.995 * v + 0.05 * rng.uniform(-1, 1)
        out[i] = v
    return out


def biquad(x, kind, freq, q=0.707):
    """A filter (RBJ cookbook): 'lowpass', 'highpass' or 'bandpass'. `freq` is a number, or a
    function of the time (seconds) for a filter that sweeps; it's updated every 64 samples."""
    sweep = callable(freq)
    out = [0.0] * len(x)
    x1 = x2 = y1 = y2 = 0.0
    b0 = b1 = b2 = a1 = a2 = 0.0
    for i, v in enumerate(x):
        if i % 64 == 0 if sweep else i == 0:
            f = min(freq(i / RATE) if sweep else freq, RATE * 0.45)
            w = 2 * math.pi * f / RATE
            alpha = math.sin(w) / (2 * q)
            cos = math.cos(w)
            a0 = 1 + alpha
            if kind == 'lowpass':
                b0, b1, b2 = (1 - cos) / 2, 1 - cos, (1 - cos) / 2
            elif kind == 'highpass':
                b0, b1, b2 = (1 + cos) / 2, -(1 + cos), (1 + cos) / 2
            else:
                b0, b1, b2 = alpha, 0.0, -alpha
            b0, b1, b2, a1, a2 = b0 / a0, b1 / a0, b2 / a0, -2 * cos / a0, (1 - alpha) / a0
        y = b0 * v + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2
        x2, x1, y2, y1 = x1, v, y1, y
        out[i] = y
    return out


def shaped(x, envelope):
    """`x`, its loudness following `envelope` (a function of the time in seconds)."""
    return [v * envelope(i / RATE) for i, v in enumerate(x)]


def mix(*layers):
    return [sum(values) for values in zip(*layers)]


def smoothstep(t, a, b):
    t = min(1, max(0, (t - a) / (b - a)))
    return t * t * (3 - 2 * t)


def hit(t, at, rise, fall):
    """A swell that rises over `rise` seconds to 1 at `at`, then dies away (falling to a third
    in `fall` seconds)."""
    if t < at - rise:
        return 0.0
    if t < at:
        return smoothstep(t, at - rise, at)
    return math.exp(-(t - at) / fall)


def looped(x):
    """The first LOOP_LENGTH seconds of `x`, its last CROSSFADE seconds faded into its start."""
    n, fade = LOOP_LENGTH * RATE, CROSSFADE * RATE
    out = x[:n]
    for i in range(fade):
        a = math.sin(0.5 * math.pi * i / fade)
        out[i] = a * x[i] + math.cos(0.5 * math.pi * i / fade) * x[n + i]
    return out


# --- The sounds ---

def wave_breaking(seed, fall):
    """One wave on the shingle, about six and a half seconds. `fall`: how long the crash's
    roar takes to die away."""
    rng = random.Random(seed)
    n = int(6.5 * RATE)
    at = rng.uniform(0.9, 1.3)  # when it breaks
    crash = rng.uniform(0.7, 1.1)  # how big
    drag = at + rng.uniform(1.5, 2.1)  # when it turns and drags back down the beach
    # The swell rising and the low boom as it comes down.
    swell = shaped(biquad(brown(n, rng), 'lowpass', 260), lambda t: 0.9 * hit(t, at + 0.05, 0.9, 0.5))
    boom = shaped(biquad(white(n, rng), 'lowpass', 110), lambda t: 1.4 * crash * hit(t, at, 0.03, 0.35))
    # The crash: a roar of white water, brightest as it breaks and duller as it spreads.
    roar = biquad(biquad(white(n, rng), 'highpass', 220), 'lowpass', lambda t: 900 + 3200 * hit(t, at, 0.05, 0.6))
    roar = shaped(roar, lambda t: crash * hit(t, at, 0.06, fall))
    # The wash running up the beach: a hiss that swells after the crash and slowly fades.
    wash = shaped(biquad(white(n, rng), 'highpass', 1800), lambda t: 0.35 * hit(t, at + 0.7, 0.6, 1.4))
    # Dragging back over the stones: lots of little clicks, thinning out as the water drains.
    clicks = [0.0] * n
    t = drag
    while t < 6.2:
        density = 450 * math.exp(-(t - drag) / 1.1)
        i = int(t * RATE)
        size = rng.uniform(0.2, 1) * math.exp(-(t - drag) / 1.6)
        for k in range(int(0.004 * RATE)):
            if i + k < n:
                clicks[i + k] += size * (1 if rng.random() < 0.5 else -1) * math.exp(-k / (0.0008 * RATE))
        t += rng.expovariate(density) if density > 1 else 1
    rattle = shaped(biquad(clicks, 'bandpass', 3800, 0.8), lambda t: 0.6 * smoothstep(t, drag - 0.2, drag + 0.3))
    hiss = shaped(biquad(white(n, rng), 'bandpass', lambda t: 2600 - 900 * smoothstep(t, drag, 6), 0.6),
                  lambda t: 0.18 * smoothstep(t, drag - 0.3, drag + 0.2) * math.exp(-max(0, t - drag) / 1.3))
    out = mix(swell, boom, roar, wash, rattle, hiss)
    return shaped(out, lambda t: 1 - smoothstep(t, 6.0, 6.5))


def sea_roar():
    """Waves breaking all along the coast, heard together: a deep, slowly surging roar."""
    rng = random.Random(7)
    n = (LOOP_LENGTH + CROSSFADE) * RATE
    breaks = []
    t = 0.5
    while t < LOOP_LENGTH + CROSSFADE:
        breaks.append((t, rng.uniform(0.5, 1)))
        t += rng.uniform(2.5, 5.5)  # (several stretches of beach, each with its own rhythm)

    def surge(t):
        return 0.35 + sum(size * hit(t, at, 0.8, 1.6) for at, size in breaks)

    low = shaped(biquad(brown(n, rng), 'lowpass', 420), lambda t: surge(t))
    mid = shaped(biquad(white(n, rng), 'bandpass', 900, 0.5), lambda t: 0.25 * surge(t - 0.3))
    top = shaped(biquad(white(n, rng), 'highpass', 2500), lambda t: 0.06 * surge(t - 0.6))
    return looped(mix(low, mid, top))


def sea_wind():
    """A steady wind off the open sea, gusting slowly, with no trees in it to rustle."""
    rng = random.Random(11)
    n = (LOOP_LENGTH + CROSSFADE) * RATE

    def gust(t):
        return 0.6 + 0.4 * (0.5 * math.sin(t * 0.43 + 1) + 0.3 * math.sin(t * 0.97 + 4) + 0.2 * math.sin(t * 0.21))

    body = biquad(white(n, rng), 'bandpass', lambda t: 380 + 420 * gust(t), 0.6)
    body = shaped(body, gust)
    air = shaped(biquad(white(n, rng), 'highpass', 3000), lambda t: 0.08 * gust(t - 0.4))
    low = shaped(biquad(brown(n, rng), 'lowpass', 140), lambda t: 0.5 * gust(t))
    return looped(mix(body, air, low))


# --- Saving ---

def save(name, samples):
    """Writes `samples` to public/sounds/<name>.mp3, levelled like the recordings."""
    peak = max(abs(v) for v in samples) or 1
    with tempfile.TemporaryDirectory() as folder:
        raw = os.path.join(folder, 'raw.wav')
        with wave.open(raw, 'wb') as w:
            w.setnchannels(1)
            w.setsampwidth(2)
            w.setframerate(RATE)
            w.writeframes(b''.join(struct.pack('<h', int(30000 * v / peak)) for v in samples))
        # Take out the rumble below 45 Hz (as the recordings were), measure its loudness, then
        # turn it up or down to match (a limiter catching any peak).
        subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-i', raw, '-af', 'highpass=f=45:p=2',
                        os.path.join(folder, 'clean.wav')], check=True)
        raw = os.path.join(folder, 'clean.wav')
        measured = subprocess.run(
            ['ffmpeg', '-hide_banner', '-nostats', '-i', raw, '-af', 'loudnorm=print_format=json', '-f', 'null', '-'],
            capture_output=True, text=True,
        ).stderr
        report = measured[measured.rindex('{'):]
        loudness = float(json.loads(report[:report.index('}') + 1])['input_i'])
        subprocess.run(
            ['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-i', raw,
             '-af', f'volume={LOUDNESS - loudness:.2f}dB,alimiter=limit=0.9:level=disabled',
             '-ac', '1', '-ar', str(RATE), '-b:a', '128k', os.path.join(OUT, f'{name}.mp3')],
            check=True,
        )
    print(f'{name}.mp3: {len(samples) / RATE:.1f} s, was {loudness:.1f} LUFS')


if __name__ == '__main__':
    for take, (seed, fall) in enumerate([(1, 0.9), (2, 1.2), (3, 0.75), (4, 1.05)], start=1):
        save('wave' if take == 1 else f'wave-{take}', wave_breaking(seed, fall))
    save('sea', sea_roar())
    save('sea-wind', sea_wind())
