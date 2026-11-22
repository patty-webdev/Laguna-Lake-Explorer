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
  return {monthly,annual,months,parameters,stations,registry,sources,coverage,stationCounts};
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

function renderResearchArchive({monthly,annual,registry,sources,coverage,stationCounts}){
 const root=$('researchContents');
 root.replaceChildren(researchElement('p',`${monthly.length} monthly station readings and ${annual.length} lake-wide annual average. The archive inventory includes reports with no extracted readings.`));
 root.append(researchElement('h3','Lake-wide annual averages'));
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
