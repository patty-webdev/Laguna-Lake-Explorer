const researchDirectory='./public/data/Laguna_Lake_Consolidated_Research_2026/';
const riverDirectory='./public/data/River_Stations_Data/';
const riverParameters={
 BOD_mg_L:'BOD',DO_mg_L:'DO',pH:'pH',nitrate_mg_L:'nitrate',
 inorganic_phosphate_mg_L:'phosphate',ammonia_mg_L:'ammonia',fecal_coliform_MPN_100mL:'fecalColiform'
};
const researchLabels={
 DO:'Dissolved oxygen',BOD:'Biochemical oxygen demand',pH:'pH',nitrate:'Nitrate',
 phosphate:'Inorganic phosphate',COD:'Chemical oxygen demand',turbidity:'Turbidity',temperature:'Water temperature',
 ammonia:'Ammonia',fecalColiform:'Fecal coliform'
};
const validationLabels={
 prior_audit_review_needed:'Prior audit pending recheck',
 manual_first_pass_needs_second_review:'Manual transcription pending second review',
 confirmed_in_official_report:'Confirmed in official report'
};
const researchMonthFormat=new Intl.DateTimeFormat('en',{month:'long',year:'numeric',timeZone:'UTC'});
const researchMonth=period=>researchMonthFormat.format(new Date(`${period}-01T00:00:00Z`));

async function readResearchFile(name){
 const response=await fetch(researchDirectory+name);
 if(!response.ok)throw new Error(`${name} returned HTTP ${response.status}`);
 return response;
}

async function researchCsv(name){
 const response=await readResearchFile(name);
 // The package CSV files have quoted fields and single-line records.
 const [header,...lines]=(await response.text()).trim().split(/\r?\n/);
 const columns=header.split(',');
 return lines.map(line=>{
  const fields=Array.from((line+',').matchAll(/(?:"((?:[^"]|"")*)"|([^,]*)),/g),
   match=>match[1]?.replaceAll('""','"')??match[2]);
  return Object.fromEntries(columns.map((key,index)=>[key,fields[index]]));
 });
}

let researchRequest;
const stationNetwork=id=>id.startsWith('river-')?'river':'lake';
const stationLabel=id=>stationNetwork(id)==='river'?'River '+id.slice(6):id;

function stationOptionLabel(id,name){
 return (stationNetwork(id)==='river'?id.slice(6):'Stn. '+id)+' · '+name;
}

function stationGroups(options){
 return [['lake','Lake stations'],['river','River stations']].flatMap(([network,label])=>{
  const entries=options.filter(option=>stationNetwork(option.value)===network);
  if(!entries.length)return [];
  if(network==='river')entries.sort((a,b)=>a.value.localeCompare(b.value,'en',{numeric:true}));
  const group=researchElement('optgroup');
  group.label=label;
  group.append(...entries);
  return [group];
 });
}

async function loadRiverResearch(){
 const [registry,samples,parameters,historical,news,sources]=await Promise.all([
  'river_stations.json','river_water_quality_2024_Q4.json','water_quality_parameters.json',
  'historical_river_stations.json','river_news.json','data_sources.json'
 ].map(async file=>{
  const response=await fetch(riverDirectory+file);
  if(!response.ok)throw new Error(`${file} returned HTTP ${response.status}`);
  return response.json();
 }));
 const stations=new Map(registry.map(station=>{
  const id='river-'+station.station_id;
  return [id,{...station,station_id:id}];
 }));
 const units=new Map(parameters.map(parameter=>[parameter.key,parameter.unit]));
 const monthly=samples.flatMap(sample=>Object.entries(sample.measurements).flatMap(([key,value])=>{
  const parameter=riverParameters[key];
  if(!parameter||value.reported==null)return [];
  const station_id='river-'+sample.station_id;
  return [{
   station_id,station_name:stations.get(station_id).station_name,period:sample.month,
   temporal_resolution:'monthly',record_type:'station_measurement',parameter,unit:units.get(key),
   reported_value:value.reported,numeric_value:value.numeric_value,reporting_limit:value.limit??null,
   qualifier:value.qualifier??'exact_as_printed',validation_status:'manual_first_pass_needs_second_review',
   source_url:sample.source_url,source_pdf_page:sample.source_page
  }];
 }));
 const locations=Object.fromEntries([...stations].flatMap(([id,station])=>
  Number.isFinite(station.longitude)&&Number.isFinite(station.latitude)&&station.station_id!=='river-22B'
   ?[[id,[station.station_name,station.longitude,station.latitude]]]:[]));
 const historicalLocations={};
 for(const station of historical){
  const id='river-'+station.station_id;
  if(stations.has(id))continue;
  stations.set(id,{...station,station_id:id,coordinate_source:station.source_url});
  if(Number.isFinite(station.longitude)&&Number.isFinite(station.latitude)){
   historicalLocations[id]=[station.station_name,station.longitude,station.latitude];
  }
 }
 return {registry,stations,monthly,locations,historicalLocations,parameters,historical,news,sources};
}

function loadResearch(){
 researchRequest??=Promise.all([
  readResearchFile('measurements_all.json').then(response=>response.json()),
  researchCsv('parameters.csv'),researchCsv('stations_2024.csv'),
  researchCsv('source_inventory.csv'),researchCsv('coverage_summary.csv'),researchCsv('station_counts_by_year.csv'),
  loadRiverResearch().catch(error=>{console.warn('River research could not load',error);return null;})
 ]).then(([measurements,lakeParameters,registry,sources,coverage,stationCounts,river])=>{
  const lakeMonthly=measurements.filter(record=>record.record_type==='station_measurement'&&record.temporal_resolution==='monthly');
  const monthly=[...lakeMonthly,...(river?.monthly??[])];
  const annual=measurements.filter(record=>record.record_type==='lake_annual_average');
  const months=[...new Set(monthly.map(record=>record.period))].sort().reverse();
  const stations=new Map(registry.map(station=>[station.station_id,station]));
  for(const record of lakeMonthly){
   const previous=stations.get(record.station_id);
   if(!previous?.period||record.period>=previous.period)stations.set(record.station_id,record);
  }
  const parameters=[...lakeParameters];
  if(river){
   for(const [id,station] of river.stations)stations.set(id,station);
   for(const {key,unit} of river.parameters){
    const parameter=riverParameters[key];
    if(parameter&&!parameters.some(item=>item.parameter===parameter))parameters.push({parameter,unit});
   }
  }
  return {measurements,monthly,lakeMonthly,annual,months,parameters,lakeParameters,stations,registry,sources,coverage,stationCounts,river};
 }).catch(error=>{
  researchRequest=undefined;
  throw error;
 });
 return researchRequest;
}

function researchElement(tag,content){
 const element=document.createElement(tag);
 if(content!==undefined)element.textContent=content;
 return element;
}

function researchLink(url,label){
 const link=researchElement('a',label);
 link.href=url;
 link.target='_blank';
 link.rel='noopener';
 return link;
}

function readingSource(record){
 const page=record.source_pdf_page;
 return researchLink(page?`${record.source_url}#page=${page}`:record.source_url,page?`LLDA report, p. ${page}`:'LLDA report');
}

const waterQualityFactors=[
 {
  title:'Household and industrial waste',
  parameters:['BOD','COD','DO'],
  description:'LLDA identifies household waste, industrial discharges, and land runoff as sources of oxygen demand in the lake. As organic material breaks down, it consumes dissolved oxygen.',
  source:'https://llda.gov.ph/the-water-mondriaan/',
  sourceTitle:'LLDA Water Mondriaan'
 },
 {
  title:'Nutrient inputs from the watershed',
  parameters:['nitrate','phosphate','DO'],
  description:'Domestic waste, agricultural runoff, and industrial waste can carry nutrients into the lake. Extra nitrogen and phosphorus can fuel algal blooms, which can reduce dissolved oxygen as they decay.',
  source:'https://llda.gov.ph/advisory-on-algal-bloom-in-laguna-de-bay/',
  sourceTitle:'LLDA advisory on nutrient inputs and algal blooms'
 },
 {
  title:'Warm, calm conditions and algal blooms',
  parameters:['temperature','DO','pH'],
  description:'LLDA links warm, calm conditions to faster algal growth. Dense blooms can draw down oxygen at night, and LLDA reports that lake pH has risen during peak blooms.',
  source:'https://llda.gov.ph/laguna-de-bay-algal-bloom-advisory/',
  sourceTitle:'LLDA algal bloom monitoring advisory',
  additionalSource:'https://llda.gov.ph/laguna-de-bay/'
 },
 {
  title:'Wind and suspended sediment',
  parameters:['turbidity'],
  description:'Strong winds can stir sediment off the shallow lakebed, increasing turbidity. LLDA notes that this can be especially pronounced during typhoons.',
  source:'https://llda.gov.ph/laguna-de-bay/',
  sourceTitle:'LLDA Laguna de Bay profile'
 }
];

function renderWaterQualityFactors(parameter=''){
 const root=document.getElementById('researchFactorCards');
 const factors=waterQualityFactors.filter(item=>!parameter||item.parameters.includes(parameter));
 root.replaceChildren();
 if(parameter){
  const heading=researchElement('p',researchLabels[parameter]+' / Possible causes of unusual readings');
  heading.tabIndex=-1;
  const reset=researchElement('button','Show all possible causes');
  reset.type='button';
  reset.className='ghost';
  reset.addEventListener('click',()=>{
   renderWaterQualityFactors();
   document.querySelector('#researchFactors summary').focus();
  });
  root.append(heading,reset);
 }
 for(const item of factors){
  const card=researchElement('article');
  card.className='research-factor-card';
  card.append(researchElement('h3',item.title),
   researchElement('small',item.parameters.map(key=>researchLabels[key]).join(' / ')),
   researchElement('p',item.description),researchLink(item.source,item.sourceTitle));
  if(item.additionalSource)card.append(researchLink(item.additionalSource,'LLDA lake profile and pH observations'));
  root.append(card);
 }
}

renderWaterQualityFactors();
document.getElementById('qualityFactorsLink').addEventListener('click',()=>{
 const parameter=document.getElementById('qualityParameter').value;
 renderWaterQualityFactors(parameter);
 const section=document.getElementById('researchFactors');
 section.open=true;
 document.getElementById('researchDialog').showModal();
 (document.querySelector('#researchFactorCards p[tabindex]')||section.querySelector('summary')).focus();
});
document.getElementById('researchDialog').addEventListener('close',()=>renderWaterQualityFactors());

function researchDataBrowser({measurements,lakeParameters,registry,sources,coverage,stationCounts,river}){
 const datasets=[
  ['Measurements','measurements_all.csv',measurements],
  ['Lake parameters','parameters.csv',lakeParameters],
  ['2024 station register','stations_2024.csv',registry],
  ['Source inventory','source_inventory.csv',sources],
  ['Extraction coverage','coverage_summary.csv',coverage],
  ['Reported station counts','station_counts_by_year.csv',stationCounts]
 ];
 if(river)datasets.push(
  ['River measurements',riverDirectory+'river_water_quality_2024_Q4.json',river.monthly.map(record=>({
   ...record,station_id:record.station_id.slice(6)
  }))],
  ['River station register',riverDirectory+'river_stations.json',river.registry],
  ['Historical river locations',riverDirectory+'historical_river_stations.json',river.historical],
  ['River news references',riverDirectory+'river_news.json',river.news.map(record=>({
   ...record,station_ids:record.station_ids.join(', ')
  }))]
 );
 const browser=researchElement('details');
 const selection=researchElement('select');
 selection.id='researchDataset';
 const selectionLabel=researchElement('label','Dataset');
 selectionLabel.htmlFor=selection.id;
 for(const [title,file] of datasets)selection.add(new Option(title,file));
 const search=researchElement('input');
 search.type='search';
 search.id='researchDataSearch';
 const searchLabel=researchElement('label','Search rows');
 searchLabel.htmlFor=search.id;
 const status=researchElement('p');
 status.setAttribute('role','status');
 const scroll=researchElement('div');
 scroll.className='research-data-scroll';
 scroll.tabIndex=0;
 scroll.setAttribute('role','region');
 scroll.setAttribute('aria-label','Dataset table');
 browser.append(researchElement('summary','Browse consolidated data'),selectionLabel,selection,
  searchLabel,search,status,scroll);

 function renderTable(){
  const [title,,records]=datasets.find(([,file])=>file===selection.value);
  const columns=[...new Set(records.flatMap(Object.keys))];
  const query=search.value.trim().toLowerCase();
  const matches=records.filter(record=>Object.values(record).some(value=>String(value??'').toLowerCase().includes(query)));
  status.textContent=matches.length+' of '+records.length+' rows';
  const table=researchElement('table');
  table.append(researchElement('caption',title));
  const headings=table.createTHead().insertRow();
  for(const column of columns){
   const cell=researchElement('th',column.replaceAll('_',' '));
   cell.scope='col';
   headings.append(cell);
  }
  const body=table.createTBody();
  for(const record of matches){
   const row=body.insertRow();
   for(const column of columns){
    const cell=row.insertCell();
    const value=record[column]??'';
    if(typeof value==='string'&&/^https?:[/][/]/.test(value)){
     cell.append(researchLink(value,column.replaceAll('_',' ')));
    }else{
     cell.textContent=value;
    }
   }
  }
  scroll.replaceChildren(table);
 }

 selection.addEventListener('change',()=>{
  search.value='';
  renderTable();
 });
 search.addEventListener('input',renderTable);
 browser.addEventListener('toggle',()=>{
  if(browser.open&&!scroll.firstChild)renderTable();
 });

 const downloads=researchElement('details');
 downloads.append(researchElement('summary','Download package files'));
 const files=researchElement('ul');
 const riverFiles=river?['river_stations.geojson','water_quality_parameters.json','data_sources.json','README.md']
  .map(file=>riverDirectory+file):[];
 for(const file of [...datasets.map(([,file])=>file),'measurements_all.json','README.md',...riverFiles]){
  const row=researchElement('li');
  const name=file.split('/').at(-1);
  const link=researchLink(file.startsWith('./')?file:researchDirectory+file,
   file.startsWith(riverDirectory)?'River / '+name:name);
  link.download=name;
  row.append(link);
  files.append(row);
 }
 downloads.append(files);
 return [browser,downloads];
}

function renderRiverAnalysis(river){
 const section=researchElement('section');
 section.append(researchElement('h3','River water quality · October–December 2024'));
 if(!river){
  section.append(researchElement('p','The river station package could not load.'));
  return section;
 }
 const {monthly,registry,locations,sources}=river;
 const sampled=new Set(monthly.map(record=>record.station_id)).size;
 section.append(
  researchElement('p',`${monthly.length} reported results across ${sampled} of ${registry.length} listed stations. ${Object.keys(locations).length} station locations can be displayed using unverified historical coordinates.`),
  researchElement('p','Saran and Binangonan lack coordinates. Tanay 22B has a conflicting location label. Their readings are available in the river measurements table. Jala-jala had no Q4 samples.'),
  researchElement('p','The Q4 data is a single-pass transcription. Results below a reporting limit are counted separately from exact numbers. The historical upstream locations 4U and 5U appear on the map and have no Q4 measurements. Historical location records and news references are available in the data browser.')
 );
 const table=researchElement('table');
 table.append(researchElement('caption','River results by parameter'));
 const headings=table.createTHead().insertRow();
 for(const label of ['Parameter','Exact','Below limit','Missing station-months','Outside Class C reference']){
  const cell=researchElement('th',label);
  cell.scope='col';
  headings.append(cell);
 }
 const periods=new Set(monthly.map(record=>record.period));
 const body=table.createTBody();
 for(const key of Object.values(riverParameters)){
  const readings=monthly.filter(record=>record.parameter===key);
  const exact=readings.filter(record=>Number.isFinite(numericValue(record)));
  const assessed=exact.map(guidelineStatus).filter(status=>status!=='unknown');
  const outside=assessed.filter(status=>status==='outside').length;
  const row=body.insertRow();
  for(const value of [researchLabels[key],exact.length,readings.length-exact.length,
   registry.length*periods.size-readings.length,assessed.length?`${outside} of ${assessed.length}`:'—']){
   row.insertCell().textContent=value;
  }
 }
 const scroll=researchElement('div');
 scroll.className='research-data-scroll';
 scroll.tabIndex=0;
 scroll.append(table);
 section.append(scroll,researchElement('p','Class C thresholds are shown as reference benchmarks. COD, turbidity, temperature, TSS, chloride, and oil and grease have no reported values in this extract.'),
  researchLink(sources.report_2024+'#page=3','LLDA Q4 2024 river table, p. 3'));
 return section;
}

function renderResearchArchive(dataset){
 const {lakeMonthly,annual,registry,sources,coverage,stationCounts,river}=dataset;
 const root=$('researchContents');
 root.replaceChildren(researchElement('p',`${lakeMonthly.length} monthly lake station readings and ${annual.length} lake-wide annual averages. The archive inventory includes reports with no extracted readings.`));
 root.append(renderRiverAnalysis(river),...researchDataBrowser(dataset),researchElement('h3','Lake-wide annual averages'));
 for(const record of [...annual].sort((a,b)=>a.period.localeCompare(b.period))){
  const row=researchElement('p',`${record.period} · ${record.parameter} · ${record.reported_value} ${record.unit} · ${validationLabels[record.validation_status]} `);
  row.append(readingSource(record));
  root.append(row);
 }
 const counts=researchElement('ul');
 for(const row of stationCounts){
  const item=researchElement('li',`${row.year} · ${row.count} reported stations (${row.status.replaceAll('_',' ')}) `);
  const source=sources.find(source=>source.source_id===row.source_id);
  if(source)item.append(researchLink(source.individual_pdf_url||source.source_page,row.source_id));
  counts.append(item);
 }
 const catalog=researchElement('details');
 catalog.append(researchElement('summary',`2024 station register (${registry.length})`));
 const stations=researchElement('ul');
 for(const row of registry){
  const item=researchElement('li',`${row.station_id} · ${row.station_name}`);
  item.append(researchElement('small',`Register coordinate status: ${row.coordinate_status.replaceAll('_',' ')}`));
  stations.append(item);
 }
 catalog.append(stations);
 root.append(researchElement('h3','Reported station counts'),counts,catalog,researchElement('h3',`Source inventory (${sources.length})`));
 const bySource=new Map(coverage.map(row=>[row.source_id,row]));
 const families=new Map();
 for(const source of sources){
  if(!families.has(source.report_family))families.set(source.report_family,[]);
  families.get(source.report_family).push(source);
 }
 for(const [family,entries] of families){
  const group=researchElement('details');
  group.append(researchElement('summary',`${family.replaceAll('_',' ')} (${entries.length})`));
  const list=researchElement('ul');
  for(const source of entries){
   const row=researchElement('li');
   row.append(researchLink(source.individual_pdf_url||source.source_page,source.source_id));
   const extracted=bySource.get(source.source_id);
   row.append(extracted
    ?` · ${extracted.available_records_in_package} extracted · ${extracted.parameters.replaceAll(';',', ')}`
    :' · Archive reference');
   row.append(researchElement('small',source.status.replaceAll('_',' ')));
   if(source.notes)row.append(researchElement('small',source.notes));
   list.append(row);
  }
  group.append(list);
  root.append(group);
 }
 root.append(researchLink(researchDirectory+'README.md','Read the research package notes'),' · ',
  researchLink(researchDirectory+'measurements_all.csv','Open measurements CSV'));
}
