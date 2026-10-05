# Transit Sonified

The day's schedules of the New York Subway, Madrid Metro, Tokyo Metro and Hong Kong MTR, played as music on a map. Every departure is a note, and its station lights up as it plays.

**Live:** https://transit-sonified-production.up.railway.app · `/nyc` · `/madrid` · `/tokyo` · `/hong-kong`

## Run

```sh
npm install
npm run dev      # http://localhost:5178
npm run build    # static site in dist/
```

Node 20+. Everything runs in the browser, so there is no backend.

## GTFS DuckDB extension

The schedules are queried with the [GTFS DuckDB extension](https://github.com/gabrielAHN/gtfs-duckdb), running in DuckDB-WASM ([docs](https://gtfs-viz-production-f1a4.up.railway.app/docs/gtfs-duckdb), [functions](https://gtfs-viz-production-f1a4.up.railway.app/docs/gtfs-duckdb/functions)).

- `gtfs_import` loads each city's feed into `public/db/transit.duckdb`, one schema per city.
- `get_routes_table_data` and `get_route_map_bounds` give the routes and their extent.
- `gtfs_sonify_stops` gives each stop a note: pitch rises from west to east on the city's scale.
- `gtfs_sonify_events` turns every departure of the day into its stop's note. A route filter returns that route's rows of the city-wide result.
- `get_route_shapes_for_routes` gives the route lines drawn on the map.

The app runs all its queries from `src/engine/queries.ts` and only voices and draws what they return. `npm run dev` and `npm run build` download the extension's browser builds from its [1.0.1 release](https://github.com/gabrielAHN/gtfs-duckdb/releases/tag/v1.0.1), check their SHA-256 sums and serve them from `/extensions`. Set `GTFS_EXTENSION_VERSION` to use another release, or `GTFS_EXTENSION_SOURCE` to a `.tar.gz` path or URL.

## Sound

The notes are played with [Strudel](https://strudel.cc/workshop/getting-started/)'s audio engine. Each city's sound is a line of Strudel code (`CITY_CODE` in `src/engine/sound.js`): every departure plays its stop's note through it, and a trip's first and last stops add a hit. One cycle is one hour of the schedule, so `s("<gm_koto gm_orchestral_harp>")` changes instrument every hour.

Edit a city's code live from the ♪ button in the header. Changes are saved in the browser, and Reset brings back the default. The General MIDI instruments load from Strudel's soundfont host; sample names such as `s("bd")` load the Dirt-Samples and drum-machine banks on first use.

## Data

| City | Source feed |
|---|---|
| New York | [MTA subway GTFS](http://web.mta.info/developers/data/nyct/subway/google_transit.zip) |
| Madrid | [CRTM Metro de Madrid GTFS](https://crtm.maps.arcgis.com/sharing/rest/content/items/5c7f2951962540d69ffe8f640d94c246/data). Trips are expanded from its headways. |
| Tokyo | [Tokyo rail GTFS by mkuran.pl](https://mkuran.pl/gtfs/tokyo/rail.zip), Tokyo Metro lines |
| Hong Kong | [Just Use Wheels Hong Kong GTFS](http://feed.justusewheels.com/hk.gtfs.zip) ([Mobility Database mdb-2933](https://mobilitydatabase.org/feeds/gtfs/mdb-2933)), MTR heavy rail. Trips are expanded from its headways. |

The prebuilt database (DuckDB storage v1.4.0) ships in `public/db`, along with zstd and gzip copies (about 7 MB over the wire).

## Deploy

Deploy your own copy from a checkout with the Railway CLI:

```sh
railway up --detach
```

`railpack.json` builds the site, and the `Caddyfile` serves `dist/`: the WASM content type, the precompressed database, and city URLs that fall back to `index.html`.

The Railway service settings (GitHub source, builder, watch paths and healthcheck) live in `.railway/railway.ts`. Preview changes with `railway config plan` and apply them with `railway config apply`.

## License

[AGPL-3.0-or-later](LICENSE), the license of Strudel, which the site bundles. The schedules in `public/db` come from the feeds listed under [Data](#data) and keep their publishers' terms.
