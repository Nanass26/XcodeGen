#!/usr/bin/env python3
"""Bande-son générée : nappes d'accords, arpèges et bruitages, synchronisés sur
les événements exportés par la scène (build/events.json).

    python3 music.py build/events.json build/music.wav
"""
import json
import sys
import wave

import numpy as np

SR = 44100
TAU = 2 * np.pi
rng = np.random.default_rng(7)

meta = json.load(open(sys.argv[1]))
OUT = sys.argv[2]
DUR = meta["duration"]
N = int((DUR + 1) * SR)
scene = {s["name"]: s["s"] for s in meta["scenes"]}

pad_l, pad_r = np.zeros(N), np.zeros(N)
fx_l, fx_r = np.zeros(N), np.zeros(N)


def hz(m):
    return 440.0 * 2 ** ((m - 69) / 12)


def tline(sec):
    return np.arange(int(sec * SR)) / SR


def add(bus, sig, t, pan=0.0, gain=1.0):
    """Ajoute un signal mono (ou un couple stéréo) sur un bus, avec panoramique à puissance constante."""
    l_bus, r_bus = bus
    i = int(t * SR)
    if i >= N:
        return
    sl, sr = (sig, sig) if not isinstance(sig, tuple) else sig
    n = min(len(sl), N - i)
    th = (pan + 1) * np.pi / 4
    l_bus[i:i + n] += sl[:n] * gain * np.cos(th) * np.sqrt(2)
    r_bus[i:i + n] += sr[:n] * gain * np.sin(th) * np.sqrt(2)


def spectral(x, lo=None, hi=None):
    """Filtre doux dans le domaine fréquentiel (passe-haut lo, passe-bas hi)."""
    X = np.fft.rfft(x)
    f = np.fft.rfftfreq(len(x), 1 / SR) + 1e-6
    m = np.ones_like(f)
    if lo:
        m /= 1 + (lo / f) ** 4
    if hi:
        m /= 1 + (f / hi) ** 4
    return np.fft.irfft(X * m, len(x))


# ---------- timbres ----------

def pad_note(m, dur, att=1.1, rel=1.8):
    t = tline(dur + rel)
    f = hz(m)
    bright = 1.0 if m >= 48 else 0.35
    l, r = np.zeros(len(t)), np.zeros(len(t))
    for k, a in ((1, 1.0), (2, 0.32 * bright), (3, 0.13 * bright), (4, 0.05 * bright)):
        l += a * np.sin(TAU * f * k * 0.9975 * t + rng.uniform(0, TAU))
        r += a * np.sin(TAU * f * k * 1.0025 * t + rng.uniform(0, TAU))
    env = np.ones(len(t))
    na = int(att * SR)
    env[:na] = 0.5 - 0.5 * np.cos(np.linspace(0, np.pi, na))
    nr = int(rel * SR)
    env[-nr:] *= 0.5 + 0.5 * np.cos(np.linspace(0, np.pi, nr))
    env *= 1 + 0.08 * np.sin(TAU * 0.21 * t + rng.uniform(0, TAU))
    return l * env, r * env


def pluck(m, dur=1.4):
    t = tline(dur)
    f = hz(m)
    s = sum((1 / k ** 1.3) * np.exp(-t * (2.2 + 1.9 * k)) * np.sin(TAU * f * k * t) for k in range(1, 7))
    s[: int(0.004 * SR)] *= np.linspace(0, 1, int(0.004 * SR))
    return s


def thump(f0=90, f1=45, dur=0.6, decay=8.0):
    t = tline(dur)
    f = f1 + (f0 - f1) * np.exp(-t * 12)
    return np.sin(TAU * np.cumsum(f) / SR) * np.exp(-t * decay)


def bell(m, dur=3.0):
    t = tline(dur)
    f = hz(m)
    s = sum(a * np.exp(-t * d) * np.sin(TAU * f * p * t) for p, a, d in ((1, 1, 1.4), (2.0, 0.4, 2.2), (2.76, 0.3, 3.2), (5.4, 0.12, 5.5)))
    s[: int(0.003 * SR)] *= np.linspace(0, 1, int(0.003 * SR))
    return s


def noise(sec):
    return rng.standard_normal(int(sec * SR))


# ---------- harmonie ----------
CH = {
    "Am9": [45, 52, 57, 60, 64, 71],
    "Fmaj7": [41, 48, 57, 60, 64, 67],
    "Cadd9": [36, 43, 52, 55, 62, 64],
    "Em7": [40, 47, 55, 59, 62, 66],
    "G6": [43, 50, 55, 59, 62, 64],
    "Dm9": [38, 45, 53, 57, 60, 64],
    "C": [36, 43, 52, 55, 60, 64, 67, 72],
}
mil = meta["milestones"]
L, LI, M = scene["life"], scene["meta"], scene["outro"]
progression = [
    (2.4, "Am9"),
    (scene["words"] + 0.2, "Fmaj7"),
    (scene["founding"] + 0.2, "Cadd9"),
    (scene["name"] + 0.2, "Em7"),
    (scene["constitution"] + 0.2, "Fmaj7"),
    (scene["constitution"] + 4.6, "G6"),
    *zip(mil, ["Am9", "Fmaj7", "Cadd9", "G6", "Am9", "Fmaj7", "Cadd9", "G6", "C"]),
    (L + 0.4, "Dm9"), (L + 6.4, "Fmaj7"), (L + 10.0, "Am9"), (L + 14.0, "G6"), (L + 14.8, "Fmaj7"),
    (LI + 0.2, "Cadd9"), (LI + 3.6, "G6"), (LI + 7.2, "Am9"), (LI + 7.9, "Fmaj7"),
    (M + 0.4, "C"),
]

# drone d'ouverture (la + mi) qui monte jusqu'au premier accord
t = tline(3.2)
drone = sum(np.sin(TAU * hz(m) * t) for m in (45, 52)) * (t / 3.2) ** 2
add((pad_l, pad_r), drone, 0.0, gain=0.05)

for k, (start, name) in enumerate(progression):
    end = progression[k + 1][0] if k + 1 < len(progression) else DUR
    for m in CH[name]:
        add((pad_l, pad_r), pad_note(m, end - start + 0.3, att=0.9 if k else 0.15), start, pan=(m % 7 - 3) * 0.08, gain=0.05 if m >= 48 else 0.07)


def chord_at(t):
    cur = progression[0][1]
    for s, name in progression:
        if s <= t:
            cur = name
    return CH[cur]


def arpeggio(t0, t1, step, gain):
    pattern = [0, 2, 1, 3, 2, 4, 3, 1]
    k, t = 0, t0
    while t < t1:
        tones = sorted(n for n in chord_at(t + 0.01) if n >= 52)
        m = tones[pattern[k % len(pattern)] % len(tones)] + 12
        add((fx_l, fx_r), pluck(m, 1.0), t, pan=0.35 if k % 2 else -0.35, gain=gain * (0.8 + 0.2 * (k % 4 == 0)))
        k += 1
        t += step


arpeggio(mil[0], mil[-1] + 2.0, 2.6 / 8, 0.05)
arpeggio(L + 10.0, L + 14.0, 0.2, 0.03)

# ---------- bruitages synchronisés ----------
melody = [69, 72, 76, 74, 76, 77, 79, 81, 84]
pent = [81, 84, 86, 88, 91, 93]
FX = (fx_l, fx_r)
for e in meta["events"]:
    t0, kind = e["t"], e["type"]
    if kind == "riser":
        d = e["dur"]
        tt = tline(d)
        sweep = sum(np.sin(TAU * np.cumsum(hz(m) * 2 ** (tt / d * 1.0)) / SR) for m in (57, 64, 69))
        hiss = spectral(noise(d), lo=2500, hi=9000)
        add(FX, (sweep * 0.5 + hiss * 0.6) * (tt / d) ** 3, t0, gain=0.12)
    elif kind == "impact":
        d = 3.0
        tt = tline(d)
        burst = spectral(noise(d), hi=1400) * np.exp(-tt * 3.5)
        add(FX, thump(70, 32, d, 2.2) * 0.9 + burst * 0.25, t0, gain=0.55)
    elif kind == "whoosh":
        d = 1.1
        tt = tline(d)
        env = np.sin(np.pi * np.clip(tt / d, 0, 1)) ** 2 * np.exp(-tt * 1.2)
        w = spectral(noise(d), lo=350, hi=3500) * env
        pan = np.linspace(-0.7, 0.7, len(tt))
        add(FX, (w * np.cos((pan + 1) * np.pi / 4), w * np.sin((pan + 1) * np.pi / 4)), t0 - 0.35, gain=0.4)
    elif kind == "tick":
        tt = tline(0.08)
        add(FX, np.sin(TAU * 2400 * tt) * np.exp(-tt * 260) + noise(0.08) * np.exp(-tt * 700) * 0.4, t0, gain=0.06)
    elif kind == "chime":
        add(FX, bell([76, 79, 83][e["n"]]), t0, pan=[-0.4, 0, 0.4][e["n"]], gain=0.07)
    elif kind == "pop":
        i = e["n"]
        add(FX, pluck(melody[i], 2.2), t0, gain=0.16)
        add(FX, pluck(melody[i] - 12, 1.6), t0, gain=0.08)
        add(FX, thump(), t0, gain=0.3)
    elif kind == "blip":
        tt = tline(0.25)
        add(FX, np.sin(TAU * hz(pent[e["n"] % len(pent)]) * tt) * np.exp(-tt * 22), t0, pan=rng.uniform(-0.7, 0.7), gain=0.06)
    elif kind == "key":
        tt = tline(0.03)
        click = spectral(noise(0.03), lo=1800, hi=7000) * np.exp(-tt * 220)
        add(FX, click, t0, pan=rng.uniform(-0.2, 0.2), gain=rng.uniform(0.1, 0.16))

# ---------- nuances : la nappe respire avec les scènes ----------
T = scene["timeline"]
dyn = [(0, 0.8), (scene["words"] + 0.5, 0.65), (scene["founding"], 0.85), (scene["name"], 0.7),
       (scene["constitution"], 0.8), (T, 0.9), (mil[-1], 1.0), (L, 0.5), (L + 9.5, 0.5), (L + 10.5, 0.8),
       (L + 14.0, 0.8), (L + 15.0, 0.6), (LI, 0.55), (M, 0.6), (M + 0.6, 1.0), (DUR, 1.0)]
auto = np.interp(np.arange(N) / SR, [d[0] for d in dyn], [d[1] for d in dyn])
pad_l *= auto
pad_r *= auto

# ---------- réverbération (convolution) & mastering ----------
tt = tline(3.0)
ir_l = spectral(noise(3.0), hi=6000) * np.exp(-tt / 0.75)
ir_r = spectral(noise(3.0), hi=6000) * np.exp(-tt / 0.75)
ir_l /= np.sqrt(np.sum(ir_l ** 2))
ir_r /= np.sqrt(np.sum(ir_r ** 2))


def convolve(x, ir):
    n = 1 << int(np.ceil(np.log2(len(x) + len(ir))))
    return np.fft.irfft(np.fft.rfft(x, n) * np.fft.rfft(ir, n), n)[: len(x)]


send_l = pad_l * 0.4 + fx_l * 0.6
send_r = pad_r * 0.4 + fx_r * 0.6
mix_l = pad_l + fx_l + convolve(send_l, ir_l) * 0.45
mix_r = pad_r + fx_r + convolve(send_r, ir_r) * 0.45

stereo = np.stack([mix_l, mix_r])
stereo = np.tanh(1.4 * stereo / np.max(np.abs(stereo))) / np.tanh(1.4)
fade = np.ones(N)
fade[: int(0.3 * SR)] = np.linspace(0, 1, int(0.3 * SR))
a, b = int((DUR - 1.8) * SR), int(DUR * SR)
fade[a:b] = np.linspace(1, 0, b - a)
fade[b:] = 0
stereo *= fade * 0.89
stereo = stereo[:, : int(DUR * SR)]

pcm = (np.clip(stereo.T, -1, 1) * 32767).astype("<i2")
with wave.open(OUT, "wb") as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes(pcm.tobytes())
print(f"{OUT} : {DUR:.1f} s, {len(meta['events'])} événements sonores")
