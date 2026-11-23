const tutorialSteps=[
 {
  title:'Explore Laguna de Bay',
  targets:['.location-list','#panelToggle','#map'],
  text:'Drag the satellite map to move around and scroll to zoom. Use the lake and bay buttons in the sidebar to fly to a viewpoint.',
  detail:'Use W, A, S, and D to move with the keyboard. Reset view returns to the lake overview.',
  mobileText:'Drag to move around the satellite map and pinch to zoom. Open Map tools to fly to the lake and bay viewpoints.',
  mobileDetail:'The reset button returns to the lake overview.'
 },
 {
  title:'Change the camera and terrain',
  targets:['.mode-group','#panelToggle','#terrain','#consoleWaterQuality'],
  text:'The map opens in a tilted view with 3D Terrain on. Choose Top-down to look straight down, or use the 3D Terrain button to hide or show elevation.',
  detail:'Right-drag or use Q and E to rotate. Use R and F to tilt.',
  mobileDetail:'Open Map tools for the camera buttons. Twist with two fingers to rotate the map.'
 },
 {
  title:'Compare water-quality readings',
  targets:['#consoleWaterQuality','#panelToggle'],
  text:'Choose Water Quality in the Exploration Console for a flat map. Pick a parameter and sampling month, then choose Station readings or Relative heatmap.',
  detail:'Station colors show how individual readings compare with the Class C guideline. The heatmap shows relative intensity around mapped stations.'
 },
 {
  title:'Focus on a monitoring station',
  targets:['#focusStation','#exploreFocusStation','#panelToggle','#consoleWaterQuality'],
  text:'Choose a monitoring station and click Focus station to zoom to its location. Click a map point to see its reading, review status, and source report.',
  detail:'The Reported readings list includes stations whose coordinates are unavailable.'
 },
 {
  title:'Check the research sources',
  targets:['#research'],
  text:'Open Research in the header to see the lake-wide annual average, station register, coverage, and LLDA archive links.',
  detail:'The readings are historical. Check the review status before using a reading.'
 }
];

function initializeTutorial(){
 const dialog=$('tutorialDialog'),title=$('tutorialTitle'),progress=$('tutorialProgress');
 const spotlight=$('tutorialSpotlight');
 const back=$('tutorialBack'),next=$('tutorialNext'),help=$('helpDialog');
 const storageKey='laguna-lake-tutorial-seen';
 let step=0,reopened=false;
 function currentTarget(){
  return tutorialSteps[step].targets.map(selector=>document.querySelector(selector))
   .find(element=>element?.getClientRects().length);
 }
 function positionSpotlight(){
  if(!dialog.open)return;
  const target=currentTarget();
  if(!target)return;
  const bounds=target.getBoundingClientRect();
  const left=Math.max(4,bounds.left-6);
  const top=Math.max(4,bounds.top-6);
  const right=Math.min(window.innerWidth-4,bounds.right+6);
  const bottom=Math.min(window.innerHeight-4,bounds.bottom+6);
  Object.assign(spotlight.style,{
   left:`${left}px`,top:`${top}px`,width:`${Math.max(0,right-left)}px`,height:`${Math.max(0,bottom-top)}px`
  });
  const card=dialog.getBoundingClientRect();
  const roomOnRight=window.innerWidth-right-16;
  const roomOnLeft=left-16;
  const roomBelow=window.innerHeight-bottom-16;
  const roomAbove=top-16;
  let x=(window.innerWidth-card.width)/2,y=(window.innerHeight-card.height)/2;
  if(roomOnRight>=card.width)x=right+16;
  else if(roomOnLeft>=card.width)x=left-card.width-16;
  else if(roomBelow>=card.height)y=bottom+16;
  else if(roomAbove>=card.height)y=top-card.height-16;
  else if(bounds.height<window.innerHeight*.7)y=roomAbove>roomBelow?12:window.innerHeight-card.height-12;
  dialog.style.left=`${Math.max(8,x)}px`;
  dialog.style.top=`${Math.max(8,y)}px`;
  spotlight.hidden=false;
 }
 function render(){
  const current=tutorialSteps[step];
  title.textContent=current.title;
  progress.textContent=`Step ${step+1} of ${tutorialSteps.length}`;
  const mobile=window.matchMedia(mobileLayout).matches;
  $('tutorialText').textContent=(mobile&&current.mobileText)||current.text;
  $('tutorialDetail').textContent=(mobile&&current.mobileDetail)||current.detail;
  back.disabled=step===0;
  next.textContent=step===tutorialSteps.length-1?'Finish':'Next';
  currentTarget()?.scrollIntoView({block:'nearest',inline:'nearest',behavior:'instant'});
  positionSpotlight();
  title.focus({preventScroll:true});
 }
 function open(fromControls){
  reopened=fromControls;
  step=0;
  dialog.showModal();
  render();
 }
 back.addEventListener('click',()=>{
  if(step===0)return;
  step--;
  render();
 });
 next.addEventListener('click',()=>{
  if(step===tutorialSteps.length-1){
   dialog.close();
   return;
  }
  step++;
  render();
 });
 $('tutorialSkip').addEventListener('click',()=>dialog.close());
 dialog.addEventListener('close',()=>{
  spotlight.hidden=true;
  try{localStorage.setItem(storageKey,'yes');}catch(error){/* Storage can be disabled. */}
  if(reopened)$('help').focus();
 });
 window.addEventListener('resize',positionSpotlight);
 window.addEventListener('scroll',positionSpotlight,true);
 $('startTutorial').addEventListener('click',()=>{
  help.close();
  open(true);
 });
 let seen=false;
 try{seen=localStorage.getItem(storageKey)==='yes';}catch(error){/* Storage can be disabled. */}
 if(!seen)document.addEventListener('explorer:ready',()=>open(false),{once:true});
}

initializeTutorial();
