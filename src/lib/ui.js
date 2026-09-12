export const REPO='https://github.com/carbongotfound/MindMoth';
export const SERVICES=[['x.com','X','x'],['instagram.com','Instagram','instagram'],['tiktok.com','TikTok','tiktok'],['youtube.com','YouTube','youtube']];
export const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
export function minutes(s=0) {const m=Math.floor(Number(s)/60);return m<60?`${m}m`:`${Math.floor(m/60)}h${m%60?' '+m%60+'m':''}`;}
export function clock(s=0){const value=Math.max(0,Math.ceil(s));return `${String(Math.floor(value/60)).padStart(2,'0')}:${String(value%60).padStart(2,'0')}`;}
export function logo(key,label) {return `<span class="service-logo logo-${key}"><img src="../assets/brands/${key}.png" alt="${esc(label)}"></span>`;}
const paths={
 home:'<path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z"/>',
 chart:'<path d="M5 20V11m7 9V4m7 16V8"/>',
 settings:'<path d="m9 3-1 3-3 1-2 3 2 3-1 3 3 2 3-1 2 3 3-1 1-3 3-1 2-3-2-3 1-3-3-2-3 1-2-3z"/><circle cx="12" cy="12" r="3"/>',
 shield:'<path d="M12 3 3 7v6c0 5 9 9 9 9s9-4 9-9V7z"/><path d="m8 12 3 3 5-6"/>',
 leaf:'<path d="M20 3C7 2 2 7 4 16c9 4 16-1 16-13zM4 20 16 8"/>',
 arrow:'<path d="M4 12h16m-6-6 6 6-6 6"/>',
 clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l4 2"/>',
 close:'<path d="m6 6 12 12M6 18 18 6"/>',
 play:'<path d="m8 4 12 8-12 8z" fill="currentColor" stroke="none"/>',
 check:'<path d="m4 12 5 5L20 6"/>',
 lock:'<rect x="5" y="10" width="14" height="11" rx="3"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
 heart:'<path d="M12 21C-4 11 4-3 12 6c8-9 16 5 0 15z"/>',
 book:'<path d="M12 5C7 2 2 3 2 3v16s5-1 10 2c5-3 10-2 10-2V3s-5-1-10 2v16"/>',
 gift:'<path d="M3 9h18v4H3zM5 13v8h14v-8M12 9v12"/><path d="M12 9C0 7 9-4 12 9c3-13 12-2 0 0z"/>',
 sun:'<circle cx="12" cy="12" r="4"/><path d="M12 1v2m0 18v2M1 12h2m18 0h2M4 4l2 2m12 12 2 2M4 20l2-2M18 6l2-2"/>',
 flame:'<path d="M12 2c0 7-5 6-5 11-1-2-2-3-3-3-5 15 21 16 16 0-1 2-2 3-3 3 1-6-3-6-5-11z"/>',
 download:'<path d="M12 3v13m-5-5 5 5 5-5M4 17v4h16v-4"/>',
 github:'<path d="M8 21v-4c-6 2-6-3-7-3m15 7v-4c0-1 0-2-1-2 4-1 6-2 6-6 0-2-1-3-2-4 0-1 0-3-1-3-3 0-4 2-6 2S9 2 6 2C5 2 5 4 5 5 4 6 3 7 3 9c0 4 2 5 6 6-1 1-1 2-1 2"/>'
};
export function icon(name,cls=''){return `<svg class="icon ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name]||paths.leaf}</svg>`;}
export function stats(state) {
 const byDate=new Map(state.history.map(d=>[d.date,d]));
 const d=new Date(state.date+'T12:00:00');let streak=0;
 d.setDate(d.getDate()-1);
 const key=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
 for(let i=0;i<90;i++){const day=byDate.get(key(d));if(!day?.withinGoal)break;streak++;d.setDate(d.getDate()-1);}
 const monday=new Date(state.date+'T12:00:00');monday.setDate(monday.getDate()-(monday.getDay()+6)%7);
 const week=Array.from({length:7},(_,i)=>{const date=new Date(monday);date.setDate(date.getDate()+i);const k=key(date);const day=byDate.get(k);return {date:k,label:date.toLocaleDateString('en',{weekday:'short'}),status:k>state.date?'future':k===state.date?'today':!day?'untracked':day.withinGoal?'done':'over'};});
 const totals=Object.values(state.eventsByDate||{}).reduce((s,e)=>({focusSessions:s.focusSessions+(e.focusSessions||0),focusSeconds:s.focusSeconds+(e.focusSeconds||0),closedTabs:s.closedTabs+(e.closedTabs||0)}),{focusSessions:0,focusSeconds:0,closedTabs:0});
 const achievements=[
  {id:'steady',title:'7 steady days',detail:'Finish seven consecutive recorded days within your daily goal.',current:streak,total:7,tone:'peach',icon:'leaf'},
  {id:'focus',title:'Find your focus',detail:'Complete five focus sessions. Ending early does not count.',current:totals.focusSessions,total:5,tone:'cream',icon:'book'},
  {id:'hour',title:'One quieter hour',detail:'Finish a total of 60 minutes in completed focus sessions.',current:Math.floor(totals.focusSeconds/60),total:60,tone:'lavender',icon:'clock'},
  {id:'leave',title:'Choose to leave',detail:'Use “Close instead” on the blocker ten times.',current:totals.closedTabs,total:10,tone:'mint',icon:'heart'}
 ];
 return {streak,week,totals,achievements};
}
