let S = null
const engine = import('./strudel.js').then((m) => { S = m; return m })

export const CITY_SCALES = {
  nyc: { scale: [0, 2, 3, 5, 7, 9, 10], lowMidi: 62, octaves: 2 },
  madrid: { scale: [0, 1, 4, 5, 7, 8, 10], lowMidi: 52, octaves: 2 },
  tokyo: { scale: [0, 2, 3, 7, 8], lowMidi: 69, octaves: 2 },
  hongkong: { scale: [0, 2, 4, 7, 9], lowMidi: 60, octaves: 2 }
}

export const CITY_CODE = {
  nyc: {
    voice: 's("gm_epiano1").room(.3).roomsize(3).delay(.12).delaytime(.49).delayfeedback(.28).lpf(4500)',
    hit: 's("white").hpf(5000).decay(.12).sustain(0).gain(.5)'
  },
  madrid: {
    voice: 's("gm_acoustic_guitar_nylon").room(.24).roomsize(1.6).delay(.08).delaytime(.29).delayfeedback(.25).lpf(3800)',
    hit: 's("pink").bandf(1500).bandq(1.1).decay(.07).sustain(0).gain(.7)'
  },
  tokyo: {
    voice: 's("gm_celesta").room(.4).roomsize(4).delay(.18).delaytime(.39).delayfeedback(.3).lpf(6000)',
    hit: 's("white").bandf(4800).bandq(3).decay(.05).sustain(0).gain(.4)'
  },
  hongkong: {
    voice: 's("gm_koto").room(.34).roomsize(2.5).delay(.14).delaytime(.34).delayfeedback(.28).lpf(5200)',
    hit: 's("gm_woodblock").note(76).gain(.6)'
  }
}

const CITY_MIX = {
  nyc: {
    bpm: [84, 106], ring: 0.9, chords: [[2, 5, 9, 0, 4], [7, 11, 5, 4, 9], [0, 4, 7, 11, 2], [9, 1, 7, 10, 4]], chordMinutes: 20,
    floor: 0.45, trim: 0.74, solo: 21, width: 0.85
  },
  madrid: {
    bpm: [92, 124], ring: 0.8, chords: [[9, 0, 4], [7, 11, 2], [5, 9, 0], [4, 8, 11]], chordMinutes: 15,
    floor: 0.45, trim: 2.34, solo: 9, width: 0.7
  },
  tokyo: {
    bpm: [104, 128], ring: 1.4, chords: [[5, 9, 0, 4], [4, 8, 11, 2], [9, 0, 4, 7, 11], [7, 11, 2, 4]], chordMinutes: 20,
    floor: 0.45, trim: 0.84, solo: 11.5, width: 1
  },
  hongkong: {
    bpm: [88, 118], ring: 1.0, chords: [[0, 4, 7, 2], [7, 11, 2], [9, 0, 4], [4, 7, 11], [5, 9, 0], [0, 4, 7], [5, 9, 0, 2], [7, 11, 2, 5]], chordMinutes: 12,
    floor: 0.45, trim: 5.56, solo: 5.5, width: 0.9
  }
}

const LEAD = 0.05
const MAX_STRINGS = 240
const SWELL_GAP = 0.3
const GAIN = 0.5
const HOVER = 0.35
const HIT_NOTE = 72
const UI_ORBIT = 99
const KINDS = ['voice', 'hit']
const STORE = 'transit-sonified:strudel:'
const BANKS = [
  'https://raw.githubusercontent.com/felixroos/dough-samples/main/Dirt-Samples.json',
  'https://raw.githubusercontent.com/felixroos/dough-samples/main/tidal-drum-machines.json'
]

const wait = (ms, value) => new Promise((resolve) => setTimeout(() => resolve(value), ms))
const clampPan = (p) => Math.max(-0.95, Math.min(0.95, p || 0))
const clamp01 = (x) => Math.max(0, Math.min(1, x))

function values (haps) {
  const out = []
  for (const h of haps) {
    const v = typeof h.value === 'string' ? { s: h.value } : h.value
    if (v && typeof v === 'object' && !Array.isArray(v)) out.push(v)
  }
  return out
}

function soundsOf (pat) {
  const seen = new Map()
  let haps = []
  try { haps = pat.queryArc(0, 24) } catch { return [] }
  for (const v of values(haps.slice(0, 4000))) {
    const s = String(v.s ?? 'triangle').toLowerCase()
    const key = s + ':' + (v.n ?? 0) + ':' + (v.note ?? '')
    if (!seen.has(key)) seen.set(key, { s, n: v.n, note: v.note })
  }
  return [...seen.values()]
}

function readSaved (city) {
  try { return JSON.parse(localStorage.getItem(STORE + city) || 'null') } catch { return null }
}

function writeSaved (city, code) {
  try {
    const def = CITY_CODE[city]
    if (code.voice === def.voice && code.hit === def.hit) localStorage.removeItem(STORE + city)
    else localStorage.setItem(STORE + city, JSON.stringify(code))
  } catch { }
}

function tone () {
  return {
    peak: 0,
    decayAt: -1e9,
    tau: 1,
    last: -1e9,
    struck: -1e9,
    ring: 0,
    until: -1e9,
    level (t) {
      return t < this.decayAt ? this.peak : this.peak * Math.exp(-(t - this.decayAt) / this.tau)
    },
    alive (t) {
      return t < this.until - 0.03
    },
    shape (t, peak, hold, length) {
      this.peak = peak
      this.decayAt = t + hold
      this.tau = Math.max(0.05, length / 5)
      this.last = t
      this.until = this.decayAt + this.tau * 6
    },
    strike (t, level, length) {
      this.shape(t, Math.min(level * 1.4, Math.hypot(this.level(t), level)), length * 0.35, length)
      this.struck = t
      this.ring = length
    },
    blends (t) {
      return t - this.struck < this.ring * 1.2
    },
    swell (t, level, length) {
      const lift = level * 0.5
      if (this.level(t) >= lift) return false
      this.shape(t, lift, 0.04, length * 0.7)
      return true
    }
  }
}

export const CitySound = {
  ctx: null,
  master: null,
  limiter: null,
  gate: null,
  bus: null,
  trim: null,
  uiTrim: null,
  noise: null,
  orbit: 0,
  orbitSeq: 0,
  buses: new Map(),
  lead: LEAD,
  selGain: 1,
  city: 'nyc',
  volume: 0.5,
  unlocked: false,
  live: false,
  loading: false,
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
  notes: 0,
  late: 0,
  errors: 0,
  lastError: '',
  freezeTimer: 0,
  swoopTimer: 0,
  prepToken: 0,
  patterns: new Map(),
  cache: new Map(),
  failed: new Set(),
  badNotes: new Set(),
  prepared: new Set(),
  wired: false,
  banks: null,
  log: null,

  ensureContext () {
    if (this.ctx) return
    const AC = window.AudioContext || window.webkitAudioContext
    const ctx = new AC({ latencyHint: 'interactive' })
    this.ctx = ctx
    this.master = ctx.createGain()
    this.master.gain.value = this.volume
    const limiter = ctx.createDynamicsCompressor()
    limiter.threshold.value = -6
    limiter.knee.value = 6
    limiter.ratio.value = 12
    limiter.attack.value = 0.004
    limiter.release.value = 0.3
    this.limiter = limiter
    this.master.connect(limiter).connect(ctx.destination)
    this.gate = ctx.createGain()
    this.gate.gain.value = 0
    this.trim = ctx.createGain()
    this.bus = ctx.createGain()
    this.bus.gain.value = 0.9
    this.bus.connect(this.trim).connect(this.gate).connect(this.master)
    this.uiTrim = ctx.createGain()
    this.uiTrim.connect(this.master)
    this.noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate)
    const data = this.noise.getChannelData(0)
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1
    this.unlocked = ctx.state === 'running'
    ctx.onstatechange = () => { if (ctx.state === 'running') this.unlocked = true }
    this.newOrbit()
    this.applyCity()
  },

  wire () {
    if (this.wired || !S || !this.ctx) return
    this.wired = true
    S.setAudioContext(this.ctx)
    S.setLogger((msg) => { if (String(msg).includes('skip hap')) this.late++ })
    S.setMaxPolyphony(256)
    S.initAudio({ maxPolyphony: 256 }).catch(() => {})
    const ctl = S.getSuperdoughAudioController()
    const make = ctl.getOrbit.bind(ctl)
    ctl.getOrbit = (n, channels) => {
      const fresh = !ctl.nodes[n]
      const orbit = make(n, channels)
      if (fresh) {
        orbit.output.disconnect()
        orbit.output.connect(n === UI_ORBIT ? this.uiTrim : this.orbitBus(n))
      }
      return orbit
    }
  },

  orbitBus (n) {
    let g = this.buses.get(n)
    if (!g) {
      g = this.ctx.createGain()
      g.gain.value = n === this.orbit ? this.selGain : 0
      g.connect(this.bus)
      this.buses.set(n, g)
    }
    return g
  },

  newOrbit () {
    this.orbit = ++this.orbitSeq
    if (this.orbit === UI_ORBIT) this.orbit = ++this.orbitSeq
    this.orbitBus(this.orbit)
  },

  dropOrbit (n) {
    const ctl = S && this.wired ? S.getSuperdoughAudioController() : null
    if (ctl?.nodes[n]) { ctl.nodes[n].disconnect(); delete ctl.nodes[n] }
    const g = this.buses.get(n)
    if (g) { g.disconnect(); this.buses.delete(n) }
  },

  release (tau) {
    const old = this.orbit
    this.strings.clear()
    this.lines.clear()
    this.voices = 0
    this.beats = []
    const g = this.buses.get(old)
    if (this.ctx.state === 'running' && g) {
      const now = this.ctx.currentTime
      g.gain.cancelScheduledValues(now)
      g.gain.setTargetAtTime(0, now, tau)
      setTimeout(() => this.dropOrbit(old), tau * 7000 + 400)
    } else {
      this.dropOrbit(old)
    }
    this.newOrbit()
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

  sources (city) {
    const saved = this.patterns.get(city) ? null : readSaved(city)
    const p = this.patterns.get(city)
    return {
      voice: p ? p.voice.src : saved?.voice ?? CITY_CODE[city].voice,
      hit: p ? p.hit.src : saved?.hit ?? CITY_CODE[city].hit
    }
  },

  patternsFor (city) {
    let p = this.patterns.get(city)
    if (p || !S) return p || null
    const src = this.sources(city)
    p = {}
    for (const kind of KINDS) {
      try { p[kind] = { src: src[kind], pat: S.compile(src[kind]) } } catch { p[kind] = { src: CITY_CODE[city][kind], pat: S.compile(CITY_CODE[city][kind]) } }
    }
    this.patterns.set(city, p)
    return p
  },

  code (city) {
    return this.sources(city)
  },

  isDefault (city) {
    const c = this.code(city)
    return c.voice === CITY_CODE[city].voice && c.hit === CITY_CODE[city].hit
  },

  async setCode (city, next) {
    await engine
    const p = {}
    for (const kind of KINDS) {
      try { p[kind] = { src: next[kind], pat: S.compile(next[kind]) } } catch (e) { return kind + ': ' + (e?.message || String(e)) }
    }
    const missing = []
    for (const kind of KINDS) {
      for (const { s } of soundsOf(p[kind].pat)) {
        if (!S.getSound(s)) await this.loadBanks()
        if (!S.getSound(s) && !missing.includes(s)) missing.push(s)
      }
    }
    if (missing.length) return 'unknown sound: ' + missing.join(', ')
    this.patterns.set(city, p)
    writeSaved(city, { voice: next.voice, hit: next.hit })
    this.cache.clear()
    this.prepared.delete(city)
    if (city === this.city) await this.prepare(city)
    return null
  },

  resetCode (city) {
    return this.setCode(city, CITY_CODE[city])
  },

  loadBanks () {
    if (!this.banks) this.banks = Promise.allSettled(BANKS.map((u) => S.samples(u)))
    return this.banks
  },

  async preload (city) {
    const p = this.patternsFor(city)
    const sc = CITY_SCALES[city]
    const notes = []
    for (let m = sc.lowMidi - 1; m <= sc.lowMidi + 12 * sc.octaves + 13; m++) notes.push(m)
    const jobs = []
    for (const kind of KINDS) {
      for (const { s, n, note } of soundsOf(p[kind].pat)) {
        if (!S.getSound(s)) await this.loadBanks()
        const snd = S.getSound(s)
        if (!snd) { this.failed.add(s); continue }
        const type = snd.data?.type
        const ns = kind === 'voice' ? notes : [note ?? HIT_NOTE]
        const check = (job, m) => jobs.push(Promise.race([job.then(() => true, () => false), wait(3000, false)]).then((ok) => { if (!ok) this.badNotes.add(s + ':' + m) }))
        if (type === 'soundfont') {
          const fonts = snd.data.fonts
          const font = fonts[S.getSoundIndex(n, fonts.length)]
          for (const m of ns) check(S.getFontBufferSource(font, { note: m }, this.ctx), m)
        } else if (type === 'sample') {
          for (const m of ns) check(S.getSampleBuffer({ s, n, note: m }, snd.data.samples), m)
        }
      }
    }
    await Promise.all(jobs)
  },

  async prepare (city) {
    if (!this.ctx) return
    const token = ++this.prepToken
    if (!this.prepared.has(city)) this.loading = true
    try {
      await engine
      this.wire()
      await Promise.race([this.preload(city), wait(12000)])
      this.prepared.add(city)
    } catch (e) {
      this.errors++
      this.lastError = String(e?.message || e)
    }
    if (token !== this.prepToken) return
    this.loading = false
    for (const other of Object.keys(CITY_CODE)) {
      if (other !== city && !this.prepared.has(other)) this.preload(other).then(() => this.prepared.add(other), () => {})
    }
  },

  layers (kind, sec) {
    const key = kind + '|' + this.city + '|' + Math.floor(sec / 60)
    let out = this.cache.get(key)
    if (out) return out
    const p = this.patternsFor(this.city)
    if (!p) return []
    const c = sec / 3600
    try { out = values(p[kind].pat.queryArc(c, c + 1e-6)) } catch (e) { out = []; this.errors++; this.lastError = String(e?.message || e) }
    if (this.cache.size > 64) this.cache.clear()
    this.cache.set(key, out)
    return out
  },

  playable (s, note) {
    const name = String(s ?? 'triangle').toLowerCase()
    if (this.failed.has(name)) return ['triangle', note]
    if (typeof note !== 'number' || !this.badNotes.has(name + ':' + note)) return [s ?? 'triangle', note]
    for (const m of [note - 12, note + 12, note - 24]) if (!this.badNotes.has(name + ':' + m)) return [s, m]
    return ['triangle', note]
  },

  play (layers, note, pan, at, gain, length, soft, orbit) {
    for (const l of layers) {
      const [s, n] = this.playable(l.s, note ?? l.note ?? HIT_NOTE)
      const v = {
        ...l,
        s,
        note: n,
        orbit,
        pan: 0.5 + 0.5 * clampPan(pan),
        gain: (l.gain ?? 1) * gain * GAIN,
        attack: l.attack ?? (soft ? 0.03 : 0.004),
        release: l.release ?? Math.max(0.12, length * 0.7)
      }
      this.notes++
      S.superdough(v, at, l.duration ?? Math.max(0.05, length * 0.35)).catch((e) => { this.errors++; this.lastError = String(e?.message || e) })
    }
  },

  applyCity () {
    if (!this.ctx) return
    const m = this.mix()
    const t = this.ctx.currentTime
    this.trim.gain.setTargetAtTime(m.trim, t, 0.4)
    this.uiTrim.gain.setTargetAtTime(m.trim, t, 0.4)
    this.beats = []
    this.lines.clear()
    this.bpm = this.targetBpm()
    this.prepare(this.city)
  },

  setVolume (v) {
    this.volume = v
    if (!this.ctx) return
    this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.05)
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
    const gate = this.gate.gain
    const open = () => {
      gate.cancelScheduledValues(ctx.currentTime)
      gate.setTargetAtTime(1, ctx.currentTime, 0.015)
    }
    return ctx.resume().then(open, () => {})
  },

  freeze () {
    this.live = false
    const ctx = this.ctx
    if (!ctx || ctx.state !== 'running') return
    const gate = this.gate.gain
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

  string (key, at) {
    const v = this.strings.get(key)
    if (v && v.alive(at)) return v
    if (v) this.strings.delete(key)
    if (this.strings.size >= MAX_STRINGS) {
      let worst = null
      let quietest = Infinity
      for (const [k, s] of this.strings) {
        const l = s.level(at)
        if (l < quietest) { quietest = l; worst = k }
      }
      this.strings.delete(worst)
      this.capped++
    }
    const s = tone()
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
    if (!evs.length || !this.wired || this.ctx.state !== 'running' || this.loading) return out
    const m = this.mix()
    const start = this.ctx.currentTime + LEAD
    const span = Math.max(1e-6, to - from)
    const stretch = Math.min(0.1, Math.max(0, dt || 0))
    this.scheduleTime = to
    const chord = this.chord()
    const voice = this.layers('voice', to)
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
    if (voice.length) {
      for (const g of groups.values()) {
        const e = g.e
        const at = when(e.sec, e.midi)
        const tone = chord.includes(((e.midi % 12) + 12) % 12)
        const length = m.ring * (tone ? 1.25 : 0.8) * (1 - 0.35 * a)
        const level = base * this.poly * (0.55 + 0.45 * g.velocity) * (tone ? 1 : 0.62) * (e.freq > 800 ? 0.82 : 1) * Math.min(1.4, Math.sqrt(g.n))
        const key = this.city + '|' + g.key
        const held = this.strings.get(key)
        let heard = false
        if (held && held.alive(at) && held.blends(at)) {
          if (at - held.last >= SWELL_GAP && held.swell(at, level, length)) {
            this.play(voice, e.midi, e.pan * m.width, at, level * 0.5, length * 0.7, true, this.orbit)
            this.swelled++
            if (this.log) this.log.push({ at, sec: e.sec, freq: e.freq, midi: e.midi, level: level * 0.5, tone, swell: true, routes: [e.route], stop: e.stop_name })
          }
          heard = true
        } else {
          const line = this.line(e.route)
          let slot = line.busy.findIndex((t) => t <= at)
          if (slot < 0 && line.busy.length < this.perLine) slot = line.busy.length
          if (slot >= 0) {
            this.string(key, at).strike(at, level, length)
            this.play(voice, e.midi, e.pan * m.width, at, level, length, false, this.orbit)
            line.busy[slot] = at + length * 0.7
            heard = true
            this.sounded++
            if (this.log) this.log.push({ at, sec: e.sec, freq: e.freq, midi: e.midi, level, tone, routes: [e.route], stop: e.stop_name })
          }
        }
        if (heard) for (const i of g.idx) out[i] = true
      }
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
        this.play(this.layers('hit', to), null, -0.1, at, base * this.poly * 1.6 * Math.min(1.6, Math.sqrt(hits)), 0.2, false, this.orbit)
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
    for (const [k, v] of this.strings) if (!v.alive(now)) this.strings.delete(k)
    this.voices = this.strings.size
  },

  beat () {
    if (!this.ctx || !this.beats.length) return 0
    const now = this.ctx.currentTime
    let last = -1
    for (let i = this.beats.length - 1; i >= 0; i--) if (this.beats[i] <= now) { last = this.beats[i]; break }
    return last < 0 ? 0 : Math.exp(-(now - last) / 0.18)
  },

  playNote ({ freq, pan = 0, velocity = 0.8 }) {
    if (!freq) return
    this.ensureContext()
    const go = () => {
      if (!this.wired || this.ctx.state !== 'running') return
      const t = this.ctx.currentTime + 0.02
      const midi = Math.round(69 + 12 * Math.log2(freq / 440))
      const w = this.mix().width
      const voice = this.layers('voice', this.scheduleTime)
      this.play(voice, midi, pan * w, t, velocity * HOVER, 1.4, false, UI_ORBIT)
      this.play(voice, midi + 12, pan * w, t + 0.012, velocity * 0.28 * HOVER, 0.9, false, UI_ORBIT)
      if (this.log) this.log.push({ at: this.ctx.currentTime, kind: 'hover', freq })
    }
    if (this.ctx.state === 'running') go()
    else this.ctx.resume().then(go, () => {})
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
    if (!this.ctx || this.ctx.state !== 'running') return
    const ctx = this.ctx
    const now = ctx.currentTime
    const osc = ctx.createOscillator()
    osc.type = 'triangle'
    osc.frequency.setValueAtTime(1600, now)
    osc.frequency.exponentialRampToValueAtTime(700, now + 0.025)
    const g = ctx.createGain()
    g.gain.setValueAtTime(0, now)
    g.gain.setTargetAtTime(0.03 * level, now, 0.001)
    g.gain.setTargetAtTime(0, now + 0.004, 0.008)
    osc.connect(g).connect(this.master)
    osc.start(now)
    osc.stop(now + 0.07)
  },

  resume () {
    if (!this.ctx || this.ctx.state === 'running') return
    return this.ctx.resume().catch(() => {})
  }
}
