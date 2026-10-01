import * as duckdb from '@duckdb/duckdb-wasm'
import mvpWasm from '@duckdb/duckdb-wasm/dist/duckdb-mvp.wasm?url'
import mvpWorker from '@duckdb/duckdb-wasm/dist/duckdb-browser-mvp.worker.js?url'
import ehWasm from '@duckdb/duckdb-wasm/dist/duckdb-eh.wasm?url'
import ehWorker from '@duckdb/duckdb-wasm/dist/duckdb-browser-eh.worker.js?url'
import { createExtensionClient } from '@gtfs-viz/duckdb-client/client'
import { ident } from './queries'

const DB_FILE = 'transit.duckdb'
const CATALOG = 'transit'

const BUNDLES = {
  mvp: { mainModule: mvpWasm, mainWorker: mvpWorker },
  eh: { mainModule: ehWasm, mainWorker: ehWorker }
}

const repository = () => {
  const repo = import.meta.env.VITE_GTFS_EXTENSION_REPOSITORY || '/extensions'
  return repo.startsWith('/') ? location.origin + repo.replace(/\/$/, '') : repo
}

export type Row = Record<string, any>

function toRows (table: any): Row[] {
  const names: string[] = table.schema.fields.map((f: any) => f.name)
  const cols = names.map((n) => {
    const col = table.getChild(n)
    const values = col.toArray()
    return { values, col, nullable: col.nullCount > 0, big: typeof values[0] === 'bigint' || values instanceof BigInt64Array }
  })
  const out = new Array(table.numRows)
  for (let i = 0; i < table.numRows; i++) {
    const row: Row = {}
    for (let c = 0; c < names.length; c++) {
      const { values, col, nullable, big } = cols[c]
      let v = nullable && !col.isValid(i) ? null : values[i]
      if (big && v != null) v = Number(v)
      row[names[c]] = v
    }
    out[i] = row
  }
  return out
}

const mb = (n: number) => (n / 1048576).toFixed(1)

async function rawSize (name: string) {
  const manifest = await fetch('/db/manifest.json').then((r) => (r.ok ? r.json() : {})).catch(() => ({}))
  return manifest[name] || 0
}

async function download (url: string, total: number, onProgress: (got: number, total: number) => void) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(url + ' returned ' + res.status)
  if (!res.body || !total) return new Uint8Array(await res.arrayBuffer())
  const reader = res.body.getReader()
  let out = new Uint8Array(total)
  let got = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    if (got + value.length > out.length) {
      const grown = new Uint8Array(Math.max(out.length * 2, got + value.length))
      grown.set(out.subarray(0, got))
      out = grown
    }
    out.set(value, got)
    got += value.length
    onProgress(Math.min(got, total), total)
  }
  return got === out.length ? out : out.subarray(0, got)
}

async function startDuckDB () {
  const bundle = await duckdb.selectBundle(BUNDLES)
  const worker = new Worker(bundle.mainWorker!)
  const db = new duckdb.AsyncDuckDB(new duckdb.VoidLogger(), worker)
  await db.instantiate(bundle.mainModule, bundle.pthreadWorker)
  await db.open({ allowUnsignedExtensions: import.meta.env.VITE_GTFS_ALLOW_UNSIGNED_EXTENSIONS !== 'false' })
  const conn = await db.connect()
  const gtfs = createExtensionClient(conn, { repository: repository() })
  await gtfs.install()
  await gtfs.load()
  return { db, conn }
}

type Status = (text: string, p: number, creepTo?: number) => void
const listeners = new Set<Status>()
const emit: Status = (...args) => { for (const fn of listeners) fn(...args) }
let database: Promise<{ db: duckdb.AsyncDuckDB, conn: any, cities: Set<string> }> | null = null

function openDatabase () {
  if (database) return database
  database = (async () => {
    emit('Starting DuckDB + GTFS extension…', 0.04, 0.12)
    const [engine, bytes] = await Promise.all([
      startDuckDB(),
      rawSize(DB_FILE).then((total) => download('/db/' + DB_FILE, total, (got, t) =>
        emit('Loading transit database · ' + mb(got) + ' / ' + mb(t) + ' MB', 0.12 + 0.58 * (got / t))))
    ])
    emit('Opening database…', 0.72)
    await engine.db.registerFileBuffer(DB_FILE, bytes)
    await engine.conn.query(`ATTACH '${DB_FILE}' AS ${CATALOG} (READ_ONLY)`)
    const schemas = toRows(await engine.conn.query(
      `SELECT schema_name FROM duckdb_schemas() WHERE database_name = '${CATALOG}' AND NOT internal`))
    return { ...engine, cities: new Set(schemas.map((r) => r.schema_name as string)) }
  })()
  database.catch(() => { database = null })
  return database
}

export class CityDB {
  constructor (readonly city: string, private conn: any) {}
  async query (sql: string): Promise<Row[]> { return toRows(await this.conn.query(sql)) }
  async exec (sql: string) { await this.conn.query(sql) }
}

const cities = new Map<string, Promise<CityDB>>()

export function cityDB (city: string, onStatus?: Status) {
  if (onStatus) listeners.add(onStatus)
  if (!cities.has(city)) {
    const pending = (async () => {
      const { db, cities: available } = await openDatabase()
      if (!available.has(city)) throw new Error(`${DB_FILE} has no "${city}" schema`)
      const conn = await db.connect()
      await conn.query(`USE ${CATALOG}.${ident(city)}`)
      return new CityDB(city, conn)
    })()
    pending.catch(() => cities.delete(city))
    cities.set(city, pending)
  }
  const done = () => { if (onStatus) listeners.delete(onStatus) }
  cities.get(city)!.then(done, done)
  return cities.get(city)!
}
