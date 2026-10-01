export const CITY_SCALES = {
  nyc: { scale: [0, 2, 3, 5, 7, 9, 10], lowMidi: 62, octaves: 2 },
  madrid: { scale: [0, 1, 4, 5, 7, 8, 10], lowMidi: 52, octaves: 2 },
  tokyo: { scale: [0, 2, 3, 7, 8], lowMidi: 69, octaves: 2 },
  hongkong: { scale: [0, 2, 4, 7, 9], lowMidi: 60, octaves: 2 }
}

const CITY_MIX = {
  nyc: {
    lead: 'epiano', hit: 'brush', bpm: [84, 106], ring: 0.9,
    chords: [[2, 5, 9, 0, 4], [7, 11, 5, 4, 9], [0, 4, 7, 11, 2], [9, 1, 7, 10, 4]], chordMinutes: 20,
    floor: 0.45, trim: 0.35, solo: 21,
    low: [180, 3], high: [4500, -4], comp: [-20, 3.5], reverb: 0.3, echo: 0.49, echoMix: 0.12, width: 0.85
  },
  madrid: {
    lead: 'guitar', hit: 'palma', bpm: [92, 124], ring: 0.8,
    chords: [[9, 0, 4], [7, 11, 2], [5, 9, 0], [4, 8, 11]], chordMinutes: 15,
    floor: 0.45, trim: 1.36, solo: 9,
    low: [220, 1], high: [3800, 0], comp: [-18, 3], reverb: 0.24, echo: 0.29, echoMix: 0.08, width: 0.7
  },
  tokyo: {
    lead: 'bell', hit: 'glass', bpm: [104, 128], ring: 1.4,
    chords: [[5, 9, 0, 4], [4, 8, 11, 2], [9, 0, 4, 7, 11], [7, 11, 2, 4]], chordMinutes: 20,
    floor: 0.45, trim: 1.03, solo: 11.5,
    low: [140, -2], high: [6000, 1], comp: [-22, 2.5], reverb: 0.4, echo: 0.39, echoMix: 0.18, width: 1
  },
  hongkong: {
    lead: 'zheng', hit: 'block', bpm: [88, 118], ring: 1.0,
    chords: [[0, 4, 7, 2], [7, 11, 2], [9, 0, 4], [4, 7, 11], [5, 9, 0], [0, 4, 7], [5, 9, 0, 2], [7, 11, 2, 5]], chordMinutes: 12,
    floor: 0.45, trim: 2.68, solo: 5.5,
    low: [200, 1.5], high: [5200, 0], comp: [-20, 3], reverb: 0.34, echo: 0.34, echoMix: 0.14, width: 0.9
  }
}

const LEAD = 0.03
const MAX_STRINGS = 240
const SWELL_GAP = 0.07
const ATTACK = { epiano: 0.004, guitar: 0.003, bell: 0.0035, zheng: 0.0035 }
const GAIN = { epiano: 0.08, guitar: 0.075, bell: 0.065, zheng: 0.07 }

const clampPan = (p) => Math.max(-0.95, Math.min(0.95, p || 0))
const clamp01 = (x) => Math.max(0, Math.min(1, x))

function impulse (ctx, seconds) {
  const rate = ctx.sampleRate
  const len = Math.floor(rate * seconds)
  const buf = ctx.createBuffer(2, len, rate)
  for (let ch = 0; ch < 2; ch++) {
    const data = buf.getChannelData(ch)
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6)
  }
  return buf
}

function oscillator (ctx, type, freq) {
  const o = ctx.createOscillator()
  o.type = type
  o.frequency.value = freq
  return o
}

function voice (chain, kind, freq, pan, hue, dest) {
  const ctx = chain.ctx
  const out = ctx.createStereoPanner()
  out.pan.value = clampPan(pan)
  out.connect(dest || chain.voiceBus)
  const amp = ctx.createGain()
  amp.gain.value = 0
  const oscs = []
  const links = []
  let bright
  let lo
  let hi
  let tb
  let glide = null
  if (kind === 'epiano') {
    const car = oscillator(ctx, 'sine', freq)
    const mod = oscillator(ctx, 'sine', freq)
    const mg = ctx.createGain()
    mg.gain.value = freq * 0.04
    mod.connect(mg).connect(car.frequency)
    const trem = ctx.createGain()
    trem.gain.value = 1
    chain.tremDepth.connect(trem.gain)
    links.push(() => chain.tremDepth.disconnect(trem.gain))
    car.connect(amp).connect(trem).connect(out)
    oscs.push(car, mod)
    bright = mg.gain
    lo = freq * 0.04
    hi = (b) => freq * (0.5 + 0.9 * b + hue * 0.3)
    tb = 0.09
  } else if (kind === 'guitar') {
    const tri = oscillator(ctx, 'triangle', freq)
    const saw = oscillator(ctx, 'sawtooth', freq)
    saw.detune.value = 4
    const sg = ctx.createGain()
    sg.gain.value = 0.28
    const lp = ctx.createBiquadFilter()
    lp.type = 'lowpass'
    lp.Q.value = 0.9
    lp.frequency.value = 420
    const body = ctx.createBiquadFilter()
    body.type = 'peaking'
    body.frequency.value = 210
    body.Q.value = 1.1
    body.gain.value = 4
    tri.connect(lp)
    saw.connect(sg).connect(lp)
    lp.connect(body).connect(amp).connect(out)
    oscs.push(tri, saw)
    bright = lp.frequency
    lo = 420
    hi = (b) => 1300 + 2000 * b + hue * 800
    tb = 0.08
  } else if (kind === 'zheng') {
    const saw = oscillator(ctx, 'sawtooth', freq)
    const tri = oscillator(ctx, 'triangle', freq)
    const tg = ctx.createGain()
    tg.gain.value = 0.6
    const vg = ctx.createGain()
    vg.gain.value = freq * 0.0035
    chain.vib.connect(vg).connect(saw.frequency)
    links.push(() => chain.vib.disconnect(vg))
    const lp = ctx.createBiquadFilter()
    lp.type = 'lowpass'
    lp.Q.value = 1.6
    lp.frequency.value = 620
    const body = ctx.createBiquadFilter()
    body.type = 'peaking'
    body.frequency.value = 1100
    body.Q.value = 2
    body.gain.value = 3
    saw.connect(lp)
    tri.connect(tg).connect(lp)
    lp.connect(body).connect(amp).connect(out)
    oscs.push(saw, tri)
    bright = lp.frequency
    lo = 620
    hi = (b) => 1900 + 2200 * b + hue * 1000
    tb = 0.12
    glide = saw.frequency
  } else {
    const car = oscillator(ctx, 'sine', freq)
    const mod = oscillator(ctx, 'sine', freq * 3.5)
    const mg = ctx.createGain()
    mg.gain.value = freq * 0.03
    mod.connect(mg).connect(car.frequency)
    car.connect(amp).connect(out)
    oscs.push(car, mod)
    bright = mg.gain
    lo = freq * 0.03
    hi = (b) => freq * (0.8 + 1.2 * b + hue * 0.4)
    tb = 0.14
  }
  const begin = ctx.currentTime
  for (const o of oscs) o.start(begin)
  oscs[0].onended = () => {
    out.disconnect()
    for (const l of links) l()
  }
  const atk = ATTACK[kind]
  const g = GAIN[kind]
  return {
    peak: 0,
    decayAt: begin,
    tau: 1,
    last: -1e9,
    struck: -1e9,
    ring: 0,
    until: begin + 1,
    done: false,
    level (t) {
      return t < this.decayAt ? this.peak : this.peak * Math.exp(-(t - this.decayAt) / this.tau)
    },
    alive (t) {
      return !this.done && t < this.until - 0.03
    },
    shape (t, peak, rise, hold, length, b, rb) {
      const d = t + hold
      const tau = Math.max(0.05, length / 5)
      amp.gain.cancelScheduledValues(t)
      amp.gain.setTargetAtTime(peak * g, t, rise)
      amp.gain.setTargetAtTime(0, d, tau)
      bright.cancelScheduledValues(t)
      bright.setTargetAtTime(hi(clamp01(b)), t, rb)
      bright.setTargetAtTime(lo, d, tb)
      this.peak = peak
      this.decayAt = d
      this.tau = tau
      this.last = t
      this.until = d + tau * 6
      for (const o of oscs) o.stop(this.until + 0.05)
    },
    strike (t, level, length, b) {
      const now = this.level(t)
      if (glide && now < level * 0.1) {
        glide.cancelScheduledValues(t)
        glide.setValueAtTime(freq * 0.97, t)
        glide.setTargetAtTime(freq, t, 0.025)
      }
      this.shape(t, Math.min(level * 1.4, Math.hypot(now, level)), atk, atk * 5, length, b, atk * 1.5)
      this.struck = t
      this.ring = length
    },
    blends (t) {
      return t - this.struck < this.ring * 1.2
    },
    swell (t, level, length, b) {
      const now = this.level(t)
      const lift = level * 0.5
      if (now >= lift) return false
      this.shape(t, lift, 0.03, 0.04, length * 0.7, b * 0.5, 0.04)
      return true
    },
    stop (t) {
      if (this.done) return
      this.done = true
      amp.gain.cancelScheduledValues(t)
      amp.gain.setTargetAtTime(0, t, 0.015)
      for (const o of oscs) o.stop(t + 0.12)
    }
  }
}

export const CitySound = {
  ctx: null,
  master: null,
  bus: null,
  voiceBus: null,
  noise: null,
  limiter: null,
  mixChain: null,
  ui: null,
  lead: LEAD,
  selGain: 1,
  city: 'nyc',
  volume: 0.5,
  unlocked: false,
  live: false,
  voices: 0,
  strings: new Map(),
  lines: new Map(),
  perLine: 3,
  poly: 0.3,
  lastHit: -1e9,
  activity: 0,
  bpm: 0,
  scheduleTime: 0,
  beats: [],
  added: 0,
  sounded: 0,
  swelled: 0,
  capped: 0,
  freezeTimer: 0,
  swoopTimer: 0,
  log: null,

  buildChain (ctx, open) {
    const c = { ctx }
    c.master = ctx.createGain()
    c.master.gain.value = this.volume
    c.gate = ctx.createGain()
    c.gate.gain.value = open ? 1 : 0
    const limiter = ctx.createDynamicsCompressor()
    limiter.threshold.value = -6
    limiter.knee.value = 6
    limiter.ratio.value = 12
    limiter.attack.value = 0.004
    limiter.release.value = 0.3
    c.limiter = limiter
    c.master.connect(c.gate).connect(limiter).connect(ctx.destination)
    c.bus = ctx.createGain()
    c.bus.gain.value = 0.9
    c.trim = ctx.createGain()
    c.low = ctx.createBiquadFilter()
    c.low.type = 'lowshelf'
    c.high = ctx.createBiquadFilter()
    c.high.type = 'highshelf'
    c.comp = ctx.createDynamicsCompressor()
    c.comp.knee.value = 10
    c.comp.attack.value = 0.015
    c.comp.release.value = 0.3
    c.bus.connect(c.trim).connect(c.low).connect(c.high).connect(c.comp).connect(c.master)
    const reverb = ctx.createConvolver()
    reverb.buffer = impulse(ctx, 3.2)
    c.reverbWet = ctx.createGain()
    c.comp.connect(reverb).connect(c.reverbWet).connect(c.master)
    c.delay = ctx.createDelay(2)
    const fb = ctx.createGain()
    fb.gain.value = 0.28
    const tone = ctx.createBiquadFilter()
    tone.type = 'lowpass'
    tone.frequency.value = 2400
    c.delaySend = ctx.createGain()
    c.comp.connect(c.delaySend).connect(c.delay)
    c.delay.connect(tone).connect(fb).connect(c.delay)
    tone.connect(c.master)
    c.noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate)
    const data = c.noise.getChannelData(0)
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1
    const trem = ctx.createOscillator()
    trem.frequency.value = 5.2
    c.tremDepth = ctx.createGain()
    c.tremDepth.gain.value = 0.05
    trem.connect(c.tremDepth)
    trem.start()
    c.vib = ctx.createOscillator()
    c.vib.frequency.value = 5.5
    c.vib.start()
    c.voiceBus = ctx.createGain()
    c.voiceBus.connect(c.bus)
    return c
  },

  ensureContext () {
    if (this.ctx) return
    const AC = window.AudioContext || window.webkitAudioContext
    const mix = this.buildChain(new AC(), false)
    this.mixChain = mix
    this.ctx = mix.ctx
    this.master = mix.master
    this.limiter = mix.limiter
    this.bus = mix.bus
    this.noise = mix.noise
    this.voiceBus = mix.voiceBus
    this.ui = this.buildChain(new AC(), true)
    const ui = this.ui.ctx
    this.unlocked = ui.state === 'running'
    ui.onstatechange = () => { if (ui.state === 'running') this.unlocked = true }
    if (!this.live && this.ctx.state === 'running') this.ctx.suspend()
    this.applyCity()
  },

  newVoiceBus () {
    this.voiceBus = this.ctx.createGain()
    this.voiceBus.gain.value = this.selGain
    this.voiceBus.connect(this.bus)
    this.mixChain.voiceBus = this.voiceBus
  },

  release (tau) {
    const old = this.voiceBus
    const strings = [...this.strings.values()]
    this.strings.clear()
    this.lines.clear()
    this.voices = 0
    this.beats = []
    const now = this.ctx.currentTime
    if (this.ctx.state === 'running') {
      old.gain.cancelScheduledValues(now)
      old.gain.setTargetAtTime(0, now, tau)
      for (const v of strings) v.stop(now + tau * 7)
      setTimeout(() => old.disconnect(), tau * 7000 + 400)
    } else {
      old.disconnect()
      for (const v of strings) v.stop(now)
    }
    this.newVoiceBus()
  },

  soloGain (share, lines) {
    const db = this.mix().solo + 2.6 * Math.log10(1 / Math.max(1e-4, share * Math.max(1, lines)))
    return Math.pow(10, Math.max(0, Math.min(32, db)) / 20)
  },

  handover (gain = 1) {
    this.selGain = gain
    if (!this.ctx) { this.lines.clear(); return }
    this.release(0.25)
  },

  mix () { return CITY_MIX[this.city] },

  applyCity () {
    if (!this.ctx) return
    const m = this.mix()
    for (const c of [this.mixChain, this.ui]) {
      const t = c.ctx.currentTime
      c.low.frequency.setTargetAtTime(m.low[0], t, 0.4)
      c.low.gain.setTargetAtTime(m.low[1], t, 0.4)
      c.high.frequency.setTargetAtTime(m.high[0], t, 0.4)
      c.high.gain.setTargetAtTime(m.high[1], t, 0.4)
      c.comp.threshold.setTargetAtTime(m.comp[0], t, 0.4)
      c.comp.ratio.setTargetAtTime(m.comp[1], t, 0.4)
      c.reverbWet.gain.setTargetAtTime(m.reverb, t, 0.4)
      c.delay.delayTime.setTargetAtTime(m.echo, t, 0.4)
      c.delaySend.gain.setTargetAtTime(m.echoMix, t, 0.4)
      c.trim.gain.setTargetAtTime(m.trim, t, 0.4)
    }
    this.beats = []
    this.lines.clear()
    this.bpm = this.targetBpm()
  },

  setVolume (v) {
    this.volume = v
    if (!this.ctx) return
    for (const c of [this.mixChain, this.ui]) c.master.gain.setTargetAtTime(v, c.ctx.currentTime, 0.05)
  },

  setCity (city) {
    if (this.city === city) return
    this.city = city
    this.applyCity()
  },

  setActivity (a) { this.activity = clamp01(a || 0) },

  targetBpm () {
    const [calm, rush] = this.mix().bpm
    return calm + (rush - calm) * this.activity
  },

  start () {
    this.live = true
    this.ensureContext()
    clearTimeout(this.freezeTimer)
    const ctx = this.ctx
    const gate = this.mixChain.gate.gain
    const open = () => {
      gate.cancelScheduledValues(ctx.currentTime)
      gate.setTargetAtTime(1, ctx.currentTime, 0.015)
    }
    const wake = [ctx.resume().then(open, () => {})]
    if (this.ui.ctx.state !== 'running') wake.push(this.ui.ctx.resume().catch(() => {}))
    return Promise.all(wake)
  },

  freeze () {
    this.live = false
    const ctx = this.ctx
    if (!ctx || ctx.state !== 'running') return
    const gate = this.mixChain.gate.gain
    gate.cancelScheduledValues(ctx.currentTime)
    gate.setTargetAtTime(0, ctx.currentTime, 0.012)
    clearTimeout(this.freezeTimer)
    this.freezeTimer = setTimeout(() => { if (!this.live && ctx.state === 'running') ctx.suspend() }, 90)
  },

  setLines (n) {
    const lines = Math.max(1, n || 1)
    this.perLine = Math.max(2, Math.min(4, Math.round(48 / lines)))
    this.poly = 1 / Math.sqrt(Math.max(1, lines * this.perLine * 0.35))
    this.lines.clear()
  },

  tempo (dt) {
    const target = this.targetBpm()
    this.bpm = this.bpm ? this.bpm + (target - this.bpm) * (1 - Math.exp(-Math.min(1, dt) / 2.5)) : target
    return this.bpm
  },

  chord () {
    const m = this.mix()
    const n = m.chords.length
    const i = Math.floor(this.scheduleTime / (m.chordMinutes * 60)) % n
    return m.chords[(i + n) % n]
  },

  string (key, e, at) {
    const v = this.strings.get(key)
    if (v && v.alive(at)) return v
    if (v) { v.stop(this.ctx.currentTime); this.strings.delete(key) }
    if (this.strings.size >= MAX_STRINGS) {
      let worst = null
      let quietest = Infinity
      for (const [k, s] of this.strings) {
        const l = s.level(at)
        if (l < quietest) { quietest = l; worst = k }
      }
      this.strings.get(worst).stop(this.ctx.currentTime)
      this.strings.delete(worst)
      this.capped++
    }
    const m = this.mix()
    const s = voice(this.mixChain, m.lead, e.freq, e.pan * m.width, e.hue, null)
    this.strings.set(key, s)
    return s
  },

  line (route) {
    let l = this.lines.get(route)
    if (!l) { l = { busy: [], hit: -1e9 }; this.lines.set(route, l) }
    return l
  },

  departures (evs, from, to, dt) {
    const out = new Array(evs.length).fill(false)
    if (!evs.length || !this.ctx || this.ctx.state !== 'running') return out
    const m = this.mix()
    const start = this.ctx.currentTime + LEAD
    const span = Math.max(1e-6, to - from)
    const stretch = Math.min(0.1, Math.max(0, dt || 0))
    this.scheduleTime = to
    const chord = this.chord()
    const a = this.activity
    const base = m.floor + (1 - m.floor) * a
    const low = CITY_SCALES[this.city].lowMidi
    const groups = new Map()
    const accents = new Map()
    for (let i = 0; i < evs.length; i++) {
      const e = evs[i]
      this.added++
      if (e.accent) accents.set(e.route, Math.min(accents.get(e.route) ?? Infinity, e.sec))
      const key = e.route + '|' + e.midi
      const g = groups.get(key)
      if (g) { g.n++; g.velocity = Math.max(g.velocity, e.velocity); g.idx.push(i); continue }
      groups.set(key, { key, e, n: 1, velocity: e.velocity, idx: [i] })
    }
    const when = (sec, midi) => start + clamp01((sec - from) / span) * stretch + clamp01((midi - low) / 24) * 0.006
    for (const g of groups.values()) {
      const e = g.e
      const at = when(e.sec, e.midi)
      const tone = chord.includes(((e.midi % 12) + 12) % 12)
      const length = m.ring * (tone ? 1.25 : 0.8) * (1 - 0.35 * a)
      const level = base * this.poly * (0.55 + 0.45 * g.velocity) * (tone ? 1 : 0.62) * (e.freq > 800 ? 0.82 : 1) * Math.min(1.4, Math.sqrt(g.n))
      const key = this.city + '|' + g.key
      const held = this.strings.get(key)
      let heard = false
      const b = 0.15 + 0.25 * g.velocity + 0.15 * a
      if (held && held.alive(at) && held.blends(at)) {
        if (at - held.last >= SWELL_GAP && held.swell(at, level, length, b)) {
          this.swelled++
          if (this.log) this.log.push({ at, sec: e.sec, freq: e.freq, midi: e.midi, level: level * 0.5, tone, swell: true, routes: [e.route], stop: e.stop_name })
        }
        heard = true
      } else {
        const line = this.line(e.route)
        let slot = line.busy.findIndex((t) => t <= at)
        if (slot < 0 && line.busy.length < this.perLine) slot = line.busy.length
        if (slot >= 0) {
          const s = this.string(key, e, at)
          s.strike(at, level, length, b)
          line.busy[slot] = at + length * 0.7
          heard = true
          this.sounded++
          if (this.log) this.log.push({ at, sec: e.sec, freq: e.freq, midi: e.midi, level, tone, routes: [e.route], stop: e.stop_name })
        }
      }
      if (heard) for (const i of g.idx) out[i] = true
    }
    let hits = 0
    let hitSec = Infinity
    for (const [route, sec] of accents) {
      const line = this.line(route)
      const at = when(sec, low)
      if (at - line.hit < 0.8) continue
      line.hit = at
      hits++
      hitSec = Math.min(hitSec, sec)
    }
    if (hits) {
      const at = when(hitSec, low)
      if (at - this.lastHit >= 30 / (this.bpm || 100)) {
        this.lastHit = at
        this.hit(this.mixChain, at, base * this.poly * 1.6 * Math.min(1.6, Math.sqrt(hits)))
        this.beats.push(at)
        if (this.beats.length > 16) this.beats.shift()
        if (this.log) this.log.push({ at, kind: 'hit', count: hits })
      }
    }
    this.voices = this.strings.size
    return out
  },

  reap () {
    if (!this.ctx) return
    const now = this.ctx.currentTime
    for (const [k, v] of this.strings) {
      if (!v.alive(now)) {
        v.stop(now)
        this.strings.delete(k)
      }
    }
    this.voices = this.strings.size
  },

  beat () {
    if (!this.ctx || !this.beats.length) return 0
    const now = this.ctx.currentTime
    let last = -1
    for (let i = this.beats.length - 1; i >= 0; i--) if (this.beats[i] <= now) { last = this.beats[i]; break }
    return last < 0 ? 0 : Math.exp(-(now - last) / 0.18)
  },

  once (chain, freq, pan, hue, t, level, length, dest, b) {
    const v = voice(chain, this.mix().lead, freq, pan, hue, dest)
    v.strike(t, level, length, b)
  },

  hit (chain, time, level) {
    const ctx = chain.ctx
    const kind = this.mix().hit
    const burst = (at, freq, q, type, peak, len, pan) => {
      const src = ctx.createBufferSource()
      src.buffer = chain.noise
      const f = ctx.createBiquadFilter()
      f.type = type
      f.frequency.value = freq
      f.Q.value = q
      const g = ctx.createGain()
      g.gain.setValueAtTime(0, at)
      g.gain.setTargetAtTime(peak, at, 0.0015)
      g.gain.setTargetAtTime(0, at + 0.006, len / 4)
      const p = ctx.createStereoPanner()
      p.pan.value = pan
      src.connect(f).connect(g).connect(p).connect(chain.voiceBus)
      src.onended = () => p.disconnect()
      src.start(at, Math.random() * 0.5)
      src.stop(at + len * 1.6 + 0.05)
    }
    const l = Math.min(1, level)
    if (kind === 'brush') burst(time, 2600, 0.5, 'bandpass', 0.02 * l, 0.22, -0.25)
    else if (kind === 'palma') {
      burst(time, 1500, 1.1, 'bandpass', 0.026 * l, 0.08, -0.15)
      burst(time + 0.016, 2000, 1.1, 'bandpass', 0.014 * l, 0.07, 0.2)
    } else if (kind === 'block') burst(time, 1250, 6, 'bandpass', 0.04 * l, 0.08, 0.2)
    else burst(time, 4800, 3, 'bandpass', 0.012 * l, 0.06, 0.3)
  },

  playNote ({ freq, pan = 0, hue = 0, velocity = 0.8 }) {
    if (!freq) return
    this.ensureContext()
    const ui = this.ui
    const go = () => {
      if (ui.ctx.state !== 'running') return
      const t = ui.ctx.currentTime + 0.01
      const w = this.mix().width
      this.once(ui, freq, pan * w, hue, t, velocity, 1.4, null, 0.6)
      this.once(ui, freq * 2, pan * w, hue, t + 0.012, velocity * 0.28, 0.9, null, 0.4)
      if (this.log) this.log.push({ at: ui.ctx.currentTime, kind: 'hover', freq })
    }
    if (ui.ctx.state === 'running') go()
    else ui.ctx.resume().then(go, () => {})
  },

  hush () {
    this.lines.clear()
    if (this.ctx) this.release(0.04)
  },

  swoop (seconds, depth = 0.2) {
    if (!this.ctx || this.ctx.state !== 'running') return
    const ctx = this.ctx
    const now = ctx.currentTime
    const g = this.bus.gain
    const dip = Math.min(0.5, seconds * 0.25)
    g.cancelScheduledValues(now)
    g.setTargetAtTime(depth, now, dip / 3)
    g.setTargetAtTime(0.9, now + dip, (seconds - dip) / 3)
    clearTimeout(this.swoopTimer)
    this.swoopTimer = setTimeout(() => this.bus.gain.setTargetAtTime(0.9, this.ctx.currentTime, 0.2), seconds * 1000 + 200)
    const src = ctx.createBufferSource()
    src.buffer = this.noise
    src.loop = true
    const bp = ctx.createBiquadFilter()
    bp.type = 'bandpass'
    bp.Q.value = 1.4
    bp.frequency.setValueAtTime(260, now)
    bp.frequency.exponentialRampToValueAtTime(2400, now + seconds * 0.45)
    bp.frequency.exponentialRampToValueAtTime(320, now + seconds)
    const wg = ctx.createGain()
    wg.gain.setValueAtTime(0, now)
    wg.gain.linearRampToValueAtTime(0.07, now + seconds * 0.4)
    wg.gain.linearRampToValueAtTime(0, now + seconds)
    src.connect(bp).connect(wg).connect(this.master)
    src.start(now)
    src.stop(now + seconds)
  },

  clear () { this.lines.clear() },

  transition (city) {
    this.clear()
    if (!this.ctx) { this.city = city; return }
    this.swoop(2.6)
    this.setCity(city)
  },

  tick (level = 0.6) {
    if (!this.ui || this.ui.ctx.state !== 'running') return
    const ctx = this.ui.ctx
    const now = ctx.currentTime
    const osc = ctx.createOscillator()
    osc.type = 'triangle'
    osc.frequency.setValueAtTime(1600, now)
    osc.frequency.exponentialRampToValueAtTime(700, now + 0.025)
    const g = ctx.createGain()
    g.gain.setValueAtTime(0, now)
    g.gain.setTargetAtTime(0.03 * level, now, 0.001)
    g.gain.setTargetAtTime(0, now + 0.004, 0.008)
    osc.connect(g).connect(this.ui.master)
    osc.start(now)
    osc.stop(now + 0.07)
  },

  resume () {
    if (!this.ctx) return
    const wake = []
    if (this.ui.ctx.state !== 'running') wake.push(this.ui.ctx.resume().catch(() => {}))
    if (this.live && this.ctx.state !== 'running') wake.push(this.ctx.resume().catch(() => {}))
    return wake.length ? Promise.all(wake) : undefined
  }
}
