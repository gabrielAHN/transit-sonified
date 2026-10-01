export type CityId = 'nyc' | 'madrid' | 'tokyo' | 'hongkong'

export type City = {
  slug: string
  label: string
  network: string
  center: [number, number]
  zoom: number
  theme: [number, number, number]
  window: [string, string]
  rush: [string, string][]
  bounds: [[number, number], [number, number]]
}

export const SERVICE_DATE = '2026-10-02'

export const CITIES: Record<CityId, City> = {
  nyc: {
    slug: 'nyc', label: 'New York', network: 'Subway',
    center: [-73.97, 40.75], zoom: 10.5, theme: [45, 178, 255],
    window: ['05:00:00', '23:00:00'],
    rush: [['07:00:00', '10:00:00'], ['16:00:00', '19:00:00']],
    bounds: [[-74.55, 40.35], [-73.45, 41.05]]
  },
  madrid: {
    slug: 'madrid', label: 'Madrid', network: 'Metro',
    center: [-3.69, 40.42], zoom: 10.8, theme: [255, 138, 43],
    window: ['05:00:00', '23:00:00'],
    rush: [['07:00:00', '09:30:00'], ['18:00:00', '20:00:00']],
    bounds: [[-4.05, 40.15], [-3.30, 40.68]]
  },
  tokyo: {
    slug: 'tokyo', label: 'Tokyo', network: 'Tokyo Metro',
    center: [139.75, 35.68], zoom: 10.2, theme: [255, 74, 122],
    window: ['05:00:00', '23:00:00'],
    rush: [['07:00:00', '09:30:00'], ['17:00:00', '19:30:00']],
    bounds: [[139.30, 35.42], [140.10, 36.00]]
  },
  hongkong: {
    slug: 'hong-kong', label: 'Hong Kong', network: 'MTR',
    center: [114.12, 22.36], zoom: 10.5, theme: [38, 214, 170],
    window: ['05:00:00', '23:00:00'],
    rush: [['07:00:00', '10:00:00'], ['17:00:00', '20:00:00']],
    bounds: [[113.75, 22.12], [114.45, 22.60]]
  }
}

export const CITY_ORDER: CityId[] = ['nyc', 'madrid', 'tokyo', 'hongkong']

export const cityFromSlug = (slug?: string): CityId | null =>
  CITY_ORDER.find((id) => CITIES[id].slug === slug?.toLowerCase()) ?? null

export const rgb = (c: number[], a?: number) => (a == null ? `rgb(${c.join(' ')})` : `rgb(${c.join(' ')} / ${a})`)
