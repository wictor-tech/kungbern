#!/usr/bin/env python3
"""LUPNUMBER ljudprototyp: originalmusik (syntetiserad), ljudeffekter och mix – helt genererat, inga licenser.
Användning:
  python3 synth.py music --duration 60 --sections 0:intro,4:tension,14:lift,50:close --out music.wav
  python3 synth.py sfx --out-dir sfx
  python3 synth.py mix --music music.wav --events events.json --sfx-dir sfx --duration 60 --out mix.wav [--vo vo.wav] [--music-gain -3]
Allt är ett TEMP-SPÅR för utvärdering. Byt mot licensierad musik och inspelad röst inför publicering.
"""
import argparse, json, math, os, struct, wave
import numpy as np

SR = 48000

def wav_write(path, x):
    x = np.clip(x, -1, 1)
    with wave.open(path, 'wb') as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR)
        w.writeframes((x * 32767).astype('<i2').tobytes())

def wav_read(path):
    with wave.open(path, 'rb') as w:
        n = w.getnframes(); ch = w.getnchannels(); sw = w.getsampwidth(); sr = w.getframerate()
        raw = w.readframes(n)
    if sw == 2: x = np.frombuffer(raw, dtype='<i2').astype(np.float32) / 32768
    elif sw == 4: x = np.frombuffer(raw, dtype='<i4').astype(np.float32) / 2147483648
    else: raise SystemExit('ostödd wav')
    if ch > 1: x = x.reshape(-1, ch).mean(axis=1)
    if sr != SR: x = np.interp(np.arange(0, len(x), sr / SR), np.arange(len(x)), x).astype(np.float32)
    return x

def env(n, a, d, s, r, total):
    """ADSR i sampel över total längd (n = total). a,d,r i sekunder, s = sustainnivå."""
    t = np.arange(n) / SR
    e = np.ones(n) * s
    A = int(a * SR); D = int(d * SR); R = int(r * SR)
    if A: e[:A] = np.linspace(0, 1, A)
    if D: e[A:A + D] = np.linspace(1, s, min(D, max(0, n - A)))[:max(0, min(D, n - A))]
    if R and R < n: e[-R:] *= np.linspace(1, 0, R)
    return e

def tone(freq, dur, harm=(1.0, 0.35, 0.12), a=0.02, d=0.1, s=0.8, r=0.1, detune=0.0, vib=0.0):
    n = int(dur * SR); t = np.arange(n) / SR
    out = np.zeros(n)
    for k, g in enumerate(harm, start=1):
        f = freq * k
        ph = 2 * np.pi * f * t
        if vib: ph += vib * np.sin(2 * np.pi * 5.0 * t)
        out += g * np.sin(ph)
        if detune: out += g * 0.7 * np.sin(2 * np.pi * f * (1 + detune) * t)
    return out * env(n, a, d, s, r, n) / sum(harm)

def lowpass(x, cutoff):
    rc = 1.0 / (2 * np.pi * cutoff); dt = 1.0 / SR; alpha = dt / (rc + dt)
    y = np.empty_like(x); acc = 0.0
    # vektoriserad IIR via lfilter-ekvivalent (enkel loop i numpy är långsam; använd cumulative trick)
    b = alpha; a = 1 - alpha
    # y[n] = b*x[n] + a*y[n-1]  → implementera med scipy-fri rekursion i block
    y = np.zeros_like(x)
    prev = 0.0
    step = 4096
    for i in range(0, len(x), step):
        seg = x[i:i + step]
        # exakt rekursion med potenser av a
        k = np.arange(len(seg))
        pw = a ** (k + 1)
        # y_i = a^(i+1)*prev + b * sum_{j<=i} a^(i-j) x_j
        conv = np.convolve(seg, a ** np.arange(len(seg)))[:len(seg)] * b
        yy = pw * prev + conv
        y[i:i + step] = yy
        prev = yy[-1]
    return y

def highpass(x, cutoff):
    return x - lowpass(x, cutoff)

def noise(n, seed=1):
    return np.random.default_rng(seed).standard_normal(n)

def reverb(x, mix=0.18, taps=((0.031, 0.5), (0.053, 0.4), (0.079, 0.3), (0.113, 0.22), (0.151, 0.15))):
    y = x.copy()
    for d, g in taps:
        k = int(d * SR)
        y[k:] += g * mix * x[:-k] if k < len(x) else 0
    return y

def place(buf, x, t, gain_db=0.0):
    i = int(t * SR); g = 10 ** (gain_db / 20)
    j = min(len(buf), i + len(x))
    if i < len(buf) and j > i: buf[i:j] += x[:j - i] * g

NOTE = {'C': 0, 'D': 2, 'E': 4, 'F': 5, 'G': 7, 'A': 9, 'B': 11}
def hz(name):
    n, octv = name[:-1], int(name[-1]); semi = NOTE[n[0]] + (1 if n.endswith('#') else -1 if n.endswith('b') else 0)
    return 440.0 * 2 ** ((semi + 12 * (octv - 4) - 9) / 12)

CHORDS = {
    'Am': ['A2', 'E3', 'A3', 'C4', 'E4'], 'Fmaj7': ['F2', 'C3', 'A3', 'E4'], 'C': ['C3', 'G3', 'C4', 'E4'],
    'G': ['G2', 'D3', 'B3', 'D4'], 'F': ['F2', 'C3', 'F3', 'A3'], 'Dm': ['D3', 'A3', 'D4', 'F4'], 'Csus': ['C3', 'G3', 'C4', 'F4'],
}

def music(duration, sections):
    """sections: lista av (starttid, namn). Namn: intro, tension, lift, close."""
    n = int(duration * SR); out = np.zeros(n)
    bpm = 92; beat = 60 / bpm; bar = 4 * beat
    secs = sorted(sections)
    def section_at(t):
        name = secs[0][1]
        for s, nm in secs:
            if t >= s: name = nm
        return name
    # Pad-ackord per takt
    t = 0.0; i = 0
    prog = {'intro': ['Am', 'Am'], 'tension': ['Am', 'Fmaj7', 'Am', 'Csus'], 'lift': ['C', 'G', 'Am', 'F'], 'close': ['F', 'C', 'C', 'C'], 'silence': ['C'], 'waltz': ['C', 'F', 'G', 'C'], 'pulse': ['C', 'G', 'Am', 'F']}
    while t < duration:
        sec = section_at(t)
        if sec == 'silence':
            t += beat; continue
        if sec == 'waltz':
            # Artig hotellobby-vals i 3/4: bas på ettan, två lätta ackord på två och tre, enkel melodi. Växer i styrka genom sektionen.
            sec_start = max([ss for ss, nm in secs if nm == 'waltz' and ss <= t]); sec_end = min([ss for ss, nm in secs if ss > t] + [duration])
            grow = (t - sec_start) / max(1e-6, sec_end - sec_start)
            vol = -27 + 11 * grow
            wb = 60 / 112.0
            chord = prog['waltz'][i % 4]; notes = CHORDS[chord]
            place(out, tone(hz(notes[0]), wb * 0.9, harm=(1.0, 0.3), a=0.01, d=0.2, s=0.4, r=0.15), t, vol - 2)
            for k in (1, 2):
                for nm in notes[1:4]:
                    place(out, tone(hz(nm), wb * 0.55, harm=(1.0, 0.25), a=0.01, d=0.15, s=0.3, r=0.1), t + k * wb, vol - 7)
            mel = ['E5', 'G5', 'C6', 'G5', 'F5', 'A5', 'G5', 'E5', 'D5', 'F5', 'B5', 'G5', 'C5', 'E5', 'G5', 'C6']
            for k in range(3):
                place(out, tone(hz(mel[(i * 3 + k) % len(mel)]), wb * 0.8, harm=(1.0, 0.4, 0.1), a=0.01, d=0.25, s=0.35, r=0.15, vib=0.02), t + k * wb, vol - 4)
            t += 3 * wb; i += 1; continue
        chord = prog[sec][i % len(prog[sec])]
        dur = bar * (2 if sec in ('intro', 'close') else 1)
        bright = 1.0 if sec in ('lift', 'close', 'pulse') else 0.6
        for k, nm in enumerate(CHORDS[chord]):
            g = 0.22 if k == 0 else 0.14
            x = tone(hz(nm), dur + 0.6, harm=(1.0, 0.5 * bright, 0.2 * bright, 0.08 * bright), a=0.9, d=0.4, s=0.85, r=0.6, detune=0.003, vib=0.03 if k else 0)
            place(out, x, t, -14 + (2 if sec == 'close' else 0) - (17 if sec == 'pulse' else 0))
        t += dur; i += 1
    # Puls (låg) under intro/tension, kick + hihat under lift/close
    tb = 0.0; b = 0
    while tb < duration:
        sec = section_at(tb)
        if sec in ('intro', 'tension') and b % 2 == 0:
            place(out, tone(55, 0.35, harm=(1.0, 0.2), a=0.005, d=0.1, s=0.3, r=0.2), tb, -20 if sec == 'intro' else -17)
        if sec in ('lift', 'close', 'pulse'):
            patt = -14 if sec == 'pulse' else 0
            if b % 2 == 0: place(out, tone(50, 0.3, harm=(1.0, 0.3), a=0.002, d=0.08, s=0.2, r=0.15), tb, -16 + patt)
            hh = highpass(noise(int(0.05 * SR), seed=b), 6000) * env(int(0.05 * SR), 0.001, 0.02, 0.2, 0.02, 0)
            place(out, hh, tb + beat / 2, -34 + patt)
        if sec == 'tension' and b % 1 == 0:
            place(out, tone(hz('E4'), 0.22, harm=(1.0, 0.6, 0.2), a=0.003, d=0.12, s=0.2, r=0.08), tb + beat / 2, -24)
        tb += beat; b += 1
    # Arpeggio i lift
    ta = 0.0; a_i = 0
    arp = ['C5', 'E5', 'G5', 'B5', 'G5', 'E5']
    while ta < duration:
        if section_at(ta) in ('lift', 'pulse'):
            place(out, tone(hz(arp[a_i % len(arp)]), 0.35, harm=(1.0, 0.4, 0.1), a=0.004, d=0.2, s=0.25, r=0.1), ta, -26 - (16 if section_at(ta) == 'pulse' else 0))
        ta += beat / 2; a_i += 1
    # Lyft-sväll vid första 'lift' och slutslag vid 'close'
    for s, nm in secs:
        if nm == 'lift':
            sw = highpass(noise(int(1.6 * SR), 7), 1200) * env(int(1.6 * SR), 1.3, 0.1, 1.0, 0.25, 0)
            place(out, lowpass(sw, 5000), max(0, s - 1.4), -30)
        if nm == 'close':
            hit = tone(hz('C2'), 2.5, harm=(1.0, 0.4, 0.15), a=0.003, d=0.6, s=0.4, r=1.5)
            place(out, hit, s, -16)
    out = reverb(out, 0.22)
    # Hård tystnad: allt (även efterklang) nollas i 'silence'-sektioner, med 4 ms nedtoning så det inte knäpper
    for idx, (s, nm) in enumerate(secs):
        if nm != 'silence': continue
        e = secs[idx + 1][0] if idx + 1 < len(secs) else duration
        a, b_ = int(s * SR), int(min(duration, e) * SR)
        f = min(int(0.004 * SR), max(0, b_ - a))
        if f > 0: out[a:a + f] *= np.linspace(1, 0, f)
        out[a + f:b_] = 0
    # fade in/out
    fi = int(0.8 * SR); fo = int(2.5 * SR)
    out[:fi] *= np.linspace(0, 1, fi); out[-fo:] *= np.linspace(1, 0, fo)
    return out * 0.9 / max(1e-6, np.max(np.abs(out)))

def sfx_bank(out_dir):
    os.makedirs(out_dir, exist_ok=True)
    bank = {}
    n = int(1.4 * SR); t = np.arange(n) / SR
    motor = (np.sin(2 * np.pi * 95 * t + 0.6 * np.sin(2 * np.pi * 3 * t)) + 0.4 * np.sin(2 * np.pi * 190 * t)) * env(n, 0.15, 0.2, 0.7, 0.3, n)
    motor += lowpass(noise(n, 3), 900) * 0.25 * env(n, 0.1, 0.2, 0.6, 0.3, n)
    clunk = tone(60, 0.25, harm=(1.0, 0.3), a=0.002, d=0.08, s=0.2, r=0.1); place(motor, clunk, 1.15, -2)
    bank['gate_open'] = motor * 0.6
    b = np.zeros(int(0.35 * SR)); place(b, tone(1568, 0.07, harm=(1.0, 0.2), a=0.004, d=0.02, s=0.8, r=0.02), 0.0); place(b, tone(1568, 0.07, harm=(1.0, 0.2), a=0.004, d=0.02, s=0.8, r=0.02), 0.16)
    bank['beep'] = b * 0.5
    bank['tick'] = (tone(2000, 0.03, harm=(1.0,), a=0.001, d=0.01, s=0.3, r=0.01) + highpass(noise(int(0.03 * SR), 5), 3000) * 0.3 * env(int(0.03 * SR), 0.0005, 0.005, 0.2, 0.01, 0)) * 0.6
    c = np.zeros(int(0.5 * SR)); place(c, tone(hz('E5'), 0.16, harm=(1.0, 0.4), a=0.004, d=0.05, s=0.6, r=0.06), 0.0); place(c, tone(hz('B5'), 0.26, harm=(1.0, 0.4), a=0.004, d=0.06, s=0.6, r=0.12), 0.13)
    bank['confirm'] = reverb(c, 0.12) * 0.5
    n = int(0.55 * SR); t = np.arange(n) / SR
    wn = noise(n, 11); sweep = np.zeros(n)
    for k in range(0, n, 2400):
        f = 300 + 2200 * (k / n)
        seg = wn[k:k + 2400]; sweep[k:k + 2400] = highpass(lowpass(seg, f * 1.6), f * 0.6)
    bank['whoosh'] = sweep * env(n, 0.12, 0.1, 0.8, 0.25, n) * 0.9
    n = int(3.0 * SR); rum = lowpass(noise(n, 13), 220) * env(n, 1.0, 0.4, 0.7, 1.2, n)
    t = np.arange(n) / SR; rum += 0.5 * np.sin(2 * np.pi * 45 * t) * env(n, 1.0, 0.4, 0.7, 1.2, n)
    bank['truck_pass'] = rum / max(1e-6, np.max(np.abs(rum))) * 0.5
    n = int(0.7 * SR); ab = highpass(noise(n, 17), 1800) * env(n, 0.01, 0.15, 0.3, 0.45, n)
    bank['air_brake'] = ab * 0.5
    n = int(1.3 * SR); t = np.arange(n) / SR; gl = np.sin(2 * np.pi * (440 + 440 * t / 1.3) * t) * env(n, 0.3, 0.3, 0.5, 0.4, n)
    gl += highpass(noise(n, 19), 2500) * 0.2 * env(n, 0.8, 0.1, 0.8, 0.3, n)
    bank['lift'] = reverb(gl, 0.25) * 0.35
    n = int(0.9 * SR); cm = lowpass(noise(n, 23), 600) * env(n, 0.3, 0.1, 0.6, 0.4, n)
    bank['cam_move'] = cm * 0.35
    # Brittisk dubbelring (sladdtelefon)
    r = np.zeros(int(1.2 * SR)); t = np.arange(int(0.4 * SR)) / SR
    burst = (np.sin(2 * np.pi * 400 * t) + np.sin(2 * np.pi * 450 * t)) * 0.5 * (0.6 + 0.4 * np.sign(np.sin(2 * np.pi * 25 * t))) * env(len(t), 0.005, 0.05, 0.9, 0.03, 0)
    place(r, burst, 0.0); place(r, burst, 0.5)
    bank['ring'] = r * 0.5
    # Mobil: tre snabba toner
    m = np.zeros(int(0.7 * SR))
    for k, f in enumerate([880, 1108, 1318]): place(m, tone(f, 0.12, harm=(1.0, 0.2), a=0.003, d=0.04, s=0.5, r=0.04), k * 0.14)
    bank['ring_mobile'] = m * 0.5
    # Komradio: brus + pip
    n = int(0.6 * SR); rd = highpass(lowpass(noise(n, 31), 3500), 600) * env(n, 0.02, 0.1, 0.5, 0.2, n) * 0.5
    place(rd, tone(1200, 0.08, harm=(1.0,), a=0.002, d=0.02, s=0.6, r=0.02), 0.0, -4)
    bank['radio'] = rd
    # Tangentbord med ett finger
    ty = np.zeros(int(1.4 * SR))
    for k in range(6): place(ty, bank['tick'], k * 0.22 + (0.03 if k % 2 else 0), -2)
    bank['typing'] = ty
    # Truck-/lastbilstuta
    n = int(0.45 * SR); t = np.arange(n) / SR
    hn = (np.sign(np.sin(2 * np.pi * 420 * t)) * 0.4 + np.sin(2 * np.pi * 420 * t) * 0.6 + 0.3 * np.sin(2 * np.pi * 630 * t)) * env(n, 0.02, 0.05, 0.8, 0.1, n)
    bank['horn'] = lowpass(hn, 2500) * 0.35
    # Steg på asfalt
    st = np.zeros(int(2.0 * SR))
    for k in range(4): place(st, lowpass(noise(int(0.08 * SR), 40 + k), 500) * env(int(0.08 * SR), 0.003, 0.03, 0.2, 0.04, 0), k * 0.48, -6)
    bank['steps'] = st * 0.8
    # Fågel
    ch = np.zeros(int(0.5 * SR)); t = np.arange(int(0.09 * SR)) / SR
    tw = np.sin(2 * np.pi * (3200 + 1200 * t / 0.09) * t) * env(len(t), 0.005, 0.03, 0.6, 0.03, 0)
    place(ch, tw, 0.0); place(ch, tw * 0.8, 0.16)
    bank['chirp'] = ch * 0.25
    # Backningspip (tre pip)
    bp = np.zeros(int(1.3 * SR))
    for k in range(3): place(bp, tone(1000, 0.16, harm=(1.0, 0.1), a=0.003, d=0.03, s=0.8, r=0.03), k * 0.45)
    bank['beeper'] = bp * 0.4
    # Mugg som ställs ned
    n = int(0.12 * SR); cup = lowpass(noise(n, 51), 1800) * env(n, 0.001, 0.03, 0.2, 0.06, n)
    place(cup, tone(900, 0.06, harm=(1.0, 0.5), a=0.001, d=0.02, s=0.3, r=0.03), 0.0, -8)
    bank['cup'] = cup * 0.5
    # Kort ljudmärke för wordmark
    lg = np.zeros(int(1.2 * SR))
    for k, nm in enumerate(['C5', 'G5']): place(lg, tone(hz(nm), 0.6, harm=(1.0, 0.4, 0.1), a=0.01, d=0.2, s=0.5, r=0.3), k * 0.12)
    bank['logo'] = reverb(lg, 0.2) * 0.4
    n = int(1.2 * SR); t = np.arange(n) / SR
    idle = lowpass(noise(n, 29), 160) * 0.6 + 0.3 * np.sin(2 * np.pi * 30 * t) * (1 + 0.2 * np.sin(2 * np.pi * 7 * t))
    bank['truck_idle'] = idle * env(n, 0.2, 0.1, 0.8, 0.3, n) * 0.4
    for k, v in bank.items(): wav_write(os.path.join(out_dir, k + '.wav'), v)
    return list(bank)

def mix(music_path, events_path, sfx_dir, duration, out, vo_path=None, music_gain=-3.0):
    n = int(duration * SR); buf = np.zeros(n)
    if music_path and os.path.exists(music_path):
        m = wav_read(music_path)[:n]; mm = np.zeros(n); mm[:len(m)] = m
        buf += mm * 10 ** (music_gain / 20)
    events = json.load(open(events_path)) if events_path and os.path.exists(events_path) else []
    cache = {}
    for e in events:
        name = e.get('sfx'); p = os.path.join(sfx_dir, name + '.wav')
        if not os.path.exists(p): continue
        if name not in cache: cache[name] = wav_read(p)
        place(buf, cache[name], float(e.get('t', 0)), float(e.get('gain', 0)))
    if vo_path and os.path.exists(vo_path):
        vo = wav_read(vo_path)[:n]; v = np.zeros(n); v[:len(vo)] = vo
        # ducking: följ talets envelope och sänk musik/sfx 8 dB under tal
        envf = lowpass(np.abs(v), 4.0); envf = envf / max(1e-6, envf.max())
        duck = 1 - 0.6 * np.clip(envf * 3, 0, 1)
        buf = buf * duck + v
    peak = np.max(np.abs(buf))
    if peak > 0.98: buf = buf * 0.98 / peak
    wav_write(out, buf)

if __name__ == '__main__':
    ap = argparse.ArgumentParser(); sub = ap.add_subparsers(dest='cmd', required=True)
    a = sub.add_parser('music'); a.add_argument('--duration', type=float, required=True); a.add_argument('--sections', default='0:intro,4:tension,14:lift,50:close'); a.add_argument('--out', required=True)
    b = sub.add_parser('sfx'); b.add_argument('--out-dir', required=True)
    c = sub.add_parser('mix'); c.add_argument('--music'); c.add_argument('--events'); c.add_argument('--sfx-dir', required=True); c.add_argument('--duration', type=float, required=True); c.add_argument('--out', required=True); c.add_argument('--vo'); c.add_argument('--music-gain', type=float, default=-3.0)
    args = ap.parse_args()
    if args.cmd == 'music':
        secs = [(float(s.split(':')[0]), s.split(':')[1]) for s in args.sections.split(',')]
        wav_write(args.out, music(args.duration, secs)); print('musik →', args.out)
    elif args.cmd == 'sfx':
        print('sfx →', sfx_bank(args.out_dir))
    else:
        mix(args.music, args.events, args.sfx_dir, args.duration, args.out, args.vo, args.music_gain); print('mix →', args.out)
