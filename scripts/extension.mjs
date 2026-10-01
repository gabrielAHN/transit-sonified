import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { cp, mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const version = process.env.GTFS_EXTENSION_VERSION || 'v1.0.1'
const source = process.env.GTFS_EXTENSION_SOURCE ||
  `https://github.com/gabrielAHN/gtfs-duckdb/releases/download/${version}/gtfs-extension-repository.tar.gz`
const out = resolve(process.argv[2] || 'dist/extensions')

const isFile = (path) => stat(path).then((s) => s.isFile(), () => false)

async function archive () {
  if (!/^https?:\/\//.test(source)) return resolve(source)
  const res = await fetch(source, { redirect: 'follow' })
  if (!res.ok) throw new Error(`GTFS DuckDB download failed: ${res.status} ${source}`)
  const dir = await mkdtemp(join(tmpdir(), 'gtfs-extension-'))
  const file = join(dir, 'repository.tar.gz')
  await writeFile(file, Buffer.from(await res.arrayBuffer()))
  return file
}

const dir = await mkdtemp(join(tmpdir(), 'gtfs-extension-repo-'))
const unpacked = spawnSync('tar', ['-xzf', await archive(), '-C', dir], { stdio: 'inherit' })
if (unpacked.status !== 0) throw new Error(`Could not unpack ${source}`)

const { artifacts } = JSON.parse(await readFile(join(dir, 'manifest.json'), 'utf8'))
const wasm = artifacts.filter((a) => a.target === 'wasm')
if (!wasm.length) throw new Error(`No browser (wasm) builds in ${source}`)

await rm(out, { recursive: true, force: true })
for (const a of wasm) {
  const file = join(dir, a.path)
  if (!(await isFile(file))) throw new Error(`Missing ${a.path} in ${source}`)
  const sha = createHash('sha256').update(await readFile(file)).digest('hex')
  if (sha !== a.sha256) throw new Error(`Checksum mismatch for ${a.path}`)
  await mkdir(join(out, a.path, '..'), { recursive: true })
  await cp(file, join(out, a.path))
}
await writeFile(join(out, 'manifest.json'), JSON.stringify({ ...JSON.parse(await readFile(join(dir, 'manifest.json'), 'utf8')), artifacts: wasm }, null, 2) + '\n')
console.log(`GTFS DuckDB ${version}: ${wasm.map((a) => a.platform).join(', ')} -> ${out}`)
