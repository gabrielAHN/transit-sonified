import maplibregl from 'maplibre-gl'
import { ScatterplotLayer, PathLayer } from '@deck.gl/layers'
import { _mergeShaders as mergeShaders } from '@deck.gl/core'
import { createRouteShapeLayer, buildRouteShapePaths } from '@gtfs-viz/lib/deckgl'
import { DeckOverlay } from './overlay'
import { cityDB, type CityDB, type Row } from './db'
import { Q } from './queries'
import { CitySound, CITY_SCALES } from './sound.js'
import { CITIES, CITY_ORDER, SERVICE_DATE, type CityId } from '@/lib/cities'

const { RouteShapeLayer } = createRouteShapeLayer({ PathLayer, mergeShaders })
const DARK_MATTER = 'https://basemaps.cartocdn.com/gl/dark-matter-nolabels-gl-style/style.json'
const CHUNK = 1800
const SPEED = 600

export type Route = { id: string, label: string, color: [number, number, number] }
export type Progress = { p: number, text: string, done: boolean, error: string | null }
export type Snapshot = {
  city: CityId
  route: string
  routes: Route[]
  playing: boolean
  cursor: number
  fromSec: number
  toSec: number
  rush: [number, number][]
  inRush: boolean
  rushBand: number
  volume: number
  loading: Record<string, Progress>
  hint: boolean
  fetchingRoute: boolean
}

type Departure = {
  trip: string, route: string, color: [number, number, number], hue: number, stop_name: string,
  lat: number, lon: number, sec: number, midi: number, freq: number, pan: number,
  accent: boolean, velocity: number
}
type Station = { key: string, stop_name: string, lat: number, lon: number, freq: number, pan: number, hue: number, color: [number, number, number], lines: string }
type Running = { curve: Float32Array, base: number, peak: number }
type Selection = {
  table: string, stations: Station[], running?: Running,
  rush?: [number, number][], bounds?: Row | null, count?: number
}
type Pulse = { lat: number, lon: number, color: number[], t0: number, life: number, strong: boolean }
type CityData = { db: CityDB, all: Selection, routes: Route[], lines: any[] }

const timeToSec = (t: string) => { const [h, m, s] = t.split(':').map(Number); return h * 3600 + m * 60 + (s || 0) }

const hexToRgb = (hex?: string | null): [number, number, number] | null => {
  if (!hex) return null
  const h = hex.replace('#', '')
  return h.length === 6 ? [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)] : null
}

class Player {
  map!: maplibregl.Map
  overlay!: DeckOverlay
  city: CityId = 'nyc'
  route = 'all'
  data: CityData | null = null
  sel: Selection | null = null
  cityCache = new Map<CityId, Promise<CityData>>()
  routeCache = new Map<string, Promise<Selection>>()
  buf: Departure[] = []
  bufIdx = 0
  bufEnd = 0
  fetching: Promise<void> | null = null
  bufToken = 0
  playing = false
  switching = false
  cursor = 0
  fromSec = 0
  toSec = 0
  rush: [number, number][] = []
  lastFrame = 0
  pausedAt = 0
  pulses: Pulse[] = []
  hoverKey: string | null = null
  volume = 0.5
  mobile = matchMedia('(max-width: 720px)').matches
  called = 0
  token = 0
  fetchingRoute = false
  hint = false
  hintTimer = 0
  loading: Record<string, Progress> = {}
  playerEl: HTMLElement | null = null
  fx = { flow: 0, t: 0, band: -2 }
  onCityCard: ((label: string, sub: string) => void) | null = null
  listeners = new Set<() => void>()
  snapshot: Snapshot = this.makeSnapshot()
  lastPublish = 0

  subscribe = (fn: () => void) => { this.listeners.add(fn); return () => { this.listeners.delete(fn) } }
  getSnapshot = () => this.snapshot
  private makeSnapshot (): Snapshot {
    const band = this.rush.findIndex(([f, t]) => this.cursor >= f && this.cursor < t)
    return {
      city: this.city, route: this.route, routes: this.data?.routes ?? [], playing: this.playing,
      cursor: this.cursor, fromSec: this.fromSec, toSec: this.toSec, rush: this.rush,
      inRush: band >= 0, rushBand: band, volume: this.volume, loading: { ...this.loading },
      hint: this.hint, fetchingRoute: this.fetchingRoute
    }
  }
  publish (force = true) {
    const now = performance.now()
    if (!force && now - this.lastPublish < 100) return
    this.lastPublish = now
    this.snapshot = this.makeSnapshot()
    for (const fn of this.listeners) fn()
  }

  mount (container: HTMLElement, city: CityId) {
    this.city = city
    const cfg = CITIES[city]
    this.applyTheme()
    this.map = new maplibregl.Map({
      container, style: DARK_MATTER, center: cfg.center, zoom: this.cityZoom(), minZoom: 8,
      dragRotate: false, pitchWithRotate: false, touchPitch: false, maxBounds: cfg.bounds,
      attributionControl: { compact: true }
    })
    this.overlay = new DeckOverlay({ layers: [], pickingRadius: 8, getTooltip: this.tooltip })
    this.map.addControl(this.overlay as any)
    this.map.on('zoomend', () => { if (!this.playing) this.render() })
    matchMedia('(max-width: 720px)').addEventListener('change', (e) => { this.mobile = e.matches })
    for (const type of ['pointerdown', 'keydown', 'touchend']) window.addEventListener(type, this.unlockAudio, { capture: true, passive: true })
    this.load(city)
  }

  cityZoom () {
    const w = window.innerWidth
    const z = CITIES[this.city].zoom
    return w < 480 ? z - 1.1 : w < 820 ? z - 0.5 : z
  }

  applyTheme () {
    document.documentElement.style.setProperty('--city', `rgb(${CITIES[this.city].theme.join(' ')})`)
  }

  setProgress (city: string, text: string, p: number) {
    const cur = this.loading[city]
    this.loading[city] = { p: Math.max(cur?.p ?? 0, p), text, done: false, error: null }
    this.publish()
  }

  private tuning (city: CityId) {
    return { date: SERVICE_DATE, ...(CITY_SCALES as any)[city] }
  }

  private async selection (db: CityDB, table: string, routeId: string | null): Promise<Selection> {
    const city = db.city as CityId
    const cfg = CITIES[city]
    await db.exec(routeId
      ? Q.routeEvents(table, 'departures', routeId)
      : Q.events(table, { ...this.tuning(city), from: cfg.window[0], to: cfg.window[1] }))
    const [stations, running, count] = await Promise.all([
      db.query(Q.stations(routeId)),
      routeId ? Promise.resolve(null) : db.query(Q.running(table)),
      db.query(Q.count(table, 0, 172800))
    ])
    const sel: Selection = {
      table,
      count: Number(count[0]?.n || 0),
      stations: stations.map((s) => ({
        key: s.key, stop_name: s.stop_name, lat: s.lat, lon: s.lon, freq: s.freq_hz, pan: s.pan, hue: 0,
        color: hexToRgb(s.color_hex) || cfg.theme, lines: s.lines
      }))
    }
    if (running) {
      const curve = new Float32Array(running.length)
      for (const r of running) curve[r.m] = r.trips
      sel.running = { curve, base: running[0]?.base || 0, peak: Math.max(running[0]?.peak || 1, (running[0]?.base || 0) + 1) }
    }
    return sel
  }

  loadCity (city: CityId): Promise<CityData> {
    if (this.cityCache.has(city)) return this.cityCache.get(city)!
    const pending = (async () => {
      const db = await cityDB(city, (t, p) => this.setProgress(city, t, p))
      this.setProgress(city, 'Scoring departures into notes…', 0.8)
      const cfg = CITIES[city]
      await db.exec(Q.stops(this.tuning(city)))
      const [routes, lines, all] = await Promise.all([db.query(Q.routes()), db.query(Q.routeLines()), this.selection(db, 'departures', null)])
      const rush = await db.query(Q.rush('departures', timeToSec(cfg.window[0]), timeToSec(cfg.window[1])))
      all.rush = rush.length ? rush.map((r) => [r.from_sec, r.to_sec]) : cfg.rush.map(([f, t]) => [timeToSec(f), timeToSec(t)])
      this.loading[city] = { p: 1, text: '', done: true, error: null }
      this.publish()
      return {
        db, all, lines,
        routes: routes.map((r) => ({ id: r.route_id, label: String(r.label), color: hexToRgb(r.route_color_hex) || cfg.theme }))
      }
    })()
    pending.catch((e) => {
      this.cityCache.delete(city)
      this.loading[city] = { ...(this.loading[city] || { p: 0 }), text: 'Failed: ' + (e.message || e), error: String(e.message || e), done: false }
      this.publish()
    })
    this.cityCache.set(city, pending)
    return pending
  }

  loadRoute (routeId: string): Promise<Selection> {
    const key = this.city + '|' + routeId
    if (!this.routeCache.has(key)) {
      const data = this.data!
      const table = 'route_' + [...routeId].map((c) => c.charCodeAt(0).toString(16)).join('')
      const pending = (async () => {
        const sel = await this.selection(data.db, table, routeId)
        const bounds = await data.db.query(Q.routeBounds(routeId))
        sel.bounds = bounds[0] || null
        return sel
      })()
      pending.catch(() => this.routeCache.delete(key))
      this.routeCache.set(key, pending)
    }
    return this.routeCache.get(key)!
  }

  prefetchRoute (routeId: string) {
    if (this.data && routeId !== 'all') this.loadRoute(routeId).catch(() => {})
  }

  prefetchOthers () {
    CITY_ORDER.filter((c) => !this.cityCache.has(c))
      .reduce((p, c) => p.then(() => this.loadCity(c)).then(() => {}, () => {}), Promise.resolve())
  }

  resetStream (sec: number) {
    this.bufToken++
    this.buf = []
    this.bufIdx = 0
    this.bufEnd = Math.floor(sec)
    this.fetching = null
    return this.fill(true)
  }

  fill (force = false): Promise<void> {
    if (!this.sel || !this.data) return Promise.resolve()
    if (this.fetching) return this.fetching
    if (!force && this.bufEnd - this.cursor > CHUNK) return Promise.resolve()
    if (this.bufEnd >= this.toSec) return Promise.resolve()
    const token = this.bufToken
    const from = this.bufEnd
    const to = Math.min(this.toSec, from + CHUNK)
    const { db } = this.data
    const table = this.sel.table
    const theme = CITIES[this.city].theme
    this.fetching = db.query(Q.window(table, from, to)).then((rows) => {
      if (token !== this.bufToken) return
      const next: Departure[] = rows.map((r) => ({
        trip: r.trip_id, route: r.route_id, color: hexToRgb(r.route_color_hex) || theme, hue: r.hue ?? 0,
        stop_name: r.stop_name, lat: r.lat, lon: r.lon, sec: r.t_sec, midi: r.midi, freq: r.freq_hz,
        pan: r.pan, accent: !!r.accent, velocity: r.velocity
      }))
      this.buf = this.buf.slice(this.bufIdx).concat(next)
      this.bufIdx = 0
      this.bufEnd = to
      if (to < this.toSec && this.bufEnd - this.cursor <= CHUNK) queueMicrotask(() => this.fill())
    }).finally(() => { if (token === this.bufToken) this.fetching = null })
    return this.fetching
  }

  rushLevel (sec: number) {
    let level = 0
    for (const [f, t] of this.rush) {
      const inside = Math.min(sec - f, t - sec)
      level = Math.max(level, Math.max(0, Math.min(1, (inside + 900) / 1800)))
    }
    return level
  }

  activityAt (sec: number) {
    const run = this.data?.all.running
    if (!run) return 0
    const m = Math.max(0, Math.min(run.curve.length - 1, Math.floor(sec / 60)))
    const trips = (run.curve[m] - run.base) / (run.peak - run.base)
    return Math.max(0, Math.min(1, Math.max(trips, 0.65 * this.rushLevel(sec))))
  }

  private pulse (evs: Departure[], heard: boolean[], from: number, to: number, delay: number, stretch: number) {
    const now = performance.now()
    const span = Math.max(1e-6, to - from)
    const seen = new Map<string, Pulse>()
    for (let i = 0; i < evs.length; i++) {
      const e = evs[i]
      const key = e.lat.toFixed(5) + ',' + e.lon.toFixed(5)
      const p = seen.get(key)
      const strong = heard[i] || e.accent
      if (p) { p.strong = p.strong || strong; continue }
      const t0 = now + (delay + Math.max(0, Math.min(1, (e.sec - from) / span)) * stretch) * 1000
      seen.set(key, { lat: e.lat, lon: e.lon, color: e.color, t0, life: strong ? 1300 : 900, strong })
    }
    for (const p of seen.values()) this.pulses.push(p)
    const max = this.mobile ? 400 : 2500
    if (this.pulses.length > max) this.pulses.splice(0, this.pulses.length - max)
  }

  updateRushFx () {
    const el = this.playerEl
    if (!el) return
    const level = this.rushLevel(this.cursor)
    const env = level ? CitySound.beat() : 0
    const now = performance.now()
    if (this.playing && this.fx.t) this.fx.flow = (this.fx.flow + ((now - this.fx.t) / 1000) * ((CitySound.bpm || 100) / 60)) % 1
    this.fx.t = this.playing ? now : 0
    el.style.setProperty('--depth', level.toFixed(3))
    el.style.setProperty('--beat', (level * env).toFixed(3))
    el.style.setProperty('--ripple', (1 - env).toFixed(3))
    el.style.setProperty('--flow', this.fx.flow.toFixed(3))
    const band = this.rush.findIndex(([f, t]) => this.cursor >= f && this.cursor < t)
    if (band !== this.fx.band) { this.fx.band = band; this.publish() }
  }

  async load (city: CityId, keepCursor = false) {
    const token = ++this.token
    if (!this.cityCache.has(city)) this.setProgress(city, 'Loading ' + CITIES[city].label + '…', 0.01)
    let data: CityData
    try { data = await this.loadCity(city) } catch (e) { console.error(e); return }
    if (token !== this.token) return
    const cfg = CITIES[city]
    this.data = data
    this.route = 'all'
    this.sel = data.all
    this.fromSec = timeToSec(cfg.window[0])
    this.toSec = timeToSec(cfg.window[1])
    this.rush = data.all.rush!
    this.pulses = []
    CitySound.setCity(city)
    CitySound.setLines(data.routes.length)
    if (CitySound.selGain !== 1) CitySound.handover(1)
    this.cursor = keepCursor ? Math.max(this.fromSec, Math.min(this.toSec, this.cursor)) : this.fromSec
    await this.resetStream(this.cursor)
    this.fx.band = -2
    this.updateRushFx()
    this.render()
    this.publish()
    this.prefetchOthers()
  }

  async switchCity (city: CityId) {
    if (city === this.city && this.data) return
    const wasPlaying = this.playing
    const cfg = CITIES[city]
    this.city = city
    this.switching = true
    this.applyTheme()
    this.onCityCard?.(cfg.label, wasPlaying ? 'continuing at ' + clock(this.cursor).slice(0, 5) : cfg.network)
    if (!wasPlaying) CitySound.hush()
    CitySound.transition(city)
    this.map.setMaxBounds(null)
    this.map.setMinZoom(1)
    this.pulses = []
    this.render()
    this.map.flyTo({ center: cfg.center, zoom: this.cityZoom(), duration: 2600, curve: 1.6, essential: true })
    const relock = () => { if (this.city !== city) return; this.map.setMinZoom(8); this.map.setMaxBounds(cfg.bounds) }
    this.map.once('moveend', relock)
    setTimeout(relock, 2800)
    this.pulses = []
    this.publish()
    await this.load(city, true)
    if (this.city !== city) return
    this.switching = false
    if (wasPlaying && !this.playing) this.play()
  }

  async selectRoute (route: string, opts: { play?: boolean } = {}) {
    if (!this.data) return
    if (route === this.route) {
      if (opts.play && !this.playing) this.play()
      return
    }
    const token = ++this.token
    const city = this.city
    this.route = route
    const current = () => token === this.token && city === this.city && route === this.route
    if (route !== 'all') { this.fetchingRoute = true; this.publish() }
    try {
      const sel = route === 'all' ? this.data.all : await this.loadRoute(route)
      if (!current()) return
      this.switching = true
      this.bufToken++
      this.buf = []; this.bufIdx = 0; this.bufEnd = Math.floor(this.cursor)
      this.sel = sel
      this.pulses = []
      CitySound.handover(route === 'all' ? 1 : CitySound.soloGain((sel.count || 1) / (this.data.all.count || 1), this.data.routes.length))
      this.frame(sel.bounds)
      await this.resetStream(this.cursor)
      if (!current()) return
      this.switching = false
      if (opts.play && !this.playing) this.play()
      this.render()
    } catch (e) {
      console.error('selectRoute failed', e)
    } finally {
      if (token === this.token) { this.switching = false; this.fetchingRoute = false; this.publish() }
    }
  }

  frame (bounds?: Row | null) {
    const cfg = CITIES[this.city]
    if (!bounds) { this.map.flyTo({ center: cfg.center, zoom: this.cityZoom(), duration: 1400, curve: 1.4, essential: true }); return }
    const side = this.mobile ? 20 : 300
    this.map.fitBounds([[bounds.min_lon, bounds.min_lat], [bounds.max_lon, bounds.max_lat]], {
      padding: { top: this.mobile ? 150 : 90, bottom: this.mobile ? 90 : 110, left: side, right: this.mobile ? 20 : 80 },
      maxZoom: 13.5, duration: 1400, essential: true
    })
  }

  play = () => {
    if (this.playing || !this.sel) return
    CitySound.ensureContext(); CitySound.setVolume(this.volume); CitySound.setCity(this.city)
    CitySound.setActivity(this.activityAt(this.cursor))
    CitySound.start()
    if (this.cursor >= this.toSec) { this.cursor = this.fromSec; this.pulses = []; this.resetStream(this.cursor) }
    if (this.pausedAt) {
      const frozen = performance.now() - this.pausedAt
      for (const p of this.pulses) p.t0 += frozen
      this.pausedAt = 0
    }
    this.hoverKey = null
    this.playing = true
    this.lastFrame = performance.now()
    document.body.classList.add('playing')
    this.render()
    this.publish()
    requestAnimationFrame(this.frameLoop)
  }

  pause = () => {
    if (!this.playing) return
    this.playing = false
    this.pausedAt = performance.now()
    CitySound.freeze()
    document.body.classList.remove('playing')
    this.render()
    this.publish()
  }

  toggle = () => (this.playing ? this.pause() : this.play())

  stop () {
    this.playing = false
    this.pausedAt = 0
    this.cursor = this.fromSec
    this.pulses = []
    CitySound.freeze()
    CitySound.hush()
    document.body.classList.remove('playing')
    this.resetStream(this.cursor)
    this.updateRushFx()
    this.render()
    this.publish()
  }

  seek = (sec: number) => {
    this.cursor = Math.max(this.fromSec, Math.min(this.toSec, sec))
    this.pulses = []
    CitySound.hush()
    this.resetStream(this.cursor)
    this.updateRushFx()
    this.render()
    this.publish()
  }

  setVolume = (v: number) => { this.volume = v; CitySound.setVolume(v); this.publish() }

  private frameLoop = () => {
    if (!this.playing) return
    const perf = performance.now()
    const dt = Math.min(0.1, (perf - this.lastFrame) / 1000)
    this.lastFrame = perf
    const ctx = CitySound.ctx
    if (CitySound.unlocked && ctx && (ctx.state !== 'running' || CitySound.loading)) { requestAnimationFrame(this.frameLoop); return }
    CitySound.setActivity(this.activityAt(this.cursor))
    CitySound.tempo(dt)
    if (!this.switching) {
      const prev = this.cursor
      const next = Math.min(this.toSec, this.cursor + dt * SPEED)
      if (next <= this.bufEnd || this.bufEnd >= this.toSec) {
        this.cursor = next
        const from = prev
        const first = this.bufIdx
        while (this.bufIdx < this.buf.length && this.buf[this.bufIdx].sec <= this.cursor) this.bufIdx++
        if (this.bufIdx > first) {
          const evs = this.buf.slice(first, this.bufIdx)
          const heard = CitySound.departures(evs, from, this.cursor, dt)
          const live = !!ctx && ctx.state === 'running'
          this.pulse(evs, heard, from, this.cursor, live ? CitySound.lead + (ctx!.outputLatency || ctx!.baseLatency || 0) : 0, live ? Math.min(0.1, dt) : 0)
          this.called += evs.length
        }
      }
      this.fill()
    }
    CitySound.reap()
    this.updateRushFx()
    if (this.cursor >= this.toSec) { this.render(); this.stop(); return }
    this.render()
    this.publish(false)
    requestAnimationFrame(this.frameLoop)
  }

  private stationNote (s: Station, fromTap = false) {
    CitySound.ensureContext(); CitySound.setVolume(this.volume); CitySound.setCity(this.city)
    if (!CitySound.unlocked && !fromTap) { this.showHint(); return }
    CitySound.scheduleTime = this.cursor
    CitySound.playNote({ freq: s.freq, pan: s.pan, velocity: 0.8 })
  }

  private onHover = ({ object }: any) => {
    if (this.playing) return
    const key = object ? object.key : null
    if (key === this.hoverKey) return
    this.hoverKey = key
    if (object) this.stationNote(object)
    this.render()
  }

  private onTap = ({ object }: any) => {
    if (!object || this.playing) return
    this.hoverKey = object.key
    this.stationNote(object, true)
    this.render()
  }

  private showHint () {
    this.hint = true
    this.publish()
    clearTimeout(this.hintTimer)
    this.hintTimer = window.setTimeout(() => { this.hint = false; this.publish() }, 2600)
  }

  private unlockAudio = () => {
    CitySound.ensureContext(); CitySound.setVolume(this.volume); CitySound.setCity(this.city)
    const done = CitySound.resume()
    const hide = () => { if (CitySound.unlocked && this.hint) { this.hint = false; this.publish() } }
    if (done && (done as any).then) (done as any).then(hide); else hide()
  }

  private tooltip = ({ object }: any) => {
    if (!object || this.playing || !object.lines) return null
    return {
      html: `<div class="rounded-lg border border-border bg-popover px-3 py-2 text-popover-foreground shadow-sm">
        <div class="text-[13px] font-semibold">${escapeHtml(object.stop_name || 'Stop')}</div>
        <div class="text-[11px] text-muted-foreground">${escapeHtml(object.lines)}</div></div>`,
      style: { background: 'transparent', padding: '0', boxShadow: 'none' }
    }
  }

  private lineCache: { src: any, out: any[] } = { src: null, out: [] }
  private lineRecords () {
    const lines = this.data?.lines ?? []
    if (this.lineCache.src === lines) return this.lineCache.out
    const recs = lines.map((l: any) => ({
      route_id: l.route_id, shape_id: l.shape_id, route_name: l.route_name, route_color_hex: l.route_color_hex,
      lons: l.lons?.toArray ? Array.from(l.lons.toArray()) : l.lons, lats: l.lats?.toArray ? Array.from(l.lats.toArray()) : l.lats
    }))
    this.lineCache = { src: lines, out: buildRouteShapePaths(recs, { cleaned: false }) }
    return this.lineCache.out
  }

  render () {
    if (!this.overlay) return
    const nowT = this.playing ? performance.now() : (this.pausedAt || performance.now())
    if (this.playing) this.pulses = this.pulses.filter((p) => nowT - p.t0 < p.life)
    const stations = this.sel?.stations ?? []
    const theme = CITIES[this.city].theme
    const hoverKey = this.hoverKey
    const canHover = !this.playing
    const ADD = {
      blend: true, blendColorOperation: 'add', blendColorSrcFactor: 'src-alpha', blendColorDstFactor: 'one',
      blendAlphaOperation: 'max', blendAlphaSrcFactor: 'one', blendAlphaDstFactor: 'one', depthTest: false, depthMask: false
    }
    const layers = [
      new RouteShapeLayer({
        id: 'route-lines', data: this.lineRecords(), zoom: this.map.getZoom(),
        getColor: (d: any) => {
          const c = hexToRgb(d.route_color_hex) || theme
          const dim = this.route !== 'all' && d.route_id !== this.route
          return [c[0], c[1], c[2], dim ? 22 : (this.route === 'all' ? 70 : 150)]
        },
        getWidth: 2, widthUnits: 'pixels', widthMinPixels: 1, parameters: { depthTest: false },
        updateTriggers: { getColor: [this.city, this.route] }
      }),
      new ScatterplotLayer({
        id: 'stops-halo', data: stations, getPosition: (d: Station) => [d.lon, d.lat],
        getRadius: (d: Station) => (d.key === hoverKey ? 900 : 420), radiusUnits: 'meters', radiusMinPixels: 6, radiusMaxPixels: 34,
        getFillColor: (d: Station) => [d.color[0], d.color[1], d.color[2], d.key === hoverKey ? 110 : 24],
        parameters: ADD, updateTriggers: { getFillColor: [this.city, hoverKey], getRadius: hoverKey }, pickable: false
      }),
      new ScatterplotLayer({
        id: 'stops-core', data: stations, getPosition: (d: Station) => [d.lon, d.lat],
        getRadius: (d: Station) => (d.key === hoverKey ? 160 : 40), radiusUnits: 'meters', radiusMinPixels: 1.6, radiusMaxPixels: 4,
        getFillColor: (d: Station) => {
          const on = d.key === hoverKey
          return [Math.min(255, d.color[0] + (on ? 60 : 0)), Math.min(255, d.color[1] + (on ? 60 : 0)), Math.min(255, d.color[2] + (on ? 60 : 0)), on ? 255 : 170]
        },
        parameters: ADD, updateTriggers: { getFillColor: [this.city, hoverKey], getRadius: hoverKey },
        pickable: canHover, onHover: this.onHover, onClick: this.onTap
      }),
      new ScatterplotLayer({
        id: 'pulses', data: this.pulses, getPosition: (d: any) => [d.lon, d.lat],
        getRadius: (d: Pulse) => (d.strong ? 90 : 60) + (Math.max(0, nowT - d.t0) / d.life) * (d.strong ? 900 : 520),
        radiusUnits: 'meters', radiusMinPixels: 2.5, radiusMaxPixels: 48,
        getFillColor: (d: Pulse) => {
          if (nowT < d.t0) return [0, 0, 0, 0]
          const k = 1 - (nowT - d.t0) / d.life
          return [d.color[0], d.color[1], d.color[2], Math.max(0, (d.strong ? 170 : 110) * k * k)]
        },
        parameters: ADD, updateTriggers: { getRadius: nowT, getFillColor: nowT }
      })
    ]
    this.overlay.setProps({ layers })
  }
}

export const clock = (sec: number) => {
  const p = (n: number) => String(n).padStart(2, '0')
  return p(Math.floor(sec / 3600) % 24) + ':' + p(Math.floor((sec % 3600) / 60)) + ':' + p(Math.floor(sec % 60))
}
const escapeHtml = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!))

export const player = new Player()

if (new URLSearchParams(location.search).has('debug')) {
  CitySound.log = []
  ;(window as any).__sonify = {
    player, CitySound,
    get state () {
      return {
        city: player.city, route: player.route, playing: player.playing, cursor: player.cursor, called: player.called,
        rush: player.rush, hoverKey: player.hoverKey, bpm: CitySound.bpm, switching: player.switching,
        stops: player.sel?.stations ?? [], routes: player.data?.routes ?? [], loaded: player.cityCache.size
      }
    },
    selectRoute: (r: string) => player.selectRoute(r),
    seek: (sec: number) => player.seek(sec),
    count: async (from: number, to: number, table?: string) => Number((await player.data!.db.query(Q.count(table || player.sel!.table, from, to)))[0].n),
    activityAt: (sec: number) => player.activityAt(sec),
    project (lon: number, lat: number) { const pt = player.map.project([lon, lat]); const r = player.map.getContainer().getBoundingClientRect(); return { x: r.left + pt.x, y: r.top + pt.y } }
  }
}
