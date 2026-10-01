import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { cn } from '@/lib/utils'
import { CitySound } from '@/engine/sound.js'
import type { Route } from '@/engine/player'

const ITEM_H = 26
const wrap = (i: number, n: number) => ((i % n) + n) % n

export type ReelHandle = { random: () => void }
type Props = {
  routes: Route[]
  route: string
  fetching: boolean
  onPick: (route: string, opts?: { random?: boolean }) => void
  onAim?: (route: string) => void
}

export const RouteReel = forwardRef<ReelHandle, Props>(function RouteReel ({ routes, route, fetching, onPick, onAim }, ref) {
  const vpRef = useRef<HTMLDivElement>(null)
  const trackRef = useRef<HTMLDivElement>(null)
  const R = useRef({ offset: 0, vel: 0, raf: 0, dragging: false, spinning: false, lastY: 0, lastT: 0, lastRow: 0, downY: 0, moved: 0, downTarget: null as EventTarget | null }).current
  const [open, setOpen] = useState(false)
  const [spinning, setSpinning] = useState(false)
  const live = useRef({ routes, route, onPick, onAim, open })
  live.current = { routes, route, onPick, onAim, open }
  const folded = route === 'all' && !open && !spinning

  const layout = useCallback(() => {
    const vp = vpRef.current, track = trackRef.current
    const n = live.current.routes.length
    if (!vp || !track || !n) return
    const centre = vp.clientHeight / 2 - ITEM_H / 2
    const pos = R.offset / ITEM_H
    const items = track.children as HTMLCollectionOf<HTMLElement>
    for (let i = 0; i < items.length; i++) {
      const d = wrap(i - pos + n / 2, n) - n / 2
      const t = Math.min(Math.abs(d), 3)
      const tilt = Math.max(-70, Math.min(70, d * 24))
      items[i].style.transform = `translateY(${(centre + d * ITEM_H).toFixed(2)}px) rotateX(${(-tilt).toFixed(1)}deg) scale(${(1 - t * 0.14).toFixed(3)})`
      items[i].style.opacity = Math.abs(d) > 3.2 ? '0' : Math.max(0.12, 1 - t * 0.3).toFixed(3)
      items[i].dataset.centred = String(Math.abs(d) < 0.5)
    }
    const row = Math.round(pos)
    if (row !== R.lastRow) {
      R.lastRow = row
      if (R.spinning || R.dragging || Math.abs(R.vel) > 1) CitySound.tick(R.spinning ? 0.5 : 0.8)
    }
  }, [R])

  const index = () => { const n = live.current.routes.length; return n ? wrap(Math.round(R.offset / ITEM_H), n) : 0 }

  const commit = useCallback((opts?: { random?: boolean }) => {
    const { routes, onPick } = live.current
    if (!routes.length) return
    const i = index()
    onPick(routes[i].id, opts)
    const el = trackRef.current?.children[i] as HTMLElement | undefined
    if (el) { el.dataset.arrive = 'true'; setTimeout(() => { el.dataset.arrive = 'false' }, 500) }
  }, [])

  const spinTo = useCallback((target: number, duration: number, done: () => void) => {
    const start = R.offset, dist = target - start, t0 = performance.now()
    const ease = (u: number) => {
      if (u < 0.06) return -0.012 * Math.sin((u / 0.06) * Math.PI)
      const v = (u - 0.06) / 0.94
      return 1 + 2.25 * Math.pow(v - 1, 3) + 1.25 * Math.pow(v - 1, 2)
    }
    let last = start
    const step = () => {
      const u = Math.min(1, (performance.now() - t0) / duration)
      R.offset = start + dist * ease(u)
      vpRef.current?.style.setProperty('--blur', Math.min(2.6, Math.abs(R.offset - last) / 14).toFixed(2) + 'px')
      last = R.offset
      layout()
      if (u < 1) R.raf = requestAnimationFrame(step)
      else { R.offset = target; R.raf = 0; layout(); done() }
    }
    R.raf = requestAnimationFrame(step)
  }, [R, layout])

  const stop = () => { if (R.raf) { cancelAnimationFrame(R.raf); R.raf = 0 } }

  const stepBy = useCallback((rows: number) => {
    stop()
    R.offset = Math.round(R.offset / ITEM_H) * ITEM_H
    if (!rows) { commit(); return }
    spinTo(R.offset + rows * ITEM_H, 260 + Math.min(6, Math.abs(rows)) * 60, () => commit())
  }, [commit, spinTo])

  const coast = useCallback(() => {
    const tick = () => {
      if (!R.dragging) {
        if (Math.abs(R.vel) > 0.4) { R.offset += R.vel; R.vel *= 0.94 } else {
          const target = Math.round(R.offset / ITEM_H) * ITEM_H
          R.offset += (target - R.offset) * 0.22
          if (Math.abs(target - R.offset) < 0.5) { R.offset = target; R.vel = 0; layout(); R.raf = 0; commit(); return }
        }
      }
      layout()
      R.raf = requestAnimationFrame(tick)
    }
    if (!R.raf) R.raf = requestAnimationFrame(tick)
  }, [R, layout, commit])

  useImperativeHandle(ref, () => ({
    random () {
      const n = live.current.routes.length
      if (!n || R.spinning) return
      CitySound.ensureContext(); CitySound.resume()
      setOpen(true)
      const cur = index()
      let target = cur
      if (n > 1) { target = Math.floor(Math.random() * (n - 1)); if (target >= cur) target++ }
      const turns = 3 + Math.floor(Math.random() * 2)
      const end = Math.round(R.offset / ITEM_H) + turns * n + wrap(target - cur, n)
      live.current.onAim?.(live.current.routes[target].id)
      stop()
      R.dragging = false; R.vel = 0; R.spinning = true
      setSpinning(true)
      spinTo(end * ITEM_H, 2200 + turns * 180, () => {
        R.spinning = false
        setSpinning(false)
        const vp = vpRef.current
        vp?.style.setProperty('--blur', '0px')
        vp?.classList.remove('reel-landed'); void vp?.offsetWidth; vp?.classList.add('reel-landed')
        commit({ random: true })
      })
    }
  }), [R, spinTo, commit])

  useEffect(() => { R.offset = 0; R.vel = 0; setOpen(false); requestAnimationFrame(layout) }, [routes, R, layout])
  useEffect(() => {
    if (route === 'all') setOpen(false)
    if (R.spinning) return
    const n = routes.length || 1
    const i = Math.max(0, routes.findIndex((r) => r.id === route))
    const base = Math.round(R.offset / ITEM_H)
    const d = wrap(i - base, n)
    R.offset = (base + (d > n / 2 ? d - n : d)) * ITEM_H
    layout()
  }, [route, routes, R, layout])

  useEffect(() => {
    const vp = vpRef.current
    if (!vp) return
    const ro = new ResizeObserver(() => layout())
    ro.observe(vp)
    const down = (y: number, target: EventTarget | null) => {
      if (R.spinning) return
      R.downY = y; R.moved = 0
      R.downTarget = live.current.route === 'all' && !live.current.open ? null : target
      setOpen(true)
      CitySound.ensureContext(); CitySound.resume()
      R.dragging = true; R.lastY = y; R.lastT = performance.now(); R.vel = 0
      stop()
    }
    const move = (y: number) => {
      if (!R.dragging) return
      const dy = y - R.lastY
      R.moved = Math.max(R.moved, Math.abs(y - R.downY))
      const now = performance.now()
      R.offset -= dy
      R.vel = -dy * (16 / Math.max(1, now - R.lastT))
      R.lastY = y; R.lastT = now
      layout()
    }
    const up = () => {
      if (!R.dragging) return
      R.dragging = false
      if (R.moved < 5) {
        R.vel = 0
        const item = (R.downTarget as HTMLElement | null)?.closest?.('[data-i]') as HTMLElement | null
        if (item) {
          const n = live.current.routes.length
          const d = wrap(Number(item.dataset.i) - Math.round(R.offset / ITEM_H), n)
          stepBy(d > n / 2 ? d - n : d)
        }
        return
      }
      if (Math.abs(R.vel) > 30) R.vel = Math.sign(R.vel) * 30
      coast()
    }
    const onMouseDown = (e: MouseEvent) => { e.preventDefault(); vp.focus({ preventScroll: true }); down(e.clientY, e.target) }
    const onMouseMove = (e: MouseEvent) => move(e.clientY)
    const onTouchStart = (e: TouchEvent) => down(e.touches[0].clientY, e.target)
    const onTouchMove = (e: TouchEvent) => { move(e.touches[0].clientY); e.preventDefault() }
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      if (R.spinning) return
      setOpen(true)
      CitySound.ensureContext(); CitySound.resume()
      stop()
      R.offset = (Math.round(R.offset / ITEM_H) + Math.sign(e.deltaY)) * ITEM_H
      R.vel = 0
      coast()
    }
    const onKey = (e: KeyboardEvent) => {
      if (R.spinning) return
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); setOpen(true); CitySound.ensureContext(); CitySound.resume(); stepBy(e.key === 'ArrowDown' ? 1 : -1) }
      else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpen(true); stepBy(0) }
      else if (e.key === 'Escape') live.current.onPick('all')
    }
    vp.addEventListener('mousedown', onMouseDown)
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', up)
    vp.addEventListener('touchstart', onTouchStart, { passive: true })
    vp.addEventListener('touchmove', onTouchMove, { passive: false })
    vp.addEventListener('touchend', up)
    vp.addEventListener('wheel', onWheel, { passive: false })
    vp.addEventListener('keydown', onKey)
    return () => {
      ro.disconnect()
      vp.removeEventListener('mousedown', onMouseDown)
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', up)
      vp.removeEventListener('touchstart', onTouchStart)
      vp.removeEventListener('touchmove', onTouchMove)
      vp.removeEventListener('touchend', up)
      vp.removeEventListener('wheel', onWheel)
      vp.removeEventListener('keydown', onKey)
    }
  }, [R, layout, stepBy, coast])

  const dots = [0, 1, 2].map((i) => routes[Math.floor((i * routes.length) / 3)])

  return (
    <div
      ref={vpRef}
      tabIndex={0}
      role="listbox"
      aria-label="Route"
      data-spinning={spinning}
      data-testid="reel"
      className={cn(
        'reel relative overflow-hidden rounded-lg border bg-black/25 outline-none transition-[height] duration-300 ease-out focus-visible:ring-2 focus-visible:ring-ring/50',
        folded ? 'h-8 cursor-pointer' : 'h-[138px] cursor-grab active:cursor-grabbing',
        !routes.length && 'animate-pulse'
      )}
    >
      <div className={cn('pointer-events-none absolute inset-0 z-[1] flex items-center gap-2 px-3.5 text-[13px] font-medium transition-opacity', folded ? 'opacity-100' : 'opacity-0')}>
        <span className="flex">
          {dots.map((r, i) => <i key={i} className="-mr-[3px] size-2.5 rounded-full border-[1.5px] border-black/70" style={{ background: r ? `rgb(${r.color.join(' ')})` : 'var(--muted-foreground)' }} />)}
        </span>
        All routes
        <span className="ml-auto text-[11px] font-normal tabular-nums text-muted-foreground">{routes.length || ''}</span>
      </div>
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgb(0_0_0/0.55),transparent_34%,transparent_66%,rgb(0_0_0/0.55))]" />
      <div ref={trackRef} className={cn('reel-track absolute inset-0 transition-opacity', folded && 'opacity-0')}>
        {routes.map((r, i) => (
          <div
            key={r.id}
            data-i={i}
            className="reel-item absolute inset-x-0 top-0 flex h-[26px] items-center gap-2 overflow-hidden pr-7 pl-3.5 text-[13px] whitespace-nowrap data-[centred=true]:font-semibold"
            style={{ '--route': `rgb(${r.color.join(' ')})` } as React.CSSProperties}
          >
            <span className="size-2.5 flex-none rounded-full bg-[var(--route)]" />
            <span className="reel-label truncate">{r.label}</span>
          </div>
        ))}
      </div>
      <div
        className={cn(
          'reel-window pointer-events-none absolute inset-x-1 top-1/2 -translate-y-1/2 rounded-md border transition-colors',
          folded ? 'h-[26px] border-transparent' : 'h-7 border-primary/50 bg-primary/10',
          spinning && 'border-rush/70 bg-rush/10',
          fetching && 'animate-pulse'
        )}
      />
      {!folded && (
        <>
          <span className="reel-lamp pointer-events-none absolute top-1/2 left-0 -translate-y-1/2 border-y-[6px] border-l-[7px] border-y-transparent border-l-primary" />
          <span className="reel-lamp pointer-events-none absolute top-1/2 right-0 -translate-y-1/2 border-y-[6px] border-r-[7px] border-y-transparent border-r-primary" />
          <span className="pointer-events-none absolute top-2 right-3 bottom-2 flex flex-col justify-between text-muted-foreground">
            <ChevronUp className="size-3" /><ChevronDown className="size-3" />
          </span>
        </>
      )}
    </div>
  )
})
