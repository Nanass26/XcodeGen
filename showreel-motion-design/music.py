#!/usr/bin/env python3
"""Bande-son du showreel : un morceau électro à 120 BPM synthétisé en numpy,
structuré par chapitre (intro, groove, breakdown, demi-tempo, montée, drop final),
et des bruitages calés sur les événements déclarés par les scènes.

    python3 music.py build/events.json build/music.wav
"""
import json
import sys
import wave

import numpy as np

SR = 44100
TAU = 2 * np.pi
rng = np.random.default_rng(2026)

meta = json.load(open(sys.argv[1]))
OUT = sys.argv[2]
DUR = meta["duration"]
BEAT = 60.0 / meta["bpm"]
BAR = 4 * BEAT
NBARS = int(round(DUR / BAR))
N = int((DUR + 3) * SR)


# ---------------------------------------------------------------- outils
def tl(sec):
    return np.arange(int(sec * SR)) / SR


def hz(m):
    return 440.0 * 2 ** ((m - 69) / 12)


def spectral(x, lo=None, hi=None, order=4):
    """Filtre doux dans le domaine fréquentiel (passe-haut lo, passe-bas hi)."""
    X = np.fft.rfft(x)
    f = np.fft.rfftfreq(len(x), 1 / SR) + 1e-6
    m = np.ones_like(f)
    if lo:
        m /= 1 + (lo / f) ** order
    if hi:
        m /= 1 + (f / hi) ** order
    return np.fft.irfft(X * m, len(x))


def env_adsr(n, a=0.005, d=0.1, s=0.7, r=0.05, total=None):
    total = total or n / SR
    t = np.arange(n) / SR
    e = np.where(t < a, t / a, s + (1 - s) * np.exp(-(t - a) / max(d, 1e-4)))
    rel_start = total - r
    e = np.where(t > rel_start, e * np.clip(1 - (t - rel_start) / r, 0, 1), e)
    return e


class Bus:
    def __init__(self):
        self.l = np.zeros(N)
        self.r = np.zeros(N)

    def add(self, sig, t, gain=1.0, pan=0.0):
        i = int(round(t * SR))
        if i >= N or i < 0:
            return
        sl, sr = sig if isinstance(sig, tuple) else (sig, sig)
        n = min(len(sl), N - i)
        th = (np.clip(pan, -1, 1) + 1) * np.pi / 4
        self.l[i:i + n] += sl[:n] * gain * np.cos(th) * 1.4142
        self.r[i:i + n] += sr[:n] * gain * np.sin(th) * 1.4142


drums, bass, music, fx = Bus(), Bus(), Bus(), Bus()


# ---------------------------------------------------------------- instruments
def make_kick():
    t = tl(0.45)
    f = 44 + 120 * np.exp(-t * 28)
    body = np.sin(TAU * np.cumsum(f) / SR) * np.exp(-t * 6.5)
    click = spectral(rng.standard_normal(len(t)), lo=1500) * np.exp(-t * 500) * 0.25
    return np.tanh(1.6 * (body + click))


def make_clap():
    t = tl(0.5)
    nz = spectral(rng.standard_normal(len(t)), lo=900, hi=7000)
    e = np.zeros(len(t))
    for k, d in enumerate((0.0, 0.011, 0.023)):
        tt = np.clip(t - d, 0, None)
        e += np.where(t >= d, np.exp(-tt * 140), 0) * (0.8 if k < 2 else 1)
    e += np.exp(-t * 16) * 0.35
    body = np.sin(TAU * 190 * t) * np.exp(-t * 30) * 0.3
    return nz * e * 0.6 + body


def make_hat(open_=False):
    t = tl(0.4 if open_ else 0.09)
    nz = spectral(rng.standard_normal(len(t)), lo=7500, hi=15000)
    return nz * np.exp(-t * (11 if open_ else 55)) * 0.5


def make_crash():
    t = tl(2.2)
    nz = spectral(rng.standard_normal(len(t)), lo=4500, hi=14000)
    return nz * np.exp(-t * 2.2) * 0.4


KICK, CLAP, HAT, OHAT, CRASH = make_kick(), make_clap(), make_hat(), make_hat(True), make_crash()

_cache = {}


def saw_note(m, dur, harm=14, detune=(0.0,), bright=0.22, attack=0.004, decay=0.25, sustain=0.6, release=0.04):
    key = ("saw", m, round(dur, 3), harm, detune, bright, attack, decay, sustain, release)
    if key in _cache:
        return _cache[key]
    t = tl(dur)
    f0 = hz(m)
    s = np.zeros(len(t))
    for dt in detune:
        f = f0 * 2 ** (dt / 1200)
        ph = rng.uniform(0, TAU)
        for k in range(1, harm + 1):
            if f * k > 16000:
                break
            s += np.sin(TAU * f * k * t + ph * k) * (1 / k) * np.exp(-k * bright)
    s /= max(1, len(detune)) ** 0.5
    s *= env_adsr(len(t), attack, decay, sustain, release, dur)
    _cache[key] = s
    return s


def pluck(m, dur=0.6, bright=1.0):
    key = ("pluck", m, round(dur, 3), bright)
    if key in _cache:
        return _cache[key]
    t = tl(dur)
    f = hz(m)
    s = sum((1 / k ** 1.2) * np.exp(-t * (5 + k * 3.2 / bright)) * np.sin(TAU * f * k * t) for k in range(1, 9))
    s[: int(0.003 * SR)] *= np.linspace(0, 1, int(0.003 * SR))
    _cache[key] = s
    return s


def sub(m, dur):
    t = tl(dur)
    return np.sin(TAU * hz(m) * t) * env_adsr(len(t), 0.004, 0.3, 0.8, 0.03, dur)


# ---------------------------------------------------------------- harmonie
CH = {
    "Am": ([57, 60, 64, 67], 33), "F": ([53, 57, 60, 64], 29), "C": ([55, 60, 62, 64], 36),
    "G": ([55, 59, 62, 67], 31), "Em": ([52, 55, 59, 62], 28), "Dm": ([53, 57, 60, 62], 38),
}
PENTA = [69, 72, 74, 76, 79, 81, 84, 86]

scenes = {s["id"]: (int(round(s["s"] / BAR)), int(round(s["e"] / BAR))) for s in meta["scenes"]}


def rng_bars(sid):
    return scenes.get(sid, (0, 0))


# Plan du morceau : un dictionnaire de réglages par mesure.
plan = [dict(chord="Am", kick=None, clap=False, hats=None, bass=None, pad=0.0, stab=False, arp=None, lead=False, crash=False) for _ in range(NBARS)]


def section(sid, prog, **kw):
    b0, b1 = rng_bars(sid)
    for i, b in enumerate(range(b0, min(b1, NBARS))):
        plan[b].update(kw)
        plan[b]["chord"] = prog[i % len(prog)]
        plan[b]["local"] = i
        plan[b]["len"] = b1 - b0
        plan[b]["sid"] = sid


A = ["Am", "F", "C", "G"]
section("01", ["Am"], pad=0.9)
section("02", A, kick="full", clap=True, hats="8", bass="off8", pad=0.45, stab=True)
section("03", A, kick="full", clap=True, hats="16", bass="off8", pad=0.35, arp="16")
section("04", ["F", "G", "Am", "Am", "F", "G"], kick=None, hats=None, bass=None, pad=1.0, arp="16")
section("05", ["F", "G", "Em", "Am"], kick="full", clap=True, hats="16", bass="16", pad=0.4, stab=True, lead=True)
section("06", ["F", "G", "Em", "Am"], kick="full", clap=True, hats="8", bass="off8", pad=0.4, arp="8")
section("07", A, kick="full", clap=True, hats="8", bass="off8", pad=0.3, arp="16")
section("08", ["Dm", "Am", "Dm", "Am", "G"], kick="half", clap=True, hats="8", bass="wobble", pad=0.8)
section("09", A, kick="full", clap=True, hats="16", bass="16", pad=0.4, stab=True)
section("10", ["Am", "F", "C", "G", "F", "G", "Am", "F", "Am"], kick="full", clap=True, hats="16", bass="off8", pad=0.6, stab=True, lead=True)

# Ajustements de dramaturgie (en mesures locales aux chapitres)
b0, _ = rng_bars("01")
plan[b0 + 2]["kick"] = "filtered"
plan[b0 + 3]["kick"] = "filtered"
b0, b1 = rng_bars("04")
for b in range(b0 + 2, min(b1, NBARS)):  # le kick revient pour l'explosion
    plan[b].update(kick="full", hats="16", bass="16", clap=b >= b0 + 4)
b0, b1 = rng_bars("09")
plan[b1 - 1].update(roll=True)
b0, b1 = rng_bars("10")
for b in range(b0 + 5, min(b1, NBARS)):  # carte finale : on retire la batterie
    plan[b].update(kick="one" if b < b0 + 8 else None, clap=False, hats="8" if b < b0 + 8 else None, bass=None, stab=False, lead=False, pad=3.2, arp="8" if b < b0 + 8 else None)
for sid, (b0, _) in scenes.items():
    if sid not in ("01",) and b0 < NBARS:
        plan[b0]["crash"] = True

# ---------------------------------------------------------------- séquence
kick_times = []
for b, p in enumerate(plan):
    t0 = b * BAR
    tones, root = CH[p["chord"]]
    # batterie
    for beat in range(4):
        tb = t0 + beat * BEAT
        if p["kick"] in ("full", "filtered") or (p["kick"] == "half" and beat in (0, 2)) or (p["kick"] == "one" and beat == 0):
            g = 0.95 if p["kick"] != "filtered" else 0.0
            if p["kick"] == "filtered":
                drums.add(spectral(KICK, hi=180), tb, 0.8)
            else:
                drums.add(KICK, tb, g)
            kick_times.append(tb)
        if p["clap"] and ((p["kick"] == "half" and beat == 2) or (p["kick"] != "half" and beat in (1, 3))):
            drums.add(CLAP, tb, 0.55, pan=0.05)
    if p["hats"]:
        step = BEAT / 2 if p["hats"] == "8" else BEAT / 4
        n = int(round(BAR / step))
        for k in range(n):
            th = t0 + k * step
            off = (k * step / BEAT) % 1 == 0.5
            if p["hats"] == "8" and off:
                drums.add(OHAT, th, 0.28, pan=0.25)
            else:
                drums.add(HAT, th, 0.24 * (1.0 if k % 2 == 0 else 0.6) * (1.2 if off else 1.0), pan=-0.2)
    if p.get("roll"):
        # roulement de clap qui accélère vers la coupe
        k, tr = 0, t0
        while tr < t0 + BAR - 0.01:
            frac = (tr - t0) / BAR
            drums.add(CLAP, tr, 0.25 + 0.35 * frac, pan=0.0)
            tr += BEAT / (2 if frac < 0.5 else 4 if frac < 0.75 else 8)
            k += 1
    if p["crash"]:
        drums.add(CRASH, t0, 0.35, pan=0.3)

    # basse
    if p["bass"] == "off8":
        for beat in range(4):
            bass.add(saw_note(root + 12, BEAT * 0.45, harm=10, bright=0.35), t0 + beat * BEAT + BEAT / 2, 0.42)
            bass.add(sub(root + 12, BEAT * 0.45), t0 + beat * BEAT + BEAT / 2, 0.24)
    elif p["bass"] == "16":
        for k in range(16):
            if k % 4 == 0:
                continue
            m = root + 12 + (12 if k % 8 == 6 else 0)
            bass.add(saw_note(m, BEAT * 0.22, harm=10, bright=0.3, decay=0.08, sustain=0.4), t0 + k * BEAT / 4, 0.36)
            bass.add(sub(root + 12, BEAT * 0.22), t0 + k * BEAT / 4, 0.2)
    elif p["bass"] == "wobble":
        t = tl(BAR)
        s = saw_note(root + 12, BAR, harm=12, bright=0.15, attack=0.01, decay=1.0, sustain=0.9, release=0.05)
        lfo = 0.55 + 0.45 * np.sin(TAU * t / (BEAT / 2) - np.pi / 2)
        bass.add(spectral(s * lfo, hi=900) + sub(root + 12, BAR) * 0.6, t0, 0.5)

    # nappe (supersaw), accords plaqués, arpèges, lead
    if p["pad"] > 0:
        for m in tones:
            s = saw_note(m, BAR + 0.15, harm=10, detune=(-14, -5, 5, 14), bright=0.45, attack=0.25, decay=1.5, sustain=0.85, release=0.35)
            music.add(s, t0, 0.055 * p["pad"], pan=(m % 5 - 2) * 0.15)
    if p["stab"]:
        for k, pos in enumerate((0.5, 1.5, 2.5, 3.0, 3.5) if b % 2 else (0.5, 1.25, 2.5, 3.5)):
            for m in tones:
                music.add(saw_note(m + 12, 0.18, harm=12, detune=(-9, 9), bright=0.25, decay=0.06, sustain=0.25, release=0.05), t0 + pos * BEAT, 0.05, pan=(-0.3 if k % 2 else 0.3))
    if p["arp"]:
        step = BEAT / 4 if p["arp"] == "16" else BEAT / 2
        seq = [0, 1, 2, 3, 2, 1, 3, 2]
        for k in range(int(round(BAR / step))):
            m = tones[seq[k % len(seq)]] + 12
            music.add(pluck(m, 0.5), t0 + k * step, 0.11, pan=(-0.45 if k % 2 else 0.45))
    if p["lead"]:
        motif = [(0.0, 3), (0.75, 2), (1.5, 3), (2.0, 1), (2.75, 2), (3.5, 0)]
        for pos, idx in motif:
            m = tones[idx] + 12
            s = saw_note(m, 0.42, harm=9, detune=(-6, 6), bright=0.4, decay=0.15, sustain=0.5, release=0.1)
            music.add(s, t0 + pos * BEAT, 0.07, pan=0.1)
            music.add(s, t0 + pos * BEAT + BEAT * 0.75, 0.025, pan=-0.5)  # écho

# ---------------------------------------------------------------- bruitages (événements des scènes)
def riser(d):
    t = tl(d)
    sweep = sum(np.sin(TAU * np.cumsum(hz(m) * 2 ** (2 * t / d)) / SR) for m in (57, 64))
    hiss = spectral(rng.standard_normal(len(t)), lo=3000, hi=12000)
    e = (t / d) ** 2.5
    return (sweep * 0.35 + hiss * 0.8) * e


def impact():
    t = tl(2.5)
    boom = np.sin(TAU * np.cumsum(30 + 70 * np.exp(-t * 9)) / SR) * np.exp(-t * 2.4)
    burst = spectral(rng.standard_normal(len(t)), hi=2200) * np.exp(-t * 5)
    return np.tanh(1.3 * (boom + burst * 0.35))


def whoosh(d=0.7):
    t = tl(d)
    e = np.sin(np.pi * np.clip(t / d, 0, 1)) ** 2
    w = spectral(rng.standard_normal(len(t)), lo=500, hi=5000) * e
    pan = np.linspace(-0.8, 0.8, len(t))
    return (w * np.cos((pan + 1) * np.pi / 4) * 1.41, w * np.sin((pan + 1) * np.pi / 4) * 1.41)


def glitch(d):
    n = int(d * SR)
    out = np.zeros(n)
    k = 0
    while k < n:
        L = int(SR * rng.choice([1 / 64, 1 / 32, 1 / 16]) * 2)
        kind = rng.integers(0, 3)
        seg = np.arange(min(L, n - k)) / SR
        if kind == 0:
            s = np.sign(np.sin(TAU * rng.uniform(200, 1800) * seg)) * 0.5
        elif kind == 1:
            s = np.round(rng.standard_normal(len(seg)) * 3) / 3 * 0.6
        else:
            s = np.zeros(len(seg))
        out[k:k + len(seg)] = s
        k += L
    return spectral(out, hi=9000)


def key_click():
    t = tl(0.03)
    return spectral(rng.standard_normal(len(t)), lo=1800, hi=8000) * np.exp(-t * 230)


def tick():
    t = tl(0.05)
    return np.sin(TAU * 2600 * t) * np.exp(-t * 300) + spectral(rng.standard_normal(len(t)), lo=3000) * np.exp(-t * 600) * 0.4


def hit():
    t = tl(0.8)
    tom = np.sin(TAU * np.cumsum(70 + 90 * np.exp(-t * 20)) / SR) * np.exp(-t * 7)
    clap = np.zeros(len(t))
    clap[: min(len(t), len(CLAP))] = CLAP[: len(t)]
    return tom * 0.8 + clap * 0.5


RISERS = {}
for e in meta["events"]:
    t0, kind = e["t"], e["type"]
    if kind == "riser":
        d = float(e.get("dur", 2.0))
        fx.add(riser(d), t0, 0.22)
    elif kind == "impact":
        fx.add(impact(), t0, 0.8)
        fx.add(CRASH, t0, 0.3)
    elif kind == "hit":
        fx.add(hit(), t0, 0.35)
    elif kind == "whoosh":
        fx.add(whoosh(), t0 - 0.25, 0.3)
    elif kind == "click":
        fx.add(tick(), t0, 0.12, pan=rng.uniform(-0.3, 0.3))
    elif kind == "pop":
        m = PENTA[int(e.get("n", 0)) % len(PENTA)]
        fx.add(pluck(m, 0.7, bright=1.4), t0, 0.16, pan=rng.uniform(-0.4, 0.4))
    elif kind == "glitch":
        fx.add(glitch(float(e.get("dur", 0.25))), t0, 0.16, pan=rng.uniform(-0.5, 0.5))
    elif kind == "type":
        fx.add(key_click(), t0, rng.uniform(0.12, 0.2), pan=rng.uniform(-0.2, 0.2))

# ---------------------------------------------------------------- mixage
# compression « sidechain » : la basse et la musique s'effacent sous le kick
duck = np.ones(N)
kt = np.arange(int(0.35 * SR)) / SR
shape = 1 - 0.65 * np.exp(-kt * 9)
for tk in kick_times:
    i = int(tk * SR)
    n = min(len(shape), N - i)
    duck[i:i + n] = np.minimum(duck[i:i + n], shape[:n])
for bus in (bass, music):
    bus.l *= duck
    bus.r *= duck


# filtre passe-bas automatisé sur la musique (ouverture de l'intro, breakdown)
def lowpass_sweep(x, f0, f1, a, b):
    i0, i1 = int(a * SR), int(b * SR)
    seg = x[i0:i1].copy()
    cut = f0 * (f1 / f0) ** np.linspace(0, 1, len(seg))
    alpha = 1 - np.exp(-TAU * cut / SR)
    y = np.empty_like(seg)
    acc = 0.0
    for k in range(len(seg)):  # filtre à un pôle, coefficient variable
        acc += alpha[k] * (seg[k] - acc)
        y[k] = acc
    x[i0:i1] = y


b0, b1 = rng_bars("01")
for ch in (music.l, music.r):
    lowpass_sweep(ch, 300, 9000, b0 * BAR, b1 * BAR)
b0, _ = rng_bars("04")
for ch in (music.l, music.r):
    lowpass_sweep(ch, 900, 9000, b0 * BAR, (b0 + 2) * BAR)

# réverbération par convolution (envoi partiel)
t = tl(2.6)
ir_l = spectral(rng.standard_normal(len(t)), hi=7000) * np.exp(-t / 0.6)
ir_r = spectral(rng.standard_normal(len(t)), hi=7000) * np.exp(-t / 0.6)
ir_l /= np.sqrt(np.sum(ir_l ** 2))
ir_r /= np.sqrt(np.sum(ir_r ** 2))


def conv(x, ir):
    n = 1 << int(np.ceil(np.log2(len(x) + len(ir))))
    return np.fft.irfft(np.fft.rfft(x, n) * np.fft.rfft(ir, n), n)[: len(x)]


send_l = music.l * 0.5 + fx.l * 0.45 + drums.l * 0.08
send_r = music.r * 0.5 + fx.r * 0.45 + drums.r * 0.08
L = drums.l * 1.0 + bass.l * 1.0 + music.l * 1.0 + fx.l * 1.0 + conv(send_l, ir_l) * 0.35
Rr = drums.r * 1.0 + bass.r * 1.0 + music.r * 1.0 + fx.r * 1.0 + conv(send_r, ir_r) * 0.35

st = np.stack([L, Rr])
st = np.tanh(st / (np.percentile(np.abs(st), 99.9) + 1e-9) * 0.6)
st /= np.abs(st).max() + 1e-9
fade = np.ones(N)
a, b = int((DUR - 1.2) * SR), int(DUR * SR)
fade[a:b] = np.linspace(1, 0, b - a) ** 1.5
fade[b:] = 0
st = (st * fade * 0.9)[:, : int(DUR * SR)]

pcm = (np.clip(st.T, -1, 1) * 32767).astype("<i2")
with wave.open(OUT, "wb") as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes(pcm.tobytes())
print(f"{OUT} : {DUR:.1f} s, {NBARS} mesures, {len(meta['events'])} événements")
