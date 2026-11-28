# Laguna Lake river monitoring demo

JSON arrays use station_id as a string join key. GeoJSON uses longitude, latitude. Monthly measurements are historical, not live. Each parameter stores the reported string, numeric value (null for missing or censored), qualifier and status; a censored value has a separate limit. Never turn null into zero.

The Q4 2024 river data is a single-pass manual transcription of PDF page 3; check values against the source before scientific use. Coordinates and news are retained from earlier research and have not been independently reverified. Saran and Binangonan are missing coordinates. Tanay 22B label conflict is flagged. COD, turbidity, temperature, TSS, chloride and oil/grease are not in this river table. The exam allows four to six parameters; use available DO, BOD, pH, nitrate and phosphate where present, and show unavailable otherwise. The news associations refer to rivers, not exact sampling sites. The file includes no river paths or lake boundaries.
