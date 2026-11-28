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

function stationMarkerIcon(map,stationId,color){
 const id=`station-marker-${stationId}-${color.slice(1)}`;
 if(map.hasImage(id))return id;
 const size=36,pixelRatio=2;
 const icon=document.createElement('canvas');
 icon.width=icon.height=size*pixelRatio;
 const context=icon.getContext('2d');
 context.scale(pixelRatio,pixelRatio);
 const center=size/2;
 context.beginPath();
 context.arc(center,center,center-2,0,2*Math.PI);
 context.fillStyle=color;
 context.fill();
 context.strokeStyle='#fff';
 context.lineWidth=2;
 context.stroke();
 context.fillStyle='#fff';
 context.font='bold 12px system-ui, sans-serif';
 context.textAlign='center';
 context.textBaseline='middle';
 context.fillText(stationLabel(stationId).replace('River ','R'),center,center,size-8);
 map.addImage(id,context.getImageData(0,0,icon.width,icon.height),{pixelRatio});
 return id;
}

function exploreStationIcon(map,stationId){
 if(stationNetwork(stationId)==='river')return stationMarkerIcon(map,stationId,'#7c3aed');
 const id=`explore-cell-tower-${stationId}`;
 if(map.hasImage(id))return id;
 const width=44,height=46,pixelRatio=2;
 const icon=document.createElement('canvas');
 icon.width=width*pixelRatio;
 icon.height=height*pixelRatio;
 const context=icon.getContext('2d');
 context.scale(pixelRatio,pixelRatio);
 const center=width/2;
 context.lineWidth=2;
 context.lineCap='round';
 context.lineJoin='round';
 context.strokeStyle='#e0faff';
 context.beginPath();
 context.moveTo(center-7,22);
 context.lineTo(center,8);
 context.lineTo(center+7,22);
 context.closePath();
 context.fillStyle='#0e7490';
 context.fill();
 context.moveTo(center-4,17);
 context.lineTo(center+4,17);
 for(const radius of [7,11]){
  context.moveTo(center+radius*Math.cos(-Math.PI/4),8+radius*Math.sin(-Math.PI/4));
  context.arc(center,8,radius,-Math.PI/4,Math.PI/4);
  context.moveTo(center+radius*Math.cos(3*Math.PI/4),8+radius*Math.sin(3*Math.PI/4));
  context.arc(center,8,radius,3*Math.PI/4,5*Math.PI/4);
 }
 context.stroke();
 context.beginPath();
 context.roundRect(3,25,width-6,18,6);
 context.fillStyle='#0b2530';
 context.fill();
 context.fillStyle='#fff';
 context.font='bold 12px system-ui, sans-serif';
 context.textAlign='center';
 context.textBaseline='middle';
 context.fillText(stationId,width/2,34,width-10);
 map.addImage(id,context.getImageData(0,0,icon.width,icon.height),{pixelRatio});
 return id;
}

function drawQualityHistory(canvas,series,first,last,guideline,reveal){
 const width=canvas.clientWidth,height=canvas.clientHeight;
 if(!width||!height)return;
 const context=canvas.getContext('2d');
 if(!context)return;
 const pixelRatio=window.devicePixelRatio||1;
 canvas.width=Math.round(width*pixelRatio);
 canvas.height=Math.round(height*pixelRatio);
 context.scale(pixelRatio,pixelRatio);
 const monthIndex=period=>Number(period.slice(0,4))*12+Number(period.slice(5))-1;
 const start=monthIndex(first),end=monthIndex(last);
 const values=series.flatMap(({points})=>points.map(({value})=>value));
 const limits=guideline?(guideline.min===0?[guideline.max]:[guideline.min,guideline.max].filter(Number.isFinite)):[];
 values.push(...limits);
 const min=Math.min(...values),max=Math.max(...values);
 const padding=min===max?Math.abs(min)*.1||1:(max-min)*.08;
 const rawStep=(max-min+2*padding)/4;
 const magnitude=10**Math.floor(Math.log10(rawStep));
 const step=[1,2,2.5,5,10].map(factor=>factor*magnitude).find(value=>value>=rawStep);
 const low=Math.max(0,Math.floor((min-padding)/step))*step;
 const high=Math.ceil((max+padding)/step)*step;
 const left=49,right=width-34,top=14,bottom=height-33;
 const x=month=>start===end?(left+right)/2:left+(month-start)/(end-start)*(right-left);
 const y=value=>bottom-(value-low)/(high-low)*(bottom-top);
 const number=new Intl.NumberFormat('en',{maximumSignificantDigits:4});

 if(limits.length){
  const upper=Math.min(high,guideline.max),lower=Math.max(low,guideline.min);
  context.fillStyle='#a6f3c626';
  context.fillRect(left,y(upper),right-left,y(lower)-y(upper));
 }
 context.font='12px system-ui';
 context.textAlign='right';
 context.textBaseline='middle';
 context.fillStyle='#cbd5e1';
 context.strokeStyle='#334155';
 const tickCount=Math.round((high-low)/step);
 for(let tick=0;tick<=tickCount;tick++){
  const value=low+step*tick;
  context.fillText(number.format(value),left-9,y(value));
  context.beginPath();
  context.moveTo(left,y(value));
  context.lineTo(right,y(value));
  context.stroke();
 }
 const dateLabel=new Intl.DateTimeFormat('en',{month:'short',year:'2-digit',timeZone:'UTC'});
 const monthStep=Math.max(1,Math.ceil((end-start)/Math.max(1,Math.floor((right-left)/68))));
 const months=[start];
 for(let month=start+monthStep;month<=end-monthStep;month+=monthStep)months.push(month);
 if(end!==start)months.push(end);
 context.textAlign='center';
 for(const month of months){
  context.fillText(dateLabel.format(new Date(Date.UTC(Math.floor(month/12),month%12,1))),x(month),bottom+17);
 }

 context.strokeStyle='#a6f3c6';
 context.setLineDash([8,6]);
 for(const limit of limits){
  context.beginPath();
  context.moveTo(left,y(limit));
  context.lineTo(right,y(limit));
  context.stroke();
 }
 context.setLineDash([]);
 context.save();
 const revealEdge=(right+6)*reveal;
 if(reveal<1){
  context.beginPath();
  context.rect(0,0,revealEdge,height);
  context.clip();
 }
 context.lineWidth=2;
 const plotted=[];
 for(const {name,points,color,comparison} of series){
  context.strokeStyle=color;
  context.fillStyle=color;
  let previous;
  for(const {period,value,label} of points){
   const month=monthIndex(period);
   const point={x:x(month),y:y(value),month};
   if(previous&&point.month===previous.month+1){
    context.setLineDash(comparison?[5,4]:[]);
    context.beginPath();
    context.moveTo(previous.x,previous.y);
    const midpoint=(previous.x+point.x)/2;
    context.bezierCurveTo(midpoint,previous.y,midpoint,point.y,point.x,point.y);
    context.stroke();
   }
   context.setLineDash([]);
   context.beginPath();
   if(comparison){
    context.moveTo(point.x,point.y-5);
    context.lineTo(point.x+5,point.y);
    context.lineTo(point.x,point.y+5);
    context.lineTo(point.x-5,point.y);
    context.closePath();
   }else context.arc(point.x,point.y,4,0,2*Math.PI);
   context.fill();
   if(point.x<=revealEdge)plotted.push({...point,period,label,name});
   previous=point;
  }
 }
 context.restore();
 return plotted;
}

function initializeQualityMap(map,overview,coverageBounds){
 const panel=$('qualityPanel');
 const locations={...historicalStationLocations};
 let riverStations=new Map(),activeNetwork='lake';
 const parameter=$('qualityParameter'),month=$('qualityMonth'),layer=$('qualityLayer');
 const stationSelect=$('qualityStation');
 const status=$('qualityStatus'),legend=$('qualityLegend');
 const state={active:false,openStation,setActive};
 const exploreButton=$('consoleExplore'),qualityButton=$('consoleWaterQuality'),historyButton=$('consoleHistory');
 const historyPanel=$('historyPanel'),explorationTools=$('explorationTools');
 const historyResults=$('historyResults'),historyCanvas=$('qualityHistoryChart');
 const historyTooltip=$('historyPointTooltip');
 const historyMotion=window.matchMedia('(prefers-reduced-motion: reduce)');
 let historyPlot=null;
 let historyPoints=[];
 let historyAnimation=0,historyReveal=1;
 const redrawHistory=()=>{
  if(historyPlot&&!historyCanvas.hidden){
   historyPoints=drawQualityHistory(historyCanvas,...historyPlot,historyReveal)??[];
  }
 };
 function hideHistoryTooltip(){
  historyTooltip.hidden=true;
  historyCanvas.style.cursor='';
 }
 function showHistoryTooltip(event){
  const bounds=historyCanvas.getBoundingClientRect();
  const x=event.clientX-bounds.left,y=event.clientY-bounds.top;
  let nearest=null,distance=event.pointerType==='touch'?22:14;
  for(const point of historyPoints){
   const gap=Math.hypot(point.x-x,point.y-y);
   if(gap>=distance)continue;
   nearest=point;
   distance=gap;
  }
  if(!nearest){
   hideHistoryTooltip();
   return;
  }
  const matching=historyPoints.filter(point=>point.period===nearest.period&&Math.abs(point.y-nearest.y)<2);
  historyTooltip.textContent=[researchMonth(nearest.period),...matching.map(point=>point.name+' · '+point.label)].join('\n');
  historyTooltip.hidden=false;
  const left=Math.max(0,Math.min(bounds.width-historyTooltip.offsetWidth,nearest.x-historyTooltip.offsetWidth/2));
  const above=nearest.y-historyTooltip.offsetHeight-9;
  historyTooltip.style.left=left+'px';
  historyTooltip.style.top=(above>=0?above:nearest.y+9)+'px';
  historyCanvas.style.cursor='crosshair';
 }
 historyCanvas.addEventListener('pointermove',showHistoryTooltip);
 historyCanvas.addEventListener('pointerleave',event=>{
  if(event.pointerType!=='touch')hideHistoryTooltip();
 });
 historyCanvas.addEventListener('pointerup',event=>{
  if(event.pointerType==='touch')showHistoryTooltip(event);
 });
 historyCanvas.addEventListener('pointercancel',hideHistoryTooltip);
 new ResizeObserver(()=>{
  hideHistoryTooltip();
  redrawHistory();
 }).observe(historyCanvas);
 function animateHistory(){
  const start=performance.now();
  historyReveal=historyMotion.matches?1:0;
  redrawHistory();
  if(historyReveal===1)return;
  function frame(now){
   const progress=historyMotion.matches?1:Math.min(1,Math.max(0,(now-start)/540));
   historyReveal=1-(1-progress)**2;
   redrawHistory();
   historyAnimation=progress<1?requestAnimationFrame(frame):0;
  }
  historyAnimation=requestAnimationFrame(frame);
 }
 const historyParameter=$('historyParameter'),historyStation=$('historyStation'),historyCompare=$('historyCompare');
 const share=$('qualityShare'),shareUrl=$('qualityShareUrl'),shareStatus=$('qualityShareStatus');
 let historyOpen=false;
 const focusRing=document.createElement('div');
 focusRing.className='station-focus-ring';
 focusRing.setAttribute('aria-hidden','true');
 const focusMarker=new maplibregl.Marker({element:focusRing});
 let focusedStation='';
 function clearStationFocus(){
  focusMarker.remove();
  focusedStation='';
 }
 function indicateStationFocus(id){
  const location=locations[id];
  if(!location){
   clearStationFocus();
   return;
  }
  if(focusedStation===id)return;
  focusRing.replaceChildren(document.createElement('span'));
  focusMarker.setLngLat(location.slice(1)).addTo(map);
  focusedStation=id;
 }

 function updateExploreStations(){
  if(!map.getLayer('explore-stations'))return;
  const visible=!state.active&&!historyOpen&&!document.body.classList.contains('landing-active');
  map.setLayoutProperty('explore-stations','visibility',visible?'visible':'none');
  if(!visible)explorePopup.remove();
 }

 function showConsoleSection(showHistory=false){
  historyOpen=showHistory;
  clearStationFocus();
  explorationTools.hidden=historyOpen||state.active;
  panel.hidden=historyOpen||!state.active;
  historyPanel.hidden=!historyOpen;
  historyResults.hidden=!historyOpen;
  hideHistoryTooltip();
  if(!historyOpen)cancelAnimationFrame(historyAnimation);
  updateExploreStations();
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
  setMobilePanel(false);
  if(window.matchMedia(mobileLayout).matches)$('panelToggle').focus({preventScroll:true});
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
 historyCompare.addEventListener('change',renderHistory);
 share.addEventListener('click',async()=>{
  const url=new URL(location.pathname,location.href);
  url.searchParams.set('view','water-quality');
  url.searchParams.set('network',activeNetwork);
  url.searchParams.set('parameter',parameter.value);
  url.searchParams.set('month',month.value);
  url.searchParams.set('layer',layer.value);
  if(stationSelect.value)url.searchParams.set('station',stationSelect.value);
  try{
   await navigator.clipboard.writeText(url.href);
   shareStatus.textContent='Map link copied.';
  }catch{
   shareUrl.value=url.href;
   shareUrl.hidden=false;
   shareUrl.labels[0].hidden=false;
   shareUrl.focus();
   shareUrl.select();
   shareStatus.textContent='Copy the link from the field above.';
  }
 });
 historyStation.addEventListener('change',()=>{
  renderHistory();
  const location=locations[historyStation.value];
  if(location)flyToStation(location.slice(1));
 });
 document.addEventListener('landing:enter',()=>showConsoleSection());
 document.addEventListener('explorer:ready',updateExploreStations);
 const explorePopup=new maplibregl.Popup({className:'station-map-popup',offset:18});
 const popup=new maplibregl.Popup({
  className:'station-map-popup',maxWidth:'min(340px, calc(100vw - 24px))',
  focusAfterOpen:false,offset:18
 });
 const canHover=window.matchMedia('(any-hover: hover)');
 let popupStation='',popupPinned=false,popupCloseTimer;
 function schedulePopupClose(){
  clearTimeout(popupCloseTimer);
  if(!popupPinned)popupCloseTimer=setTimeout(()=>popup.remove(),240);
 }
 popup.on('close',()=>{
  clearTimeout(popupCloseTimer);
  popupStation='';
  popupPinned=false;
 });
 let records,loadFailed=false,previousView,previousTerrain,availableParameters=[],lakeParameters=[];
 const empty={type:'FeatureCollection',features:[]};
 const normalize=name=>name.toLowerCase().replaceAll('.','');

 function coordinates(record){
  const location=locations[record.station_id];
  return location&&normalize(location[0])===normalize(record.station_name)?location.slice(1):null;
 }
 function updateStationAvailability(select,available){
  for(const option of select.options){
   if(option.value)option.disabled=!available.has(option.value);
  }
  if(select.selectedOptions[0]?.disabled)select.value='';
 }
 function renderHistory(){
  if(!historyOpen||!records||!map.getLayer('history-stations'))return;
  const parameterRecords=records.filter(record=>record.parameter===historyParameter.value);
  const available=new Set(parameterRecords.filter(record=>coordinates(record)||stationNetwork(record.station_id)==='river').map(record=>record.station_id));
  updateStationAvailability(historyStation,available);
  indicateStationFocus(historyStation.value);
  available.delete(historyStation.value);
  historyCompare.disabled=!historyStation.value;
  if(historyCompare.disabled)historyCompare.value='';
  updateStationAvailability(historyCompare,available);
  map.setPaintProperty('history-stations','circle-color',[
   'match',['get','stationId'],historyStation.value||'-','#67e8f9',historyCompare.value||'--','#fbbf24',
   ['case',['==',['get','network'],'river'],'#7c3aed','#0e7490']
  ]);
  const canvas=historyCanvas,message=$('qualityHistoryStatus'),key=$('historyChartKey');
  const details=$('qualityHistoryDetails'),list=$('qualityHistoryList');
  const ids=[historyStation.value,historyCompare.value].filter(Boolean);
  const series=ids.map((id,index)=>{
   const readings=parameterRecords.filter(record=>record.station_id===id)
    .sort((a,b)=>a.period.localeCompare(b.period));
   const points=readings.filter(record=>record.qualifier==='exact_as_printed')
    .map(record=>({period:record.period,value:numericValue(record),label:record.reported_value+' '+record.unit}))
    .filter(point=>Number.isFinite(point.value)&&point.value>=0);
   return {name:readings[0].station_name,readings,points,color:['#67e8f9','#fbbf24'][index],comparison:index===1};
  });
  const readings=series.flatMap(item=>item.readings);
  const total=series.reduce((count,item)=>count+item.points.length,0);
  const unit=readings[0]?.unit;
  const measure=researchLabels[historyParameter.value];
  $('historyResultsTitle').textContent=unit?measure+' ('+unit+')':'Historical Trends';
  const guideline=classCGuidelines[historyParameter.value];
  const guide=guideline&&readings.every(record=>record.unit===guideline.unit)?guideline:null;
  list.replaceChildren();
  key.replaceChildren();
  key.hidden=true;
  canvas.hidden=true;
  hideHistoryTooltip();
  historyPoints=[];
  cancelAnimationFrame(historyAnimation);
  historyPlot=null;
  details.hidden=!readings.length;
  if(!readings.length){
   message.textContent=available.size?'Select a station on the map or in Map tools to see its history.':'No stations have historical readings for this parameter.';
   return;
  }
  for(const item of series){
   for(const record of item.readings){
    const entry=researchElement('li',[series.length>1?item.name:'',researchMonth(record.period),record.reported_value+' '+record.unit].filter(Boolean).join(' / '));
    entry.append(researchElement('small',validationLabels[record.validation_status]),readingSource(record));
    list.append(entry);
   }
  }
  if(!total){
   message.textContent='No exact numeric readings to plot. See historical readings below.';
   return;
  }
  const periods=readings.map(record=>record.period).sort();
  historyPlot=[series,periods[0],periods.at(-1),guide];
  canvas.hidden=false;
  animateHistory();
  for(const {name,color,comparison} of series){
   const item=researchElement('li',name);
   const swatch=researchElement('span');
   swatch.setAttribute('aria-hidden','true');
   swatch.style.backgroundColor=color;
   if(comparison)swatch.className='history-comparison';
   item.prepend(swatch);
   key.append(item);
  }
  if(guide){
   const item=researchElement('li','Class C guideline '+guide.label);
   const swatch=researchElement('span');
   swatch.className='history-guideline';
   swatch.setAttribute('aria-hidden','true');
   item.prepend(swatch);
   key.append(item);
  }
  key.hidden=false;
  message.textContent=total+' of '+readings.length+' reported readings plotted. Lines connect consecutive months with exact readings.';
 }

 function renderCoverage(entries,periods){
  const root=$('qualityCoverage');
  const byMonth=new Map();
  for(const record of entries){
   const monthRecords=byMonth.get(record.period)||[];
   monthRecords.push(record);
   byMonth.set(record.period,monthRecords);
  }
  const label=new Intl.DateTimeFormat('en',{month:'short',timeZone:'UTC'});
  root.replaceChildren();
  const newest=Number(periods[0]?.slice(0,4)),oldest=Number(periods.at(-1)?.slice(0,4));
  for(let year=newest;year>=oldest;year--){
   const group=researchElement('fieldset');
   group.className='coverage-year';
   group.append(researchElement('legend',year));
   const grid=researchElement('div');
   grid.className='coverage-months';
   for(let number=1;number<=12;number++){
    const period=year+'-'+String(number).padStart(2,'0');
    const monthRecords=byMonth.get(period)||[];
    const count=monthRecords.length;
    const pending=monthRecords.filter(record=>record.validation_status!=='confirmed_in_official_report').length;
    const monthLabel=label.format(new Date(period+'-01T00:00:00Z'));
    const button=researchElement('button',monthLabel+(pending?'*':''));
    button.type='button';
    button.className='mode';
    button.disabled=!count;
    button.classList.toggle('active',period===month.value);
    button.setAttribute('aria-pressed',String(period===month.value));
    const description=researchMonth(period)+' / '+count+' readings'+(pending?' / '+pending+' pending review':'');
    button.title=description;
    button.setAttribute('aria-label',description);
    button.addEventListener('click',()=>{
     month.value=period;
     render();
     root.querySelector('[aria-pressed="true"]')?.focus();
    });
    grid.append(button);
   }
   group.append(grid);
   root.append(group);
  }
 }

 function updateNetworkOptions(){
  const previousParameter=parameter.value,previousMonth=month.value;
  const river=activeNetwork==='river';
  const options=river?availableParameters.filter(item=>Object.values(riverParameters).includes(item.parameter)):lakeParameters;
  parameter.replaceChildren(...options.map(({parameter:key,unit})=>new Option(`${researchLabels[key]} (${unit})`,key)));
  if(options.some(item=>item.parameter===previousParameter))parameter.value=previousParameter;
  const periods=[...new Set(records.filter(record=>stationNetwork(record.station_id)===activeNetwork)
   .map(record=>record.period))].sort().reverse();
  month.replaceChildren(...periods.map(period=>new Option(researchMonth(period),period)));
  if(periods.includes(previousMonth))month.value=previousMonth;
 }

 function render(){
  if(!state.active||!records||!map.getSource('quality-readings'))return;
  popup.remove();
  clearStationFocus();
  const networkRecords=records.filter(record=>stationNetwork(record.station_id)===activeNetwork);
  const all=networkRecords.filter(record=>record.parameter===parameter.value);
  share.disabled=!month.value;
  shareStatus.textContent='';
  shareUrl.hidden=true;
  shareUrl.labels[0].hidden=true;
  renderCoverage(all,Array.from(month.options,option=>option.value));
  const selected=all.filter(record=>record.period===month.value);
  const list=$('qualityReadingList');
  list.replaceChildren();
  for(const record of selected){
   const row=researchElement('li',`${stationLabel(record.station_id)} · ${record.station_name} · ${record.reported_value} ${record.unit}`);
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
     icon:stationMarkerIcon(map,record.station_id,assessment.color),numeric,relative
    }
   }];
  });
  const heat=layer.value==='heat';
  const numericCount=features.filter(feature=>feature.properties.numeric).length;
  const showHeat=heat&&numericCount>=3;
  map.getSource('quality-readings').setData({type:'FeatureCollection',features});
  map.setLayoutProperty('quality-heat','visibility',showHeat&&!historyOpen?'visible':'none');
  status.textContent=selected.length
   ?`${features.length} of ${selected.length} readings mapped with historical station coordinates.`
   :'No station readings for this parameter and month.';
  if(activeNetwork==='river')status.textContent+=' River coordinates are unverified.';
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

 function stationFeatures(){
  return {type:'FeatureCollection',features:Object.entries(locations).map(([stationId,location])=>({
   type:'Feature',
   geometry:{type:'Point',coordinates:location.slice(1)},
   properties:{stationId,network:stationNetwork(stationId),icon:exploreStationIcon(map,stationId)}
  }))};
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
   id:'quality-stations',type:'symbol',source:'quality-readings',
   layout:{
    visibility:'none','icon-image':['get','icon'],'icon-allow-overlap':true,'icon-ignore-placement':true
   }
  });
  map.addSource('history-locations',{
   type:'geojson',data:stationFeatures()
  });
  map.addLayer({
   id:'explore-stations',type:'symbol',source:'history-locations',
   layout:{
    visibility:'none','icon-image':['get','icon'],'icon-allow-overlap':true,'icon-ignore-placement':true
   }
  });
  updateExploreStations();
  map.addLayer({
   id:'history-stations',type:'circle',source:'history-locations',layout:{visibility:'none'},
   paint:{'circle-radius':8,'circle-stroke-width':2,'circle-stroke-color':'#fff','circle-color':'#0e7490'}
  });
  qualityButton.disabled=false;
  historyButton.disabled=false;
  $('exploreFocusStation').disabled=false;
 });
 function showStation(id,center,pinned=true){
  clearTimeout(popupCloseTimer);
  if(pinned)indicateStationFocus(id);
  if(popup.isOpen()&&popupStation===id){
   popupPinned=pinned;
   return;
  }
  popup.remove();
  const content=researchElement('div');
  content.className='quality-popup';
  const readings=records.filter(record=>record.station_id===id&&record.period===month.value);
  const name=readings[0]?.station_name??locations[id][0];
  const header=researchElement('header');
  header.className='quality-popup-header';
  header.append(researchElement('h3',name),
   researchElement('p',stationLabel(id)+' / '+researchMonth(month.value)));
  if(stationNetwork(id)==='river'){
   header.append(researchElement('p','Unverified historical location'),
    researchLink(riverStations.get(id).coordinate_source,'Coordinate source'));
  }
  const list=researchElement('ul');
  list.className='quality-popup-readings';
  list.tabIndex=0;
  list.setAttribute('aria-label','Monthly parameter readings');

  for(const {value:key} of parameter.options){
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
  popupStation=id;
  popupPinned=pinned;
  const element=popup.getElement();
  element.addEventListener('pointerenter',()=>clearTimeout(popupCloseTimer));
  element.addEventListener('pointerleave',schedulePopupClose);
 }
 map.on('mousemove','quality-stations',event=>{
  if(!canHover.matches||popupPinned||map.isMoving()||event.originalEvent.buttons)return;
  const feature=event.features[0];
  showStation(feature.properties.stationId,feature.geometry.coordinates,false);
 });
 map.on('mouseleave','quality-stations',schedulePopupClose);
 map.on('click','quality-stations',event=>{
  const feature=event.features[0];
  stationSelect.value=feature.properties.stationId;
  showStation(stationSelect.value,feature.geometry.coordinates);
 });
 map.on('click','explore-stations',event=>{
  const feature=event.features[0];
  const id=feature.properties.stationId;
  indicateStationFocus(id);
  const content=researchElement('div');
  content.className='quality-popup-header';
  const river=riverStations.get(id);
  content.append(researchElement('h3',locations[id][0]),
   researchElement('p',stationLabel(id)+(river?' · Unverified historical location':' · Historical location')));
  if(river){
   const period=records?.filter(record=>record.station_id===id).map(record=>record.period).sort().at(-1);
   content.append(researchLink(river.coordinate_source,'Coordinate source'));
   const button=researchElement('button','Open water quality');
   button.type='button';
   button.addEventListener('click',()=>openStation(id,period));
   if(!period)content.append(researchElement('p','No readings in the Q4 2024 extract.'));
   content.append(button);
  }
  explorePopup.setLngLat(feature.geometry.coordinates).setDOMContent(content).addTo(map);
 });
 map.on('click','history-stations',event=>{
  if(!historyOpen||!records)return;
  const id=event.features[0].properties.stationId;
  const option=Array.from(historyStation.options).find(item=>item.value===id);
  if(!option||option.disabled)return;
  historyStation.value=id;
  renderHistory();
 });
 for(const layerId of ['explore-stations','quality-stations','history-stations']){
  map.on('mouseenter',layerId,()=>{map.getCanvas().style.cursor='pointer';});
  map.on('mouseleave',layerId,()=>{map.getCanvas().style.cursor='';});
 }

 for(const input of [parameter,month,layer])input.addEventListener('change',render);
 stationSelect.addEventListener('change',()=>{
  setStationNetwork(stationSelect.value);
  render();
  focusStation();
 });

 function setStationNetwork(id){
  const nextNetwork=stationNetwork(id);
  if(nextNetwork===activeNetwork)return;
  activeNetwork=nextNetwork;
  updateNetworkOptions();
 }

 async function openStation(id,period){
  setActive(true);
  await dataReady;
  if(!state.active||!records)return;
  if(!Object.hasOwn(locations,id))return;
  setStationNetwork(id);
  if(period&&Array.from(month.options).some(option=>option.value===period))month.value=period;
  stationSelect.value=id;
  render();
  focusStation();
 }

 function focusStation(){
  const location=locations[stationSelect.value];
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

 const dataReady=loadResearch().then(({monthly,stations,parameters,lakeParameters:lakeOptions,river})=>{
  records=monthly;
  availableParameters=parameters;
  lakeParameters=lakeOptions;
  if(river){
   riverStations=river.stations;
   Object.assign(locations,river.locations,river.historicalLocations);
   map.getSource('history-locations')?.setData(stationFeatures());
  }
  for(const {parameter:key,unit} of parameters){
   historyParameter.add(new Option(`${researchLabels[key]} (${unit})`,key));
  }
  const options=Array.from(stations,([id,record])=>new Option(
   stationOptionLabel(id,record.station_name)+(coordinates(record)?'':' (location unavailable)'),id));
  stationSelect.append(...stationGroups(options.filter(option=>Object.hasOwn(locations,option.value))));
  for(const select of [historyStation,historyCompare]){
   select.append(...stationGroups(options.map(option=>option.cloneNode(true))));
  }
  updateNetworkOptions();
  render();
  renderHistory();
 }).catch(error=>{
  loadFailed=true;
  console.warn(error);
  status.textContent='Historical readings could not load.';
  $('qualityHistoryStatus').textContent=status.textContent;
 });
 const shared=new URLSearchParams(location.search);
 if(shared.get('view')==='water-quality'){
  const styleReady=new Promise(resolve=>map.once('style.load',resolve));
  document.addEventListener('explorer:ready',async()=>{
   await Promise.all([dataReady,styleReady]);
   const choose=(field,key)=>{
    const value=shared.get(key);
    if(Array.from(field.options).some(option=>option.value===value&&!option.disabled))field.value=value;
   };
   const id=shared.get('station');
   if(riverStations.has(id)||(!id&&shared.get('network')==='river'&&riverStations.size))activeNetwork='river';
   if(records)updateNetworkOptions();
   choose(parameter,'parameter');
   choose(month,'month');
   choose(layer,'layer');
   qualityButton.click();
   if(id)openStation(id,month.value);
  },{once:true});
  $('enterExplorer').click();
 }
 return state;
}
