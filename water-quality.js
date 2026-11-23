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

const classCGuidelines={
 BOD:{unit:'mg/L',min:0,max:7,label:'≤ 7 mg/L'},
 DO:{unit:'mg/L',min:5,max:Infinity,label:'≥ 5 mg/L'},
 pH:{unit:'pH units',min:6.5,max:9,label:'6.5–9.0'}
};
const guidelineStatuses={
 within:{label:'Within guideline',color:'#047857'},
 outside:{label:'Outside guideline',color:'#b91c1c'},
 unknown:{label:'Not assessed',color:'#64748b'}
};
const classCGuidelineSource='https://r9.emb.gov.ph/wp-content/uploads/2025/08/ANNUAL-REGIONAL-WATER-QUALITY-STATUS-REPORT-2023.pdf';

function guidelineStatus(record){
 const guideline=classCGuidelines[record.parameter];
 if(!guideline||record.unit!==guideline.unit||record.qualifier!=='exact_as_printed')return 'unknown';
 const value=numericValue(record);
 if(!Number.isFinite(value)||value<0)return 'unknown';
 return value>=guideline.min&&value<=guideline.max?'within':'outside';
}

function numericValue(record){
 return record.numeric_value==null||String(record.numeric_value).trim()===''?NaN:Number(record.numeric_value);
}

function drawQualityHistory(canvas,entries,first,last){
 const context=canvas.getContext('2d');
 if(!context)return false;
 const monthIndex=period=>Number(period.slice(0,4))*12+Number(period.slice(5));
 const start=monthIndex(first),end=monthIndex(last);
 const values=entries.map(({value})=>value);
 const min=Math.min(...values),max=Math.max(...values);
 const padding=min===max?Math.abs(min)*.1||1:(max-min)*.1;
 const low=min-padding,high=max+padding;
 const left=88,right=canvas.width-22,top=20,bottom=canvas.height-48;
 const x=period=>start===end?(left+right)/2:left+(monthIndex(period)-start)/(end-start)*(right-left);
 const y=value=>bottom-(value-low)/(high-low)*(bottom-top);
 const number=new Intl.NumberFormat('en',{maximumSignificantDigits:4});

 context.clearRect(0,0,canvas.width,canvas.height);
 context.font='20px system-ui';
 context.textAlign='right';
 context.textBaseline='middle';
 context.fillStyle='#cbd5e1';
 context.strokeStyle='#334155';
 for(const fraction of [0,.5,1]){
  const value=low+(high-low)*fraction;
  context.fillText(number.format(value),left-9,y(value));
  context.beginPath();
  context.moveTo(left,y(value));
  context.lineTo(right,y(value));
  context.stroke();
 }
 context.textAlign='left';
 context.fillText(researchMonth(first),left,bottom+27);
 if(first!==last){
  context.textAlign='right';
  context.fillText(researchMonth(last),right,bottom+27);
 }

 context.strokeStyle='#67e8f9';
 context.fillStyle='#67e8f9';
 context.lineWidth=3;
 let previous;
 for(const {period,value} of entries){
  const point={x:x(period),y:y(value),month:monthIndex(period)};
  if(previous&&point.month===previous.month+1){
   context.beginPath();
   context.moveTo(previous.x,previous.y);
   context.lineTo(point.x,point.y);
   context.stroke();
  }
  context.beginPath();
  context.arc(point.x,point.y,5,0,2*Math.PI);
  context.fill();
  previous=point;
 }
 return true;
}

function initializeQualityMap(map,overview,coverageBounds){
 const panel=$('qualityPanel');
 const parameter=$('qualityParameter'),month=$('qualityMonth'),layer=$('qualityLayer');
 const stationSelect=$('qualityStation'),focusButton=$('focusStation');
 const status=$('qualityStatus'),legend=$('qualityLegend');
 const state={active:false,openStation,setActive};
 const exploreButton=$('consoleExplore'),qualityButton=$('consoleWaterQuality'),historyButton=$('consoleHistory');
 const historyPanel=$('historyPanel'),explorationTools=$('explorationTools');
 const historyParameter=$('historyParameter'),historyStation=$('historyStation');
 let historyOpen=false;

 function showConsoleSection(showHistory=false){
  historyOpen=showHistory;
  explorationTools.hidden=historyOpen||state.active;
  panel.hidden=historyOpen||!state.active;
  historyPanel.hidden=!historyOpen;
  if(map.getLayer('history-stations')){
   map.setLayoutProperty('history-stations','visibility',historyOpen?'visible':'none');
   map.setLayoutProperty('quality-stations','visibility',state.active&&!historyOpen?'visible':'none');
   if(historyOpen){
    popup.remove();
    map.setLayoutProperty('quality-heat','visibility','none');
   }
  }
  const active=historyOpen?historyButton:state.active?qualityButton:exploreButton;
  for(const button of [exploreButton,qualityButton,historyButton]){
   button.classList.toggle('active',button===active);
   button.setAttribute('aria-pressed',String(button===active));
  }
 }

 function openHistory(stationId){
  setActive(true);
  if(stationId)historyStation.value=stationId;
  showConsoleSection(true);
  setMobilePanel(true);
  renderHistory();
 }

 exploreButton.addEventListener('click',()=>{
  setActive(false);
  showConsoleSection();
  setMobilePanel(true);
 });
 qualityButton.addEventListener('click',()=>{
  setActive(true);
  showConsoleSection();
  render();
  setMobilePanel(true);
 });
 historyButton.addEventListener('click',()=>openHistory(historyStation.value||stationSelect.value));
 historyParameter.addEventListener('change',renderHistory);
 historyStation.addEventListener('change',()=>{
  renderHistory();
  const location=historicalStationLocations[historyStation.value];
  if(location)flyToStation(location.slice(1));
 });
 document.addEventListener('landing:enter',()=>showConsoleSection());
 const popup=new maplibregl.Popup({className:'station-map-popup',maxWidth:'min(340px, calc(100vw - 24px))'});
 let records,loadFailed=false,previousView,previousTerrain,availableParameters=[];
 const empty={type:'FeatureCollection',features:[]};
 const normalize=name=>name.toLowerCase().replaceAll('.','');

 function coordinates(record){
  const location=historicalStationLocations[record.station_id];
  return location&&normalize(location[0])===normalize(record.station_name)?location.slice(1):null;
 }
 function renderHistory(){
  if(!historyOpen)return;
  map.setPaintProperty('history-stations','circle-color',[
   'case',['==',['get','stationId'],historyStation.value],'#fbbf24','#0e7490'
  ]);
  if(!records)return;
  const canvas=$('qualityHistoryChart'),message=$('qualityHistoryStatus');
  const details=$('qualityHistoryDetails'),list=$('qualityHistoryList');
  const history=records.filter(record=>record.station_id===historyStation.value&&record.parameter===historyParameter.value)
   .sort((a,b)=>a.period.localeCompare(b.period));
  list.replaceChildren();
  canvas.hidden=true;
  details.hidden=!history.length;
  if(!history.length){
   message.textContent=historyStation.value
    ?'No historical readings for this station and parameter.'
    :'Choose a monitoring station to see its history.';
   return;
  }

  for(const record of history){
   const entry=researchElement('li',`${researchMonth(record.period)} · ${record.reported_value} ${record.unit}`);
   entry.append(researchElement('small',validationLabels[record.validation_status]),readingSource(record));
   list.append(entry);
  }
  const points=history.filter(record=>record.qualifier==='exact_as_printed')
   .map(record=>({period:record.period,value:numericValue(record)}))
   .filter(point=>Number.isFinite(point.value));
  const first=history[0].period,last=history.at(-1).period;
  const {station_name,unit}=history[0];
  if(!points.length){
   message.textContent=`${station_name} · No exact numeric readings to plot. See historical readings below.`;
   return;
  }
  canvas.hidden=!drawQualityHistory(canvas,points,first,last);
  message.textContent=`${station_name} · ${researchLabels[historyParameter.value]} (${unit}) · ${points.length} of ${history.length} readings plotted. Lines connect consecutive months.`;
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
   const assessment=guidelineStatuses[guidelineStatus(record)];
   row.append(researchElement('small',assessment.label));
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
   const assessment=guidelineStatuses[guidelineStatus(record)];
   const relative=numeric?(min===max?.5:(value-min)/(max-min)):0;
   return [{
    type:'Feature',geometry:{type:'Point',coordinates:point},
    properties:{
     stationId:record.station_id,
     assessmentColor:assessment.color,numeric,relative
    }
   }];
  });
  focusButton.disabled=!historicalStationLocations[stationSelect.value];
  const heat=layer.value==='heat';
  const numericCount=features.filter(feature=>feature.properties.numeric).length;
  const showHeat=heat&&numericCount>=3;
  map.getSource('quality-readings').setData({type:'FeatureCollection',features});
  map.setLayoutProperty('quality-heat','visibility',showHeat&&!historyOpen?'visible':'none');
  status.textContent=selected.length
   ?`${features.length} of ${selected.length} readings mapped with historical station coordinates.`
   :'No station readings for this parameter and month.';
  if(heat&&selected.length&&!showHeat)status.textContent+=' At least three mapped numeric readings are needed for the heatmap.';
  legend.replaceChildren();
  const guideline=classCGuidelines[parameter.value];
  const source=researchLink(classCGuidelineSource,'DENR Class C guideline');
  if(guideline){
   legend.append(researchElement('p',`Class C benchmark · ${guideline.label}`));
  }else{
   const nutrient=['nitrate','phosphate'].includes(parameter.value);
   legend.append(researchElement('p',nutrient
    ?'Comparison unavailable until the nutrient reporting basis is verified.'
    :'No Class C comparison is configured for this parameter.'));
  }
  if(features.length){
   const key=researchElement('ul');
   key.className='quality-guideline-key';
   for(const {label,color} of Object.values(guidelineStatuses)){
    const entry=researchElement('li',label);
    const swatch=researchElement('span');
    swatch.setAttribute('aria-hidden','true');
    swatch.style.backgroundColor=color;
    entry.prepend(swatch);
    key.append(entry);
   }
   legend.append(key);
  }
  if(guideline)legend.append(source);
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
    'circle-color':['get','assessmentColor']
   }
  });
  map.addSource('history-locations',{
   type:'geojson',
   data:{type:'FeatureCollection',features:Object.entries(historicalStationLocations).map(([stationId,location])=>({
    type:'Feature',
    geometry:{type:'Point',coordinates:location.slice(1)},
    properties:{stationId}
   }))}
  });
  map.addLayer({
   id:'history-stations',type:'circle',source:'history-locations',layout:{visibility:'none'},
   paint:{'circle-radius':8,'circle-stroke-width':2,'circle-stroke-color':'#fff','circle-color':'#0e7490'}
  });
  qualityButton.disabled=false;
  historyButton.disabled=false;
  $('exploreFocusStation').disabled=false;
 });
 function showStation(id,center){
  const content=researchElement('div');
  content.className='quality-popup';
  const readings=records.filter(record=>record.station_id===id&&record.period===month.value);
  const name=readings[0]?.station_name??historicalStationLocations[id][0];
  const header=researchElement('header');
  header.className='quality-popup-header';
  header.append(researchElement('h3',name),
   researchElement('p','Station '+id+' / '+researchMonth(month.value)));
  const list=researchElement('ul');
  list.className='quality-popup-readings';
  list.tabIndex=0;
  list.setAttribute('aria-label','Monthly parameter readings');

  for(const {parameter:key} of availableParameters){
   const matching=readings.filter(record=>record.parameter===key);
   const item=researchElement('li');
   item.className='quality-popup-reading';
   const title=researchElement('h4',researchLabels[key]);
   item.append(title);
   if(!matching.length){
    const empty=researchElement('span','No reported reading');
    empty.className='quality-popup-empty';
    item.append(empty);
   }
   for(const record of matching){
    const assessment=guidelineStatus(record);
    const reading=researchElement('div');
    reading.className='quality-popup-value';
    reading.append(researchElement('strong',record.reported_value),researchElement('span',record.unit));
    const badge=researchElement('span',guidelineStatuses[assessment].label);
    badge.className='quality-popup-status '+assessment;
    const details=researchElement('div');
    details.className='quality-popup-details';
    details.append(badge,researchElement('small',validationLabels[record.validation_status]),readingSource(record));
    item.append(reading,details);
   }
   list.append(item);
  }
  content.append(header);
  content.append(list);
  popup.setLngLat(center).setDOMContent(content).addTo(map);
 }
 map.on('click','quality-stations',event=>{
  const feature=event.features[0];
  stationSelect.value=feature.properties.stationId;
  focusButton.disabled=false;
  showStation(stationSelect.value,feature.geometry.coordinates);
 });
 map.on('click','history-stations',event=>{
  if(!historyOpen||!records)return;
  historyStation.value=event.features[0].properties.stationId;
  renderHistory();
 });
 for(const layerId of ['quality-stations','history-stations']){
  map.on('mouseenter',layerId,()=>{map.getCanvas().style.cursor='pointer';});
  map.on('mouseleave',layerId,()=>{map.getCanvas().style.cursor='';});
 }

 for(const input of [parameter,month,layer])input.addEventListener('change',render);
 stationSelect.addEventListener('change',render);
 focusButton.addEventListener('click',focusStation);

 async function openStation(id,period){
  setActive(true);
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
  flyToStation(center);
  showStation(stationSelect.value,center);
 }
 function flyToStation(center){
  const sidebar=panel.parentElement.getBoundingClientRect();
  const bottomSheet=window.matchMedia(mobileLayout).matches&&
   !window.matchMedia('(orientation:landscape) and (max-height:520px)').matches;
  map.flyTo({
   center,zoom:Math.max(12,map.getZoom()),speed:.9,
   offset:bottomSheet?[0,-sidebar.height/2]:[sidebar.width/2,0]
  });
 }
 function setActive(active){
  if(active===state.active||qualityButton.disabled)return;
  state.active=active;
  showConsoleSection();
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
 }

 const dataReady=loadResearch().then(({monthly,months,stations,parameters})=>{
  records=monthly;
  availableParameters=parameters;
  for(const {parameter:key,unit} of parameters){
   parameter.add(new Option(`${researchLabels[key]} (${unit})`,key));
   historyParameter.add(new Option(`${researchLabels[key]} (${unit})`,key));
  }
  for(const period of months)month.add(new Option(researchMonth(period),period));
  for(const [id,record] of stations){
   const hasLocation=Boolean(coordinates(record));
   const option=new Option(`${id} · ${record.station_name}${hasLocation?'':' (location unavailable)'}`,id);
   stationSelect.add(option);
   historyStation.add(new Option(`${id} · ${record.station_name}`,id));
  }
  render();
  renderHistory();
 }).catch(error=>{
  loadFailed=true;
  console.warn(error);
  status.textContent='Historical readings could not load.';
  $('qualityHistoryStatus').textContent=status.textContent;
 });
 return state;
}
