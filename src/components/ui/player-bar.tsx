import { useRef } from 'react'
import { Pause, Play, Volume2, Zap } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'
import { cn } from '@/lib/utils'
import { clock, player, type Snapshot } from '@/engine/player'

const hhmm = (sec: number) => clock(sec).slice(0, 5)

function RushSection ({ snap, busy }: { snap: Snapshot, busy: boolean }) {
  if (busy || !snap.rush.length) return null
  return (
    <div data-testid="rush-section" className="pointer-events-auto absolute inset-x-4 -top-8 flex items-center gap-1.5 max-md:inset-x-3 max-md:-top-7">
      <span className="flex items-center gap-1 text-[10px] font-semibold tracking-[0.14em] text-rush uppercase [text-shadow:0_1px_6px_rgb(0_0_0/0.8)]">
        <Zap className="size-3" fill="currentColor" />
        Rush
      </span>
      {snap.rush.map(([f, t], i) => {
        const now = snap.rushBand === i
        return (
          <button
            key={i}
            type="button"
            data-testid="rush-chip"
            data-now={now}
            onClick={() => player.seek(f)}
            aria-label={'Jump to rush ' + hhmm(f) + ' to ' + hhmm(t)}
            className={cn(
              'rush-chip glass rounded-full px-2 py-0.5 text-[10px] font-medium tabular-nums transition-colors max-md:px-1.5',
              now ? 'text-rush' : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {hhmm(f)}–{hhmm(t)}
          </button>
        )
      })}
    </div>
  )
}

export function PlayerBar ({ snap }: { snap: Snapshot }) {
  const scrub = useRef<HTMLDivElement>(null)
  const pr = snap.loading[snap.city]
  const busy = !pr || !pr.done
  const span = snap.toSec - snap.fromSec || 1
  const pct = (s: number) => ((s - snap.fromSec) / span) * 100
  const frac = Math.max(0, Math.min(100, pct(snap.cursor)))
  const hours: number[] = []
  for (let h = Math.ceil(snap.fromSec / 3600); h <= Math.floor(snap.toSec / 3600); h += 3) hours.push(h)

  const seekAt = (clientX: number) => {
    const r = scrub.current!.getBoundingClientRect()
    player.seek(snap.fromSec + Math.max(0, Math.min(1, (clientX - r.left) / r.width)) * span)
  }

  return (
    <div
      ref={(el) => { player.playerEl = el }}
      data-testid="player"
      className="player glass fixed bottom-3.5 left-1/2 z-20 flex w-[min(640px,calc(100vw-24px))] -translate-x-1/2 items-center gap-2.5 rounded-full py-1.5 pr-4 pl-1.5 max-md:bottom-[calc(10px+env(safe-area-inset-bottom))] max-md:gap-2 max-md:pr-3"
    >
      <div className={cn('pointer-events-none absolute inset-x-4 -top-7 flex items-center gap-2 text-xs transition-all', busy ? 'translate-y-0 opacity-100' : 'translate-y-1.5 opacity-0', pr?.error && 'text-destructive')}>
        <span className="size-1.5 animate-pulse rounded-full bg-primary" />
        <span className="[text-shadow:0_1px_6px_rgb(0_0_0/0.8)]">{pr && !pr.done ? pr.text : ''}</span>
        <span className="ml-auto tabular-nums text-primary">{pr && !pr.done && !pr.error ? Math.round(pr.p * 100) + '%' : ''}</span>
      </div>

      <RushSection snap={snap} busy={busy} />

      <div className="relative grid size-10 flex-none place-items-center">
        <svg viewBox="0 0 40 40" className={cn('pointer-events-none absolute inset-0 -rotate-90 transition-opacity', busy ? 'opacity-100' : 'opacity-0')}>
          <circle cx="20" cy="20" r="18.5" fill="none" strokeWidth="2" className="stroke-white/10" />
          <circle cx="20" cy="20" r="18.5" fill="none" strokeWidth="2" pathLength={100} strokeDasharray="100" strokeDashoffset={100 - (pr?.p ?? 0) * 100} strokeLinecap="round" className="stroke-primary transition-[stroke-dashoffset] duration-300" />
        </svg>
        <span className="rush-ring pointer-events-none absolute inset-0.5 rounded-full" />
        <Button
          id="play-btn"
          size="icon"
          aria-label={snap.playing ? 'Pause' : 'Play'}
          disabled={busy}
          onClick={player.toggle}
          className="size-8 rounded-full shadow-none"
        >
          {snap.playing ? <Pause className="size-4" fill="currentColor" /> : <Play className="size-4 translate-x-px" fill="currentColor" />}
        </Button>
      </div>

      <div className={cn('rush-clock flex min-w-16 flex-col text-[13px] leading-tight font-semibold tabular-nums transition-opacity max-md:min-w-14 max-md:text-xs', busy && 'opacity-50')}>
        <span data-testid="clock">{clock(snap.cursor)}</span>
        <Badge variant="outline" className={cn('rush-flag h-auto border-0 p-0 text-[8px] font-semibold tracking-[0.14em] text-rush transition-opacity', snap.inRush ? 'opacity-100' : 'opacity-0')}>
          RUSH
        </Badge>
      </div>

      <div className="relative flex-1 pb-3">
        <div
          ref={scrub}
          data-testid="scrubber"
          className="relative h-[5px] cursor-pointer touch-none rounded-full bg-white/10"
          onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); seekAt(e.clientX) }}
          onPointerMove={(e) => { if (e.currentTarget.hasPointerCapture(e.pointerId)) seekAt(e.clientX) }}
        >
          {snap.rush.map(([f, t], i) => (
            <span key={i} data-now={snap.rushBand === i} className="rush-band absolute inset-y-0 rounded-full" style={{ left: pct(f) + '%', width: ((t - f) / span) * 100 + '%' }} />
          ))}
          <div className={cn('absolute inset-y-0 left-0 overflow-hidden rounded-full bg-primary/85 transition-opacity', busy && 'opacity-25')} style={{ width: frac + '%' }}>
            <div className="rush-stream absolute inset-0" />
          </div>
          {busy && (
            <div
              className="pointer-events-none absolute inset-y-0 left-0 rounded-full bg-[linear-gradient(100deg,transparent_30%,rgb(255_255_255/0.45)_50%,transparent_70%)] bg-primary/40 bg-[length:60px_100%] animate-[glint_1.1s_linear_infinite]"
              style={{ width: (pr?.p ?? 0) * 100 + '%' }}
            />
          )}
          <div className={cn('absolute top-1/2 z-[2] size-[11px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-white transition-opacity', busy && 'opacity-25')} style={{ left: frac + '%' }}>
            <span className="rush-ripple pointer-events-none absolute -inset-0.5 rounded-full" />
          </div>
        </div>
        <div className="absolute inset-x-0 top-2 h-2.5">
          {hours.map((h, i) => (
            <span key={h} className={cn('absolute -translate-x-1/2 text-[9px] whitespace-nowrap text-muted-foreground', i % 2 === 1 && 'max-md:hidden')} style={{ left: pct(h * 3600) + '%' }}>
              {String(h % 24).padStart(2, '0')}h
            </span>
          ))}
        </div>
      </div>

      <Volume2 className="size-4 flex-none text-muted-foreground max-md:hidden" />
      <Slider
        aria-label="Volume"
        className="w-16 flex-none max-md:hidden"
        value={[snap.volume]} min={0} max={1} step={0.05}
        onValueChange={([v]) => player.setVolume(v)}
      />
    </div>
  )
}
