// Appendix A of the historical station study linked in the panel. GeoJSON uses longitude first.
const historicalStationLocations={
 I:['Central West Bay',121.181,14.420],
 II:['East Bay',121.334,14.226],
 IV:['Central Bay',121.280,14.386],
 V:['Northern West Bay',121.139,14.488],
 VIII:['South Bay',121.230,14.196],
 XV:['San Pedro (West Bay)',121.090,14.386],
 XVI:['Sta Rosa (West Bay)',121.145,14.325],
 XVII:['Fish Sanctuary (Central Bay)',121.280,14.272],
 XVIII:['Pagsanjan (East Bay)',121.425,14.369]
};
const qualityColors=['#2563eb','#34d399','#fbbf24','#ef4444'];

function initializeQualityMap(map,overview,coverageBounds){
 const mode=$('qualityMode'),panel=$('qualityPanel');
 const parameter=$('qualityParameter'),month=$('qualityMonth'),layer=$('qualityLayer');
 const stationSelect=$('qualityStation'),focusButton=$('focusStation');
 const status=$('qualityStatus'),legend=$('qualityLegend');
 const state={active:false,openStation};
 const popup=new maplibregl.Popup({maxWidth:'250px'});
 let records,loadFailed=false,previousView,previousTerrain,mappedFeatures=[];
 const empty={type:'FeatureCollection',features:[]};
 const normalize=name=>name.toLowerCase().replaceAll('.','');

 function coordinates(record){
  const location=historicalStationLocations[record.station_id];
  return location&&normalize(location[0])===normalize(record.station_name)?location.slice(1):null;
 }
 function numericValue(record){
  return record.numeric_value==null||String(record.numeric_value).trim()===''?NaN:Number(record.numeric_value);
 }
 function render(){
  if(!state.active||!records)return;
  popup.remove();
  const all=records.filter(record=>record.parameter===parameter.value);
  const selected=all.filter(record=>record.period===month.value);
  const list=$('qualityReadingList');
  list.replaceChildren();
  for(const record of selected){
   const row=researchElement('li',`${record.station_id} · ${record.station_name} · ${record.reported_value} ${record.unit}`);
   row.append(researchElement('small',`${validationLabels[record.validation_status]} · ${coordinates(record)?'Mapped':'Location unavailable'}`),readingSource(record));
   list.append(row);
  }
  $('qualityReadingDetails').hidden=!selected.length;
  $('qualityReadingSummary').textContent=`Reported readings (${selected.length})`;
  const values=all.filter(record=>coordinates(record)).map(numericValue).filter(Number.isFinite);
  const min=Math.min(...values),max=Math.max(...values);
  const features=selected.flatMap(record=>{
   const point=coordinates(record);
   if(!point)return [];
   const value=numericValue(record);
   const numeric=Number.isFinite(value);
   const relative=numeric?(min===max?.5:(value-min)/(max-min)):0;
   return [{
    type:'Feature',geometry:{type:'Point',coordinates:point},
    properties:{
     station:`${record.station_id} · ${record.station_name}`,
     stationId:record.station_id,
     reading:`${record.reported_value} ${record.unit}`,
     validation:validationLabels[record.validation_status],
     url:record.source_url,page:record.source_pdf_page,numeric,relative
    }
   }];
  });
  mappedFeatures=features;
  focusButton.disabled=!historicalStationLocations[stationSelect.value];
  const heat=layer.value==='heat';
  const numericCount=features.filter(feature=>feature.properties.numeric).length;
  const showHeat=heat&&numericCount>=3;
  map.getSource('quality-readings').setData({type:'FeatureCollection',features});
  map.setLayoutProperty('quality-heat','visibility',showHeat?'visible':'none');
  status.textContent=selected.length
   ?`${features.length} of ${selected.length} readings mapped with historical station coordinates.`
   :'No station readings for this parameter and month.';
  if(heat&&selected.length&&!showHeat)status.textContent+=' At least three mapped numeric readings are needed for the heatmap.';
  legend.replaceChildren();
  if(!features.length)return;
  if(values.length){
   const gradient=document.createElement('div');
   gradient.className='quality-gradient';
   const units=selected[0].unit;
   const range=document.createElement('p');
   range.textContent=`Station colors: ${min}–${max} ${units} across mapped months`;
   legend.append(gradient,range);
  }
  if(features.some(feature=>!feature.properties.numeric)){
   const note=document.createElement('p');
   note.textContent='Gray points show readings reported with a qualifier.';
   legend.append(note);
  }
  if(showHeat){
   const note=document.createElement('p');
   note.textContent='The glow combines nearby station values. Its color shows relative intensity and can extend beyond the shoreline.';
   legend.append(note);
  }
 }

 map.on('style.load',()=>{
  map.addSource('quality-basemap',{
   type:'raster',tiles:['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],tileSize:256,maxzoom:19,bounds:coverageBounds,
   attribution:'© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>'
  });
  map.addLayer({id:'quality-basemap',type:'raster',source:'quality-basemap',layout:{visibility:'none'}},'philippines-mask');
  map.addSource('quality-readings',{type:'geojson',data:empty});
  map.addLayer({
   id:'quality-heat',type:'heatmap',source:'quality-readings',layout:{visibility:'none'},
   filter:['==',['get','numeric'],true],
   paint:{
    'heatmap-weight':['interpolate',['linear'],['get','relative'],0,.15,1,1],
    'heatmap-radius':['interpolate',['exponential',2],['zoom'],9,18,13,120],
    'heatmap-opacity':.72,
    'heatmap-color':['interpolate',['linear'],['heatmap-density'],0,'rgba(37,99,235,0)',
     .15,qualityColors[0],.4,qualityColors[1],.7,qualityColors[2],1,qualityColors[3]]
   }
  });
  map.addLayer({
   id:'quality-stations',type:'circle',source:'quality-readings',layout:{visibility:'none'},
   paint:{
    'circle-radius':8,'circle-stroke-width':2,'circle-stroke-color':'#fff',
    'circle-color':['case',['get','numeric'],
     ['interpolate',['linear'],['get','relative'],0,qualityColors[0],.33,qualityColors[1],.67,qualityColors[2],1,qualityColors[3]],'#64748b']
   }
  });
  mode.disabled=false;
  $('exploreFocusStation').disabled=false;
 });
 function showStation({properties,geometry}){
  const content=document.createElement('div');
  content.className='quality-popup';
  const name=document.createElement('strong');
  name.textContent=properties.station;
  const reading=document.createElement('p');
  reading.textContent=`${properties.reading} · ${month.value}`;
  const validation=document.createElement('p');
  validation.textContent=properties.validation;
  const source=document.createElement('a');
  source.href=`${properties.url}#page=${properties.page}`;
  source.target='_blank';
  source.rel='noopener';
  source.textContent=`LLDA report · page ${properties.page}`;
  content.append(name,reading,validation,source);
  popup.setLngLat(geometry.coordinates).setDOMContent(content).addTo(map);
 }
 map.on('click','quality-stations',event=>{
  const feature=event.features[0];
  stationSelect.value=feature.properties.stationId;
  focusButton.disabled=false;
  showStation(feature);
 });
 map.on('mouseenter','quality-stations',()=>{map.getCanvas().style.cursor='pointer';});
 map.on('mouseleave','quality-stations',()=>{map.getCanvas().style.cursor='';});

 for(const input of [parameter,month,layer])input.addEventListener('change',render);
 stationSelect.addEventListener('change',()=>{
  focusButton.disabled=!historicalStationLocations[stationSelect.value];
 });
 focusButton.addEventListener('click',focusStation);

 async function openStation(id,period){
  if(!state.active)mode.click();
  await dataReady;
  if(!state.active||!records)return;
  if(period&&month.value!==period){
   month.value=period;
   render();
  }
  stationSelect.value=id;
  focusButton.disabled=!Object.hasOwn(historicalStationLocations,id);
  if(focusButton.disabled){
   status.textContent='The selected station has no published coordinates in this map.';
   return;
  }
  focusStation();
 }

 function focusStation(){
  const location=historicalStationLocations[stationSelect.value];
  if(!location)return;
  const center=location.slice(1);
  const sidebar=panel.parentElement.getBoundingClientRect();
  const bottomSheet=window.matchMedia(mobileLayout).matches&&
   !window.matchMedia('(orientation:landscape) and (max-height:520px)').matches;
  map.flyTo({
   center,zoom:Math.max(12,map.getZoom()),speed:.9,
   offset:bottomSheet?[0,-sidebar.height/2]:[sidebar.width/2,0]
  });
  const feature=mappedFeatures.find(item=>item.properties.stationId===stationSelect.value);
  if(feature){
   showStation(feature);
  }else{
   const content=document.createElement('div');
   content.className='quality-popup';
   content.textContent=`${location[0]} · No reading for this parameter and month.`;
   popup.setLngLat(center).setDOMContent(content).addTo(map);
  }
 }
 mode.addEventListener('click',()=>{
  state.active=!state.active;
  const active=state.active;
  mode.setAttribute('aria-pressed',String(active));
  mode.textContent=active?'Back to Explore':'Water Quality';
  panel.hidden=!active;
  document.body.classList.toggle('quality-active',active);
  setMobilePanel(active);
  for(const id of ['quality-basemap','quality-stations'])map.setLayoutProperty(id,'visibility',active?'visible':'none');
  for(const id of ['satellite','3d-buildings'])map.setLayoutProperty(id,'visibility',active?'none':'visible');
  if(active){
   previousView={center:map.getCenter(),zoom:map.getZoom(),pitch:map.getPitch(),bearing:map.getBearing()};
   previousTerrain=map.getTerrain();
   if(previousTerrain)map.setTerrain(null);
   map.setMaxPitch(0);
   map.dragRotate.disable();
   map.touchZoomRotate.disableRotation();
   map.jumpTo({...overview,pitch:0,bearing:0});
   if(loadFailed)status.textContent='Historical readings could not load.';
   render();
  }else{
   popup.remove();
   map.setLayoutProperty('quality-heat','visibility','none');
   map.setMaxPitch(78);
   map.dragRotate.enable();
   map.touchZoomRotate.enableRotation();
   if(previousTerrain)map.setTerrain(previousTerrain);
   map.jumpTo(previousView);
  }
 });

 const dataReady=loadResearch().then(({monthly,months,stations,parameters})=>{
  records=monthly;
  for(const {parameter:key,unit} of parameters){
   parameter.add(new Option(`${researchLabels[key]} (${unit})`,key));
  }
  for(const period of months)month.add(new Option(researchMonth(period),period));
  for(const [id,record] of stations){
   const hasLocation=Boolean(coordinates(record));
   const option=new Option(`${id} · ${record.station_name}${hasLocation?'':' (location unavailable)'}`,id);
   option.disabled=!hasLocation;
   stationSelect.add(option);
  }
  render();
 }).catch(error=>{
  loadFailed=true;
  console.warn(error);
  status.textContent='Historical readings could not load.';
 });
 return state;
}
