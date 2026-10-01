export const str = (v: unknown) => "'" + String(v).replaceAll("'", "''") + "'"
export const ident = (v: unknown) => '"' + String(v).replaceAll('"', '""') + '"'
const ints = (values: number[]) => '[' + values.map((n) => Number(n) | 0).join(', ') + ']'

export type Tuning = { date: string, scale: number[], lowMidi: number, octaves: number }
export type EventsOptions = Tuning & { from: string, to: string }

const tuning = (o: Tuning) =>
  `p_date := ${str(o.date)}, low_midi := ${Number(o.lowMidi) | 0}, octaves := ${Number(o.octaves) | 0}, scale := ${ints(o.scale)}, p_pitch_axis := 'lon'`

const routes = `
  SELECT route_id, route_name, route_color_hex, trip_count,
         CASE WHEN count(*) OVER (PARTITION BY route_name) > 1 THEN route_name || ' · ' || route_id
              ELSE route_name END AS label,
         row_number() OVER (ORDER BY route_sort_order NULLS LAST, route_name, route_id) AS ord
  FROM get_routes_table_data()
  WHERE trip_count > 0`

const running = (t: string) => `
  WITH spans AS (
    SELECT min(t_sec) // 60 AS a, max(t_sec) // 60 AS b FROM ${ident(t)} GROUP BY trip_id
  ),
  steps AS (
    SELECT m, sum(d) AS d FROM (
      SELECT a AS m, 1 AS d FROM spans UNION ALL SELECT b + 1 AS m, -1 AS d FROM spans
    ) GROUP BY m
  ),
  raw AS (
    SELECT r.range AS m, sum(coalesce(s.d, 0)) OVER (ORDER BY r.range) AS n
    FROM range(0, 1800) r LEFT JOIN steps s ON s.m = r.range
  ),
  curve AS (
    SELECT m, avg(n) OVER (ORDER BY m ROWS BETWEEN 15 PRECEDING AND 15 FOLLOWING) AS trips FROM raw
  )
  SELECT m, trips,
         min(trips) FILTER (WHERE m BETWEEN 600 AND 960) OVER () AS base,
         max(trips) OVER () AS peak
  FROM curve ORDER BY m`

export const Q = {
  routes: () => routes + ' ORDER BY ord',

  routeLines: () => `
    WITH shapes AS (
      SELECT s.route_id, s.shape_id, any_value(s.route_name) AS route_name, any_value(s.route_color_hex) AS route_color_hex,
             list(s.shape_pt_lon ORDER BY s.shape_pt_sequence) AS lons,
             list(s.shape_pt_lat ORDER BY s.shape_pt_sequence) AS lats
      FROM get_route_shapes_for_routes((SELECT list(route_id) FROM get_routes_table_data())) s
      WHERE s.shape_pt_lat IS NOT NULL AND s.shape_pt_lon IS NOT NULL
      GROUP BY s.route_id, s.shape_id
    )
    SELECT * FROM shapes
    QUALIFY row_number() OVER (PARTITION BY route_id ORDER BY len(lons) DESC, shape_id) = 1
    ORDER BY route_id`,

  routeBounds: (routeId: string) => `SELECT * FROM get_route_map_bounds([${str(routeId)}])`,

  stops: (o: Tuning) => `
    CREATE OR REPLACE TEMP TABLE stop_notes AS
    SELECT stop_id, stop_name, lat, lon, route_ids, freq_hz, pan
    FROM gtfs_sonify_stops(${tuning(o)})`,

  events: (t: string, o: EventsOptions) => `
    CREATE OR REPLACE TEMP TABLE ${ident(t)} AS
    SELECT trip_id, route_id, route_color_hex, hue, stop_name, lat, lon, t_sec, midi, freq_hz, pan,
           accent, velocity
    FROM gtfs_sonify_events(${tuning(o)}, p_from := ${str(o.from)}, p_to := ${str(o.to)})`,

  routeEvents: (t: string, from: string, routeId: string) => `
    CREATE OR REPLACE TEMP TABLE ${ident(t)} AS
    SELECT * FROM ${ident(from)} WHERE route_id = ${str(routeId)} ORDER BY rowid`,

  window: (t: string, from: number, to: number) => `
    SELECT * FROM ${ident(t)}
    WHERE t_sec >= ${from | 0} AND t_sec < ${to | 0}
    ORDER BY t_sec, rowid`,

  stations: (routeId: string | null) => `
    WITH r AS (${routes}),
    calls AS (
      SELECT round(lat, 5) AS klat, round(lon, 5) AS klon, unnest(route_ids) AS route_id,
             stop_name, lat, lon, freq_hz, pan
      FROM stop_notes
    ),
    per_line AS (
      SELECT klat, klon, route_id, any_value(stop_name) AS stop_name, any_value(lat) AS lat,
             any_value(lon) AS lon, any_value(freq_hz) AS freq_hz, any_value(pan) AS pan
      FROM calls GROUP BY ALL
    )
    SELECT klat || ',' || klon AS key, any_value(c.stop_name) AS stop_name,
           any_value(c.lat) AS lat, any_value(c.lon) AS lon,
           any_value(c.freq_hz) AS freq_hz, any_value(c.pan) AS pan,
           ${routeId ? `any_value(r.route_color_hex) FILTER (WHERE r.route_id = ${str(routeId)})` : 'arg_min(r.route_color_hex, r.ord)'} AS color_hex,
           string_agg(r.label, ' · ' ORDER BY r.ord) AS lines
    FROM per_line c JOIN r USING (route_id)
    GROUP BY klat, klon
    ${routeId ? `HAVING bool_or(c.route_id = ${str(routeId)})` : ''}`,

  running: (t: string) => running(t),

  rush: (t: string, fromSec: number, toSec: number) => `
    WITH curve AS (${running(t)}),
    w AS (
      SELECT m, trips, base, trips >= base * 1.06 AS above FROM curve
      WHERE m BETWEEN ${Math.floor(fromSec / 60)} AND ${Math.ceil(toSec / 60)}
    ),
    runs AS (SELECT *, m - row_number() OVER (PARTITION BY above ORDER BY m) AS run FROM w),
    peaks AS (
      SELECT run, min(m) AS a, max(m) AS b, max(trips) AS top, arg_max(m, trips) AS p, any_value(base) AS base
      FROM runs WHERE above GROUP BY run
      HAVING max(trips) / any_value(base) - 1 >= 0.07 AND max(m) - min(m) >= 45
    ),
    core AS (
      SELECT k.run, k.p, r.m, r.m - row_number() OVER (PARTITION BY k.run ORDER BY r.m) AS part
      FROM peaks k JOIN runs r ON r.m BETWEEN k.a AND k.b AND r.trips >= k.base + (k.top - k.base) * 0.5
    ),
    bands AS (
      SELECT greatest(min(m), any_value(p) - 210) AS lo, least(max(m), lo + 210) AS hi
      FROM core GROUP BY run, part HAVING bool_or(m = p)
    )
    SELECT CAST(round(lo / 5) * 300 AS INTEGER) AS from_sec, CAST(round((hi + 1) / 5) * 300 AS INTEGER) AS to_sec
    FROM bands WHERE hi - lo >= 30 ORDER BY lo`,

  count: (t: string, from: number, to: number) =>
    `SELECT count(*) AS n FROM ${ident(t)} WHERE t_sec >= ${from} AND t_sec <= ${to}`
}
