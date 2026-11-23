const researchDirectory='./public/data/Laguna_Lake_Consolidated_Research_2026/';
const researchLabels={
 DO:'Dissolved oxygen',BOD:'Biochemical oxygen demand',pH:'pH',nitrate:'Nitrate',
 phosphate:'Inorganic phosphate',COD:'Chemical oxygen demand',turbidity:'Turbidity',temperature:'Water temperature'
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
function loadResearch(){
 researchRequest??=Promise.all([
  readResearchFile('measurements_all.json').then(response=>response.json()),
  researchCsv('parameters.csv'),researchCsv('stations_2024.csv'),
  researchCsv('source_inventory.csv'),researchCsv('coverage_summary.csv'),researchCsv('station_counts_by_year.csv')
 ]).then(([measurements,parameters,registry,sources,coverage,stationCounts])=>{
  const monthly=measurements.filter(record=>record.record_type==='station_measurement'&&record.temporal_resolution==='monthly');
  const annual=measurements.filter(record=>record.record_type==='lake_annual_average');
  const months=[...new Set(monthly.map(record=>record.period))].sort().reverse();
  const stations=new Map(registry.map(station=>[station.station_id,station]));
  for(const record of monthly)stations.set(record.station_id,record);
  return {measurements,monthly,annual,months,parameters,stations,registry,sources,coverage,stationCounts};
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

function researchDataBrowser({measurements,parameters,registry,sources,coverage,stationCounts}){
 const datasets=[
  ['Measurements','measurements_all.csv',measurements],
  ['Parameters','parameters.csv',parameters],
  ['2024 station register','stations_2024.csv',registry],
  ['Source inventory','source_inventory.csv',sources],
  ['Extraction coverage','coverage_summary.csv',coverage],
  ['Reported station counts','station_counts_by_year.csv',stationCounts]
 ];
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
 for(const file of [...datasets.map(([,file])=>file),'measurements_all.json','README.md']){
  const row=researchElement('li');
  const link=researchLink(researchDirectory+file,file);
  link.download=file;
  row.append(link);
  files.append(row);
 }
 downloads.append(files);
 return [browser,downloads];
}

function renderResearchArchive(dataset){
 const {monthly,annual,registry,sources,coverage,stationCounts}=dataset;
 const root=$('researchContents');
 root.replaceChildren(researchElement('p',`${monthly.length} monthly station readings and ${annual.length} lake-wide annual average. The archive inventory includes reports with no extracted readings.`));
 root.append(...researchDataBrowser(dataset),researchElement('h3','Lake-wide annual averages'));
 for(const record of annual){
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
