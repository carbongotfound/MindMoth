/** Persistent model. Mutations are serialized by the background worker. */
export const ROOT_KEY = 'mindmoth:model:v1';
export const STAGES = [
  {min:90,id:'thriving',label:'Thriving'}, {min:75,id:'healthy',label:'Healthy'},
  {min:60,id:'tired',label:'Tired'}, {min:40,id:'sick',label:'Sick'},
  {min:20,id:'drained',label:'Drained'}, {min:1,id:'critical',label:'Critical'},
  {min:0,id:'gone',label:'Gone'}
];
export const HOSTS = {'x.com':'X','instagram.com':'Instagram','tiktok.com':'TikTok','youtube.com':'YouTube'};
export const DEFAULT_SETTINGS = {
  dailyGoalMinutes:30,interventionStrength:'aggressive',theme:'dark',
  protectedSites:Object.fromEntries(Object.entries(HOSTS).map(([host,label])=>[host,{label,enabled:true,pauseUntil:0}]))
};
export const copy = value => JSON.parse(JSON.stringify(value));
const num = (v,f=0) => Number.isFinite(Number(v)) ? Number(v) : f;
const clamp = (v,a,b) => Math.max(a,Math.min(b,v));
export function localDateKey(date=new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
}
export function totalUsageSeconds(usage={}) { return Object.values(usage).reduce((sum,x)=>sum+Math.max(0,num(x)),0); }
export function healthFromUsage(seconds,minutes) { return Math.round(clamp(100*(1-num(seconds)/(Math.max(5,num(minutes,30))*120)),0,100)); }
export function stageForHealth(health) {return STAGES.find(s=>num(health)>=s.min)||STAGES[6];}
export function canonicalHost(host='') {
  const h=host.toLowerCase().replace(/^www\./,'');
  if(h==='twitter.com'||h.endsWith('.twitter.com')||h==='x.com'||h.endsWith('.x.com')) return 'x.com';
  if(h==='youtu.be')return 'youtube.com';
  return Object.keys(HOSTS).find(x=>h===x||h.endsWith('.'+x))||null;
}
function normalizeSettings(s={}) {
  const out=copy(DEFAULT_SETTINGS);
  out.dailyGoalMinutes=clamp(num(s.dailyGoalMinutes,30),5,480);
  out.theme=['dark','light'].includes(s.theme)?s.theme:'dark';
  out.interventionStrength=['firm','aggressive'].includes(s.interventionStrength)?s.interventionStrength:'aggressive';
  for(const host of Object.keys(HOSTS)) {
    const cfg=s.protectedSites?.[host]||{};
    out.protectedSites[host]={label:HOSTS[host],enabled:cfg.enabled!==false,pauseUntil:Math.max(0,num(cfg.pauseUntil))};
  }
  return out;
}
function empty(now) {
  return {version:2,settings:copy(DEFAULT_SETTINGS),usageByDate:{},goalsByDate:{},eventsByDate:{},
    focus:{active:false,endsAt:null,startedAt:null,minutes:null},createdAt:now,updatedAt:now};
}
export async function readModel(now=Date.now()) {
  const stored=await chrome.storage.local.get([ROOT_KEY,'cachedState']);
  const raw=stored[ROOT_KEY]; const m={...empty(now),...(raw||{})};
  if(!raw&&stored.cachedState?.settings) {
    const legacy=stored.cachedState; m.settings=legacy.settings;
    m.usageByDate[localDateKey(new Date(now))]=legacy.usageToday||{};
    for(const day of legacy.history||[]) if(day.date&&day.usage)m.usageByDate[day.date]=day.usage;
  }
  m.version=2; m.settings=normalizeSettings(m.settings);
  for(const key of ['usageByDate','goalsByDate','eventsByDate'])if(!m[key]||typeof m[key]!=='object'||Array.isArray(m[key]))m[key]={};
  const today=localDateKey(new Date(now));
  m.usageByDate[today] ||= {}; m.goalsByDate[today] ??= m.settings.dailyGoalMinutes;
  m.eventsByDate[today] ||= {focusSessions:0,focusSeconds:0,closedTabs:0};
  m.focus={active:false,endsAt:null,startedAt:null,minutes:null,...(m.focus||{})};
  if(m.focus.active&&num(m.focus.endsAt)<=now) {
    const date=localDateKey(new Date(num(m.focus.endsAt,now)));
    m.eventsByDate[date] ||= {focusSessions:0,focusSeconds:0,closedTabs:0};
    m.eventsByDate[date].focusSessions+=1;
    m.eventsByDate[date].focusSeconds+=clamp(num(m.focus.minutes)*60,0,14400);
    m.focus={active:false,endsAt:null,startedAt:null,minutes:null};
  }
  for(const key of Object.keys(m.settings.protectedSites)) {
    const s=m.settings.protectedSites[key];if(s.pauseUntil&&s.pauseUntil<=now)s.pauseUntil=0;
  }
  for(const key of ['usageByDate','goalsByDate','eventsByDate']){
    const dates=Object.keys(m[key]).sort().reverse(); for(const d of dates.slice(90))delete m[key][d];
  }
  if(JSON.stringify(raw)!==JSON.stringify(m))await chrome.storage.local.set({[ROOT_KEY]:m});
  return m;
}
export async function writeModel(model,now=Date.now()) {model.updatedAt=now;await chrome.storage.local.set({[ROOT_KEY]:model});return model;}
export function stateFromModel(m,now=Date.now()) {
  const date=localDateKey(new Date(now));const settings=copy(m.settings);
  for(const cfg of Object.values(settings.protectedSites)) {
    cfg.configuredEnabled=cfg.enabled;cfg.paused=cfg.enabled&&cfg.pauseUntil>now;cfg.enabled=cfg.enabled&&!cfg.paused;
  }
  const usageToday=copy(m.usageByDate[date]||{});const total=totalUsageSeconds(usageToday);const health=healthFromUsage(total,settings.dailyGoalMinutes);
  const history=Object.keys(m.usageByDate).filter(d=>d<date).sort().map(d=>{
    const usage=m.usageByDate[d];const totalSeconds=totalUsageSeconds(usage);const goal=m.goalsByDate[d]??30;
    return {date:d,usage:copy(usage),totalSeconds,goalMinutes:goal,health:healthFromUsage(totalSeconds,goal),withinGoal:totalSeconds<=goal*60};
  });
  return {version:2,date,settings,usageToday,totalUsageSeconds:total,health,stage:stageForHealth(health),
    history,eventsByDate:copy(m.eventsByDate),focus:copy(m.focus),createdAt:m.createdAt};
}
export async function getState(now=Date.now()) {return stateFromModel(await readModel(now),now);}
export async function updateSettings(patch={}) {
  const m=await readModel();m.settings=normalizeSettings({...m.settings,...patch,
    protectedSites:{...m.settings.protectedSites,...patch.protectedSites}});
  m.goalsByDate[localDateKey()]=m.settings.dailyGoalMinutes;
  await writeModel(m);return stateFromModel(m);
}
export async function addUsage(host,seconds,now=Date.now()) {
  if(!HOSTS[host])throw Error('Unknown service');const m=await readModel(now);const d=localDateKey(new Date(now));
  m.usageByDate[d][host]=num(m.usageByDate[d][host])+clamp(num(seconds),0,10);
  await writeModel(m,now);return stateFromModel(m,now);
}
export async function recordClosedTab() {
  const m=await readModel();m.eventsByDate[localDateKey()].closedTabs+=1;await writeModel(m);
}
export async function focusAction(action,minutes=25) {
  const m=await readModel();
  if(action==='start') {
    if(m.focus.active)throw Error('A focus session is already running.');
    const value=clamp(num(minutes,25),1,240);const now=Date.now();
    m.focus={active:true,startedAt:now,endsAt:now+value*60000,minutes:value};
    const keys=await chrome.storage.local.get(null);
    await chrome.storage.local.remove(Object.keys(keys).filter(k=>k.startsWith('session:')));
  } else m.focus={active:false,endsAt:null,startedAt:null,minutes:null};
  await writeModel(m);return stateFromModel(m);
}
export async function resetData() {
  const data=await chrome.storage.local.get(null);
  await chrome.storage.local.remove(Object.keys(data).filter(k=>k===ROOT_KEY||k==='cachedState'||k.startsWith('review:')||k.startsWith('session:')||k.startsWith('friction:')||k.startsWith('draft:')));
  return getState();
}
