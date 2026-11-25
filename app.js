/* Laguna Lake Explorer — no fictional station coordinates and no live-data claims. */
const $ = (id) => document.getElementById(id);
const mobileLayout = '(max-width:760px), (max-width:950px) and (max-height:520px)';
function setMobilePanel(open) {
  const toggle = $('panelToggle');
  document.body.classList.toggle('mobile-panel-open', open);
  toggle.setAttribute('aria-expanded', String(open));
  toggle.textContent = open ? 'Hide tools' : 'Map tools';
}
const toast = (message) => { const n = $('notice'); n.textContent = message; n.style.opacity = '1'; clearTimeout(toast.timer); toast.timer = setTimeout(() => n.style.opacity = '0', 3000); };
const locations = {
  all: { center: [121.2088, 14.4551], zoom: 9.8, pitch: 78, bearing: -8 },
  west: { center: [121.08, 14.37], zoom: 11.1, pitch: 62, bearing: -32 },
  central: { center: [121.25, 14.36], zoom: 11.1, pitch: 62, bearing: -12 },
  east: { center: [121.48, 14.33], zoom: 10.9, pitch: 61, bearing: 28 }
};
const philippinesBounds = [114.27, 4.58, 126.61, 21.13];
const parBounds = [115, 5, 135, 25];
const coverageBounds = [114.27, 4.58, 135, 25];
const closeUpZoom = 10.7;
const landingCamera = { center: [121.25, 14.33], zoom: 9.5, pitch: 75, bearing: locations.all.bearing };
const landingPadding = () => ({ left: Math.min(440, window.innerWidth * 0.42), right: 0, top: 0, bottom: 0 });
function pitchLimit(zoom) {
  const progress = Math.max(0, Math.min(1, (zoom - locations.all.zoom) / (closeUpZoom - locations.all.zoom)));
  return locations.all.pitch - 30 * progress;
}

function wireLandingCamera(map) {
  const explorer = $('explorerUI');
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const canvas = map.getCanvas();
  const tabIndex = canvas.tabIndex;
  canvas.tabIndex = -1;
  let rotationFrame = null;

  function scheduleRotation() {
    if (rotationFrame === null && explorer.hidden && !motion.matches) {
      rotationFrame = requestAnimationFrame(rotate);
    }
  }

  function rotate() {
    rotationFrame = null;
    if (!explorer.hidden || motion.matches) return;
    if (map.isMoving()) {
      map.once('moveend', scheduleRotation);
      return;
    }
    map.once('moveend', scheduleRotation);
    map.rotateTo(map.getBearing() + 90, {
      duration: 15000,
      easing: progress => progress
    });
  }

  function cancelRotation() {
    map.off('moveend', scheduleRotation);
    if (rotationFrame !== null) cancelAnimationFrame(rotationFrame);
    rotationFrame = null;
  }

  scheduleRotation();
  $('enterExplorer').addEventListener('click', () => {
    cancelRotation();
    map.stop();
    map.easeTo({ ...locations.all, padding: { left: 0, right: 0, top: 0, bottom: 0 }, duration: motion.matches ? 0 : 1100 });
    canvas.tabIndex = tabIndex;
  });
  document.addEventListener('landing:ready', () => {
    canvas.tabIndex = -1;
    scheduleRotation();
  });
}

function startWithCollapsedAttribution(map) {
  const control = map.getContainer().querySelector('.maplibregl-ctrl-attrib');
  if (!control) return;
  const compact = 'maplibregl-compact', expanded = 'maplibregl-compact-show';
  function closeCompact() {
    if (!control.classList.contains(compact)) return;
    control.classList.remove(expanded);
    control.open = false;
  }
  closeCompact();
  // MapLibre may switch into compact mode after the first attribution loads or after a resize.
  const observer = new MutationObserver(changes => {
    if (changes.some(change => !change.oldValue?.split(/\s+/).includes(compact))) closeCompact();
  });
  observer.observe(control, { attributes: true, attributeFilter: ['class'], attributeOldValue: true });
  map.once('remove', () => observer.disconnect());
}

function initializeMap() {
  const style = {
    version: 8,
    sources: {
      satellite: {
        type: 'raster',
        tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
        tileSize: 256, maxzoom: 19, bounds: coverageBounds,
        attribution: 'Imagery © <a href="https://www.arcgis.com/home/item.html?id=10df2279f9684e4a9f6a7f08febac2a9">Esri</a>, Vantor, Earthstar Geographics, and the GIS User Community'
      },
      buildings: { type: 'vector', url: 'https://tiles.openfreemap.org/planet', bounds: coverageBounds },
      'philippines-boundary': {
        type: 'geojson', data: './public/data/philippines-mask.geojson', tolerance: .25,
        attribution: 'PAR: <a href="https://www.pagasa.dost.gov.ph/learning-tools/philippine-area-of-responsibility">PAGASA</a> · Land: <a href="https://www.geoboundaries.org/api/current/gbOpen/PHL/ADM0/">geoBoundaries / OCHA / NAMRIA</a> (<a href="https://creativecommons.org/licenses/by/3.0/igo/">CC BY 3.0 IGO</a>), <a href="https://www.naturalearthdata.com/">Natural Earth</a>'
      }
    },
    layers: [
      { id: 'satellite', type: 'raster', source: 'satellite' },
      {
        id: '3d-buildings', type: 'fill-extrusion', source: 'buildings', 'source-layer': 'building',
        minzoom: 15, filter: ['!=', ['get', 'hide_3d'], true],
        paint: {
          'fill-extrusion-color': '#d4d9d4',
          'fill-extrusion-height': ['coalesce', ['get', 'render_height'], 0],
          'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], 0]
        }
      },
      {
        id: 'philippines-mask', type: 'fill', source: 'philippines-boundary',
        filter: ['==', ['get', 'kind'], 'mask'],
        paint: { 'fill-color': '#102b37', 'fill-antialias': false }
      },
      {
        id: 'philippines-outline', type: 'line', source: 'philippines-boundary', maxzoom: 9,
        filter: ['==', ['get', 'kind'], 'country-outline'],
        paint: { 'line-color': '#81caba', 'line-opacity': .65, 'line-width': 1 }
      },
      {
        id: 'par-outline', type: 'line', source: 'philippines-boundary',
        filter: ['==', ['get', 'kind'], 'par-outline'],
        paint: { 'line-color': '#77e4ff', 'line-width': 2, 'line-dasharray': [3, 2] }
      }
    ]
  };
  const map = new maplibregl.Map({
    container: 'map', style, ...landingCamera, maxPitch: 78, minZoom: 3, maxZoom: 19, antialias: true,
    renderWorldCopies: false, maxBounds: [[94, -7], [153, 32]],
    attributionControl: window.matchMedia(mobileLayout).matches ? { compact: true } : true,
    transformCameraUpdate: ({ zoom, pitch }) => {
      const explorer = $('explorerUI');
      const onLanding = explorer.hidden || explorer.classList.contains('explorer-leaving');
      return { pitch: Math.min(pitch, onLanding ? landingCamera.pitch : pitchLimit(zoom)) };
    }
  });
  startWithCollapsedAttribution(map);
  map.setPadding(landingPadding());
  const terrainButton = $('terrain');
  const updateHUD = () => {
    const center = map.getCenter();
    const heading = map.getBearing();
    const bearing = (Math.round(heading) + 360) % 360;
    $('coords').textContent = `${center.lat.toFixed(4)}° N   ${center.lng.toFixed(4)}° E`;
    $('zoom').textContent = map.getZoom().toFixed(1);
    $('pitch').textContent = `${Math.round(map.getPitch())}°`;
    $('bearing').textContent = `${String(bearing).padStart(3, '0')}°`;
    $('compassHead').style.transform = `rotate(${-heading}deg)`;
  };
  const quality = initializeQualityMap(map, { center: [121.25, 14.33], zoom: 10.15 }, coverageBounds);
  $('exploreFocusStation').addEventListener('click', () => {
    const station = $('stationSelect').value;
    if (station) quality.openStation(station, $('monthSelect').value);
  });
  map.on('move', updateHUD);
  map.once('style.load', () => {
    terrainButton.disabled = false;
    setTerrain(true);
  });
  map.on('error', event => console.warn('Map source error:', event.error));
  updateHUD();
  wireLandingCamera(map);
  document.addEventListener('landing:enter', () => {
    quality.setActive(false);
    if (!terrainButton.disabled) setTerrain(true);
    setActiveView(false);
    document.querySelector('[data-view].active')?.classList.remove('active');
    document.querySelector('[data-view="all"]').classList.add('active');
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    map.easeTo({ ...landingCamera, padding: landingPadding(), duration: reduceMotion ? 0 : 1100 });
  });

  function setActiveView(topDown) {
    $('view2d').classList.toggle('active', topDown);
    $('view3d').classList.toggle('active', !topDown);
  }
  for (const button of document.querySelectorAll('[data-view]')) {
    button.addEventListener('click', () => {
      quality.setActive(false);
      document.querySelector('[data-view].active')?.classList.remove('active');
      button.classList.add('active');
      if (button.dataset.view === 'philippines' || button.dataset.view === 'par') {
        const [west, south, east, north] = button.dataset.view === 'par' ? parBounds : philippinesBounds;
        map.fitBounds([[west, south], [east, north]],
          { bearing: 0, pitch: 0, padding: { top: 90, bottom: 48, left: 32, right: 32 } });
        setActiveView(true);
        return;
      }
      map.flyTo({ ...locations[button.dataset.view], speed: .75, curve: 1.2 });
      setActiveView(false);
    });
  }
  $('reset').addEventListener('click', () => document.querySelector('[data-view="all"]').click());
  $('view2d').addEventListener('click', () => {
    map.easeTo({ pitch: 0, bearing: 0, duration: 800 });
    setActiveView(true);
  });
  $('view3d').addEventListener('click', () => {
    map.easeTo({ pitch: 58, duration: 800 });
    setActiveView(false);
  });

  function setTerrain(enable, tiltCamera = false) {
    try {
      if (enable === Boolean(map.getTerrain())) return;
      if (!enable) {
        map.setTerrain(null);
      } else {
        if (!map.getSource('terrain')) {
          map.addSource('terrain', {
            type: 'raster-dem',
            tiles: ['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'],
            tileSize: 256, maxzoom: 14, encoding: 'terrarium', bounds: coverageBounds,
            attribution: 'Elevation © AWS Terrain Tiles / Mapzen'
          });
        }
        map.setTerrain({ source: 'terrain', exaggeration: 1.35 });
        if (tiltCamera && map.getPitch() < 35) $('view3d').click();
      }
    } catch (error) {
      console.warn(error);
      toast('Could not change 3D terrain.');
    }
    const enabled = Boolean(map.getTerrain());
    terrainButton.classList.toggle('enabled', enabled);
    terrainButton.setAttribute('aria-pressed', String(enabled));
    terrainButton.querySelector('span').textContent = enabled ? '3D Terrain: On' : '3D Terrain: Off';
  }

  terrainButton.addEventListener('click', () => setTerrain(!map.getTerrain(), true));

  // Use the app's movement shortcuts in place of MapLibre's keyboard handler.
  map.keyboard.disable();
  const keys = new Set();
  const controlKeys = new Set(['w', 'a', 's', 'd', 'q', 'e', 'r', 'f', '+', '-', '=', '_', 'shift', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright']);
  window.addEventListener('keydown', event => {
    if ($('explorerUI').hidden || $('explorerUI').inert) return;
    if (event.ctrlKey || event.metaKey || event.altKey || event.target.closest?.('input,select,textarea,dialog,#explorerPanel')) return;
    const key = event.key.toLowerCase();
    if (!controlKeys.has(key)) return;
    if (key !== 'shift') event.preventDefault();
    keys.add(key);
  });
  window.addEventListener('keyup', event => keys.delete(event.key.toLowerCase()));
  window.addEventListener('blur', () => keys.clear());
  let previous = performance.now();
  function tick(now) {
    const dt = Math.min((now - previous) / 1000, .05);
    previous = now;
    if (keys.size && !map.isMoving()) {
      const forward = Number(keys.has('w') || keys.has('arrowup')) - Number(keys.has('s') || keys.has('arrowdown'));
      const strafe = Number(keys.has('d') || keys.has('arrowright')) - Number(keys.has('a') || keys.has('arrowleft'));
      const turn = quality.active ? 0 : Number(keys.has('e')) - Number(keys.has('q'));
      const tilt = quality.active ? 0 : Number(keys.has('r')) - Number(keys.has('f'));
      const zoom = Number(keys.has('+') || keys.has('=')) - Number(keys.has('-') || keys.has('_'));
      if (forward || strafe || turn || tilt || zoom) {
        const center = map.getCenter();
        const bearing = map.getBearing();
        const angle = bearing * Math.PI / 180;
        const speed = (keys.has('shift') ? 3 : 1) * dt * .12 * Math.pow(2, 11 - map.getZoom());
        const east = (Math.sin(angle) * forward + Math.cos(angle) * strafe) * speed;
        const north = (Math.cos(angle) * forward - Math.sin(angle) * strafe) * speed;
        const nextZoom = Math.min(map.getMaxZoom(), Math.max(map.getMinZoom(), map.getZoom() + zoom * 1.3 * dt));
        map.jumpTo({
          center: [center.lng + east / Math.max(.25, Math.cos(center.lat * Math.PI / 180)),
          Math.max(-85, Math.min(85, center.lat + north))],
          bearing: bearing + turn * 65 * dt, pitch: Math.min(pitchLimit(nextZoom), Math.max(0, map.getPitch() + tilt * 42 * dt)),
          zoom: nextZoom
        });
      }
    }
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

$('help').addEventListener('click', () => $('helpDialog').showModal());
$('closeHelp').addEventListener('click', () => $('helpDialog').close());
$('panelToggle').addEventListener('click', () => {
  const open = $('panelToggle').getAttribute('aria-expanded') !== 'true';
  setMobilePanel(open);
  if (open) $('explorerPanel').querySelector('.console-menu [aria-pressed="true"]')?.focus({ preventScroll: true });
});
$('explorerPanel').addEventListener('keydown', event => {
  if (event.key !== 'Escape' || !window.matchMedia(mobileLayout).matches ||
      $('panelToggle').getAttribute('aria-expanded') !== 'true') return;
  setMobilePanel(false);
  $('panelToggle').focus({ preventScroll: true });
});
function waitForPageTransition(landing, explorer) {
  const animations = [...landing.getAnimations(), ...explorer.getAnimations({ subtree: true })
    .filter(animation => /^explorer-(enter|exit)$/.test(animation.animationName))];
  return Promise.allSettled(animations.map(animation => animation.finished));
}

$('enterExplorer').addEventListener('click', async () => {
  const landing = $('landingScreen'), explorer = $('explorerUI');
  $('enterExplorer').disabled = true;
  explorer.inert = true;
  explorer.classList.add('explorer-entering');
  explorer.hidden = false;
  landing.classList.add('landing-leaving');
  await waitForPageTransition(landing, explorer);
  landing.hidden = true;
  landing.classList.remove('landing-leaving');
  explorer.classList.remove('explorer-entering');
  explorer.inert = false;
  document.body.classList.remove('landing-active');
  $('help').focus({ preventScroll: true });
  document.dispatchEvent(new Event('explorer:ready'));
});
document.querySelector('.home-link').addEventListener('click', async event => {
  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  event.preventDefault();
  const landing = $('landingScreen'), explorer = $('explorerUI');
  if (explorer.inert || explorer.hidden) return;
  explorer.inert = true;
  explorer.classList.add('explorer-leaving');
  document.body.classList.add('landing-active');
  landing.classList.add('landing-returning');
  landing.hidden = false;
  document.dispatchEvent(new Event('landing:enter'));
  await waitForPageTransition(landing, explorer);
  explorer.hidden = true;
  setMobilePanel(false);
  explorer.classList.remove('explorer-leaving');
  landing.classList.remove('landing-returning');
  const button = $('enterExplorer');
  button.disabled = false;
  button.focus({ preventScroll: true });
  document.dispatchEvent(new Event('landing:ready'));
});
try {
  initializeMap();
} catch (error) {
  console.error(error);
  toast('The 3D map could not start. Check your connection and WebGL support.');
}

$('research').addEventListener('click', () => $('researchDialog').showModal());
$('closeResearch').addEventListener('click', () => $('researchDialog').close());

async function initializeData() {
  const root = $('readings');
  try {
    const dataset = await loadResearch();
    const { stations, months, monthly, parameters } = dataset;
    const station = $('stationSelect'), month = $('monthSelect');
    $('stationCount').textContent = stations.size;
    $('parameterCount').textContent = parameters.length;
    function updateStationOptions() {
      const selected = station.value;
      const currentNames = new Map(monthly.filter(record => record.period === month.value)
        .map(record => [record.station_id, record.station_name]));
      const available = Array.from(currentNames.keys()).filter(id => Object.hasOwn(historicalStationLocations, id));
      station.replaceChildren(...Array.from(stations, ([id, record]) => {
        const name = currentNames.get(id);
        const hasLocation = Object.hasOwn(historicalStationLocations, id);
        const reason = !hasLocation ? ' (location unavailable)' : !name ? ' (no readings)' : '';
        const option = new Option(id + ' · ' + (name || record.station_name) + reason, id);
        option.disabled = !hasLocation || !name;
        return option;
      }));
      station.value = available.includes(selected) ? selected : (available[0] ?? '');
    }
    function updateReadings() {
      const readings = monthly.filter(record => record.station_id === station.value && record.period === month.value);
      root.replaceChildren();
      if (!readings.length) {
        root.textContent = 'No mapped stations have readings for this month.';
        return;
      }
      for (const record of readings) {
        const item = researchElement('div');
        item.className = 'reading';
        item.append(researchElement('small', researchLabels[record.parameter]),
          researchElement('b', record.reported_value + ' ' + record.unit),
          researchElement('small', validationLabels[record.validation_status]), readingSource(record));
        root.append(item);
      }
    }
    for (const period of months) month.add(new Option(researchMonth(period), period));
    station.addEventListener('change', updateReadings);
    month.addEventListener('change', () => { updateStationOptions(); updateReadings(); });
    updateStationOptions();
    updateReadings();
    renderResearchArchive(dataset);
  } catch (error) {
    console.error(error);
    const message = location.protocol === 'file:'
      ? 'Open this app through a local HTTP server to load the research data.'
      : 'The bundled research files could not load.';
    root.textContent = message;
    $('researchContents').textContent = message;
  }
}
initializeData();
