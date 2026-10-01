import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { useNavigate, useParams } from 'react-router'
import { AudioLines, Check, Link2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { CityPicker } from '@/components/CityPicker'
import { RoutePanel } from '@/components/RoutePanel'
import { PlayerBar } from '@/components/ui/player-bar'
import { cn } from '@/lib/utils'
import { CITIES, cityFromSlug, type CityId } from '@/lib/cities'
import { player } from '@/engine/player'

export default function App () {
  const { city: slug } = useParams()
  const navigate = useNavigate()
  const city = cityFromSlug(slug)
  const snap = useSyncExternalStore(player.subscribe, player.getSnapshot)
  const mapEl = useRef<HTMLDivElement>(null)
  const mounted = useRef(false)
  const [card, setCard] = useState<{ label: string, sub: string, key: number } | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!city) { navigate('/' + CITIES.nyc.slug + location.search, { replace: true }); return }
    document.title = CITIES[city].label + ' · Transit Sonified'
    if (!mounted.current) {
      mounted.current = true
      player.onCityCard = (label, sub) => setCard({ label, sub, key: performance.now() })
      player.mount(mapEl.current!, city)
    } else {
      player.switchCity(city)
    }
  }, [city, navigate])

  const pr = snap.loading[snap.city]
  useEffect(() => { document.body.classList.toggle('loading', !pr || !pr.done) }, [pr])

  const pickCity = (id: CityId) => {
    const path = '/' + CITIES[id].slug
    if (location.pathname !== path) navigate(path + location.search)
  }
  const pickRoute = (route: string, opts?: { random?: boolean }) => player.selectRoute(route, { play: !!opts?.random })
  const share = async () => {
    const url = location.origin + '/' + CITIES[snap.city].slug
    try { await navigator.clipboard.writeText(url) } catch { }
    setCopied(true)
    setTimeout(() => setCopied(false), 1600)
  }

  return (
    <TooltipProvider delayDuration={300}>
      <div className="fixed inset-0"><div ref={mapEl} className="size-full" /></div>

      {card && (
        <div key={card.key} className="city-card-show pointer-events-none fixed top-[42%] left-1/2 z-10 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1.5 opacity-0">
          <span className="text-[56px] font-bold tracking-wide text-primary max-md:text-[40px]">{card.label}</span>
          <span className="text-[13px] tracking-[0.18em] text-foreground/80 uppercase tabular-nums max-md:text-[11px]">{card.sub}</span>
        </div>
      )}

      <div className="glass fixed top-4 right-4 z-20 flex items-center gap-2 rounded-xl py-1.5 pr-1.5 pl-2.5 max-lg:hidden">
        <span className="grid size-7 place-items-center rounded-lg bg-primary/15 text-primary"><AudioLines className="size-4" /></span>
        <h1 className="text-sm font-semibold tracking-wide">Transit Sonified</h1>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" className="size-7 text-muted-foreground" onClick={share} aria-label="Copy link to this city">
              {copied ? <Check className="size-3.5" /> : <Link2 className="size-3.5" />}
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">{copied ? 'Link copied' : 'Copy link to ' + CITIES[snap.city].label}</TooltipContent>
        </Tooltip>
      </div>

      {city && <CityPicker city={snap.city} loading={snap.loading} onPick={pickCity} />}
      <RoutePanel snap={snap} onPick={pickRoute} onAim={(r) => player.prefetchRoute(r)} defaultOpen={!matchMedia('(max-width: 720px)').matches} />
      <PlayerBar snap={snap} />

      <div
        id="sound-hint"
        className={cn(
          'glass pointer-events-none fixed bottom-20 left-1/2 z-30 -translate-x-1/2 rounded-full px-3.5 py-1.5 text-xs transition-all max-md:bottom-[calc(70px+env(safe-area-inset-bottom))]',
          snap.hint ? 'translate-y-0 opacity-100' : 'translate-y-2 opacity-0'
        )}
      >
        Click anywhere to turn on sound
      </div>
    </TooltipProvider>
  )
}
