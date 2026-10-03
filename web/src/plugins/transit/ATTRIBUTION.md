# Attribution & Licenses

## Transit network data

The matatu/bus network rendered by this plugin — lines, stage stops, route
shapes, headways — comes from the Kampala GTFS feed collected by
**MapUganda** and **Transport for Cairo** under a consortium led by
Transitec, for the French Development Agency (AfD) "Study of the Paratransit
Transport System and Street Usage in the Kampala Metropolitan Area"
(fieldwork late 2019 – early 2020).

- Source: <https://gitlab.com/digitaltransport/data/africa/kampala>
- License: **CC BY 3.0** (`LICENSE_CC-BY-3.0` in that repository)
- Indexed in the Mobility Database as `mdb-1813`.

Required credit (also shown in the plugin's footer):
"Transit data © MapUganda & Transport for Cairo, CC BY 3.0".

Fares shown for journeys are **estimates drafted from public knowledge**;
they are not part of the source feed and are validated separately
(see `pipeline/config/fares.json`).

## Map data & imagery

- Basemap vector tiles: OpenFreeMap (<https://openfreemap.org>), data ©
  OpenStreetMap contributors (ODbL).
- Satellite raster (if used): Esri World Imagery.
- Walking-leg geometry: OSRM demo server, data © OpenStreetMap
  contributors.

## Regenerating

The plugin bundles a processed snapshot of the feed at
`data/transit-data.json`. Regenerate it with:

```bash
cd pipeline && npm install && npm run build:data
```

The snapshot embeds its own generation date and vintage metadata, which the
UI surfaces so users always know how old the network data is.
