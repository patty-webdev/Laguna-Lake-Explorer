# Laguna Lake Explorer

Laguna Lake Explorer is an interactive web app for exploring Laguna de Bay and examining historical water-quality readings from the Laguna Lake Development Authority (LLDA). It combines a 3D satellite map, station readings, historical charts, and a searchable research archive in one browser workspace.

The app is built with HTML, CSS, JavaScript, and MapLibre GL JS. The map and research features run from a static HTTP server. The landing news feed uses an optional Vercel Function.

## Run locally

Open the project folder in VS Code. With the **Live Server** extension installed, right-click **index.html** and select **Open with Live Server**. You can also run this command from a terminal in the project folder.

    python -m http.server 8000

Open [http://localhost:8000](http://localhost:8000). On Windows, use **py** in place of **python** if needed. Serve the folder over HTTP so the browser can fetch its JSON, CSV, and GeoJSON files. Use a WebGL-capable browser with internet access for MapLibre and the external tile providers.

## Private presentation on Vercel

1. Import the repository into Vercel using the **Other** framework preset and leave **Root Directory** at the repository root. The checked-in `vercel.json` sets the static output to `.` so Vercel serves `index.html`, the scripts, and the existing `public/data` paths. Include `api/news/laguna-lake.mjs` in the deployed commit.
2. In **Settings → Deployment Protection**, enable **Vercel Authentication** for Preview deployments. Use a protected Preview URL for the presentation. On Hobby, the production domain is public.
3. Get an API key from your Media Cloud account. In **Settings → Environment Variables**, add it as the secret `MEDIACLOUD_API_KEY` for **Preview**, then create a new Preview deployment. Keep the key in Vercel's environment settings.
4. Open `/api/news/laguna-lake` on the Preview URL. Confirm it returns JSON with `articles` and `fetchedAt`. Open the landing page, navigate the slider, and verify that the headlines open their publishers.

If that endpoint returns 404, check that the Preview deployment was built from the latest commit and that the project root contains both `index.html` and `api/`. A response containing `news_not_configured` confirms the function is deployed and needs its environment variable.

For local testing of the feed, run `vercel dev` with `MEDIACLOUD_API_KEY` in the shell environment or in the Vercel Development environment. A plain static server can preview the map and layout and cannot run the news function.

The endpoint uses the [Media Cloud Search API](https://www.mediacloud.org/documentation/search-api-guide) to search Philippine news collections from January 2020 onward. It finds collections through the Media Cloud Directory. To choose collections explicitly, set `MEDIACLOUD_COLLECTION_IDS` to comma-separated numeric IDs from the [Media Cloud Directory](https://www.mediacloud.org/media-cloud-directory). The endpoint caches successful responses for 30 minutes and can return a saved response during an outage. The browser also keeps the last successful response.

## Explore the lake

The landing page shows up to six matching Media Cloud articles in a vertical slider. Use the up and down buttons or swipe inside the panel. Cards show the publisher, Media Cloud's estimated publication date, and a link to the original article. The cards use a placeholder because the story list does not supply thumbnails. Categories are inferred from headlines. **Open Google News** provides a separate search across other sources.

The landing map opens at **zoom 9.5** and **75 degrees of pitch**, with 3D terrain on. It starts rotating as the map renders and respects the browser's reduced-motion preference. Select **Explore** to enter the map workspace. On mobile, open **Map tools** to show the Exploration Console.

- **Explore** offers 3D and top-down camera views, an elevation toggle, and shortcuts to the lake overview and individual bays. The bay shortcuts go to geographic viewpoints. **Focus selected station** goes to a historical station location when one is available.
- **Philippines** and **Area of Responsibility** switch to regional views. The dashed outline represents the PAGASA tropical cyclone monitoring area. The map masks neighboring land in the regional view.
- **3D buildings** can appear at zoom 15 or closer where OpenFreeMap has building footprints and height information.
- **Reset view** returns to the lake overview. **Controls** opens the in-app guide. **Home** returns to the landing map.

| Control | Action |
| --- | --- |
| W / A / S / D or arrow keys | Move forward, left, backward, or right |
| Shift | Move faster while held |
| Q / E | Rotate |
| R / F | Tilt |
| + / - or mouse wheel | Zoom |
| Mouse drag | Pan |
| Right mouse drag | Rotate and tilt |
| Touch drag / pinch | Pan / zoom |

## Water Quality map

Choose **Water Quality** in the Exploration Console to open the flat OpenStreetMap view. Pick a parameter and month, then choose **Station readings** or **Relative heatmap**.

- **Station readings:** Green markers indicate a reading within the DENR Class C guideline. Red indicates a reading outside it. Gray indicates a reading that was not assessed.
- **Station popup:** Click a marker to see all eight configured parameters for that station and month. Reported values include units, review status, and LLDA report links. Missing entries display **No reported reading**.
- **Relative heatmap:** The heatmap combines normalized numeric readings and requires at least three mapped readings for the selected parameter and month. Its colors show relative intensity, which can extend beyond the shoreline.
- **Reported readings:** Expand this list below the legend to see every reading for the selected parameter and month, including stations without map coordinates.
- **What can cause an unusual reading?** opens the Research explanations related to the selected parameter.

| Parameter | Class C comparison used by the app |
| --- | --- |
| Biochemical oxygen demand (BOD) | 7 mg/L or less |
| Dissolved oxygen (DO) | 5 mg/L or more |
| pH | 6.5 through 9.0 |

The app leaves qualified or missing values unassessed. Nitrate and phosphate also remain unassessed because the bundled data does not establish their reporting basis. Each marker describes a single reading relative to the benchmark. [DENR Environmental Management Bureau guideline table](https://r9.emb.gov.ph/wp-content/uploads/2025/08/ANNUAL-REGIONAL-WATER-QUALITY-STATUS-REPORT-2023.pdf)

## Historical Trends

Choose **Historical Trends** in the Exploration Console, then select a station and parameter. Clicking a mapped station updates the chart and highlights its marker. Changing the monitoring station in the dropdown also moves the map to that station when coordinates are available. Readings for stations without map coordinates are available in the Research archive.

The chart plots exact numeric monthly readings on a calendar axis and connects consecutive months. Missing months and qualified readings leave gaps. Expand **Historical readings and sources** to see the reported values, review statuses, and LLDA report links, including values such as **&lt;0.1** that are excluded from the plot.

## Research and possible causes of water anomalies

Open **Research** from the map header.

- **Possible causes of water anomalies** summarizes LLDA findings on household and industrial waste, watershed nutrient inputs, conditions that favor algal blooms, and wind-driven sediment. Attributing a particular reading to one of these causes requires evidence from the same place and time. [LLDA Water Mondriaan](https://llda.gov.ph/the-water-mondriaan/) / [LLDA algal bloom advisory](https://llda.gov.ph/laguna-de-bay-algal-bloom-advisory/) / [LLDA lake profile](https://llda.gov.ph/laguna-de-bay/)
- **Browse consolidated data** contains searchable tables for measurements, parameters, the 2024 station register, source inventory, extraction coverage, and reported station counts.
- **Download package files** lists all eight original files, including both measurement formats and the package README.
- The Research dialog also displays lake-wide annual averages, reported station counts, and the inventory grouped by report family.

## Dataset coverage and limitations

The [consolidated research package](public/data/Laguna_Lake_Consolidated_Research_2026/README.md) contains **593 measurements**.

| Period | Coverage | Records |
| --- | --- | ---: |
| October to December 2023 | Monthly station BOD and DO for 15 lake stations | 90 |
| 2023 | Lake-wide annual BOD average | 1 |
| October to December 2024 | Monthly station readings for BOD, DO, pH, nitrate, and phosphate | 225 |
| January to March 2025 | Monthly station BOD and DO for 14 lake stations | 84 |
| January to June 2026 | Monthly station readings for BOD and DO | 192 |
| 2025 | Lake-wide annual BOD average | 1 |

The app loads the consolidated measurement JSON as its source. The standalone [Q4 2024 audit JSON](public/data/water_quality_audited_2024_Q4.json) contains the same 225 populated values. Chemical oxygen demand (COD), turbidity, and temperature appear in the parameter list but have no bundled numeric measurements.

The package is a partial historical extraction. The source inventory includes reports with no extracted readings. Q4 2024 readings are flagged for recheck, and the 2023 Q4, 2025 Q1, and 2026 monthly transcriptions require a second review. Reported qualifiers remain intact, and missing or censored measurements are never treated as zero. Annual BOD averages are displayed separately from station-month readings.

Nine stations use historical coordinates from Appendix A of the [published spatial variability study](https://www.researchgate.net/publication/349406848_Spatial_Variability_Model_for_Water_Quality_Assessment_of_the_Physicochemical_Parameters_and_the_Water_Quality_Index_of_Laguna_Lake_and_its_Tributaries). The Water Quality map matches measurements by station ID and station name. Sampling positions may have changed. The app has no validated shoreline polygon for clipping the heatmap.

## Project structure

| Path | Purpose |
| --- | --- |
| [index.html](index.html) | Landing page, Exploration Console, and dialogs |
| [app.js](app.js) | Map setup, camera controls, terrain, and app navigation |
| [water-quality.js](water-quality.js) | Station markers, Class C comparisons, heatmap, popup, and historical chart |
| [research.js](research.js) | Dataset loading, searchable tables, archive, and anomaly explanations |
| [tutorial.js](tutorial.js) | Guided tour and control help |
| [styles.css](styles.css) | Responsive layout and visual styling |
| [public/data/](public/data/) | Research tables, measurements, and map boundary data |

## Map credits

- Satellite imagery comes from Esri World Imagery and its credited contributors. [Esri item page](https://www.arcgis.com/home/item.html?id=10df2279f9684e4a9f6a7f08febac2a9)
- Elevation comes from AWS Terrain Tiles / Mapzen. Building data comes from OpenFreeMap and OpenStreetMap contributors. The Water Quality basemap uses OpenStreetMap. [OpenStreetMap attribution](https://www.openstreetmap.org/copyright)
- The regional mask combines PAGASA PAR coordinates, the geoBoundaries Philippines ADM0 boundary from OCHA Philippines and NAMRIA (CC BY 3.0 IGO), and Natural Earth neighboring land outlines. [PAGASA PAR](https://www.pagasa.dost.gov.ph/learning-tools/philippine-area-of-responsibility) / [geoBoundaries PHL ADM0](https://www.geoboundaries.org/api/current/gbOpen/PHL/ADM0/) / [Natural Earth outlines](https://github.com/nvkelso/natural-earth-vector/tree/v5.1.2)
