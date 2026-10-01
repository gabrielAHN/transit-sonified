import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { CITIES, CITY_ORDER, rgb, type CityId } from '@/lib/cities'
import { cn } from '@/lib/utils'
import type { Progress } from '@/engine/player'

type Props = { city: CityId, loading: Record<string, Progress>, onPick: (city: CityId) => void }

export function CityPicker ({ city, loading, onPick }: Props) {
  return (
    <Tabs value={city} onValueChange={(v) => onPick(v as CityId)} className="fixed top-4 left-1/2 z-20 -translate-x-1/2 max-md:top-[calc(10px+env(safe-area-inset-top))]">
      <TabsList className="glass h-auto gap-0.5 rounded-xl p-1 max-md:max-w-[calc(100vw-20px)]">
        {CITY_ORDER.map((id) => {
          const c = CITIES[id]
          const pr = loading[id]
          const busy = !!pr && !pr.done && !pr.error
          return (
            <TabsTrigger
              key={id}
              value={id}
              data-city={id}
              data-ready={!!pr?.done}
              style={{ '--c': rgb(c.theme) } as React.CSSProperties}
              className={cn(
                'relative h-auto flex-none gap-2 overflow-hidden rounded-lg border-0 px-3 py-1.5 text-muted-foreground shadow-none',
                'hover:bg-white/5 hover:text-foreground',
                'data-[state=active]:bg-[color-mix(in_oklab,var(--c)_16%,transparent)] data-[state=active]:text-foreground data-[state=active]:shadow-none',
                'dark:data-[state=active]:border-0 dark:data-[state=active]:bg-[color-mix(in_oklab,var(--c)_16%,transparent)]',
                'after:hidden max-md:px-2 max-md:py-1'
              )}
            >
              <span className="size-2 flex-none rounded-full bg-[var(--c)] opacity-60 in-data-[state=active]:opacity-100" />
              <span className="flex flex-col items-start leading-tight">
                <span className="text-[13px] font-medium in-data-[state=active]:text-[var(--c)] max-md:text-xs">{c.label}</span>
                <span className="text-[10px] font-normal text-muted-foreground max-md:hidden">{c.network}</span>
              </span>
              <span
                className={cn('absolute inset-x-2 bottom-0.5 h-0.5 origin-left rounded-full bg-[var(--c)] transition-[opacity,transform] duration-300', busy ? 'opacity-100' : 'opacity-0')}
                style={{ transform: `scaleX(${pr?.p ?? 0})` }}
              />
            </TabsTrigger>
          )
        })}
      </TabsList>
    </Tabs>
  )
}
