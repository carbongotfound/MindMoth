import {HOSTS,ROOT_KEY,canonicalHost,copy,readModel,writeModel,stateFromModel,getState,updateSettings,addUsage,focusAction,resetData,recordClosedTab} from '../lib/state.js';
import {newReview,tickReview,assertReviewReady,assertReviewHeld} from '../lib/review.js';

let queue=Promise.resolve();
function serial(task) {const result=queue.then(task);queue=result.catch(()=>{});return result;}
const extensionOrigin=chrome.runtime.getURL('');
const isUI=s=>s.id===chrome.runtime.id&&s.url?.startsWith(extensionOrigin);
function requireUI(s) {if(!isUI(s))throw Error('This action must be opened from MindMoth.');}
function requireHost(s,host) {
  let actual=null;try{actual=canonicalHost(new URL(s.url).hostname);}catch{}
  if(s.id!==chrome.runtime.id||actual!==host||!HOSTS[host])throw Error('Invalid service origin.');
}
async function foreground(sender) {
  if(!isUI(sender))return false;
  const tabs=await chrome.tabs.query({active:true,lastFocusedWindow:true});
  return tabs.some(t=>t.url?.split('#')[0]===sender.url?.split('#')[0]);
}
function frictionDefault(now) {return {windowStartedAt:now,grants:0,lastGrantAt:0,cooldownUntil:0,lastPurpose:''};}
async function frictionFor(host,now=Date.now()) {
  const key=`friction:${host}`;const record=(await chrome.storage.local.get(key))[key];
  if(!record)return frictionDefault(now);
  // A cooldown survives the hourly attempt-window reset.
  if(now-Number(record.windowStartedAt)>=3600000)return {...frictionDefault(now),cooldownUntil:Math.max(0,Number(record.cooldownUntil)||0)};
  return {...frictionDefault(now),...record};
}
export function cooldownAfterGrantMs(grants,reason,strength='aggressive') {
  if(strength!=='aggressive')return (reason==='scroll'?grants>=2:grants>=3)?300000:0;
  if(reason!=='scroll'&&grants===1)return 0;
  const level=reason==='scroll'?grants:grants-1;
  return level<=1?900000:level===2?1800000:3600000;
}
async function badge(state) {
  await chrome.action.setBadgeBackgroundColor({color:'#7968AE'});
  await chrome.action.setBadgeText({text:state.health<100?String(state.health):''});
  await chrome.action.setTitle({title:`MindMoth · ${state.health} focus health`});
}
async function notify() {
  const state=await getState();await badge(state);
  const tabs=await chrome.tabs.query({});
  await Promise.all(tabs.filter(t=>{try{return canonicalHost(new URL(t.url).hostname);}catch{return false;}}).map(t=>chrome.tabs.sendMessage(t.id,{type:'STATE_CHANGED',state}).catch(()=>{})));
}
async function openDashboard(page='home') {
  const valid=['home','history','focus','blockers','settings','challenges','welcome'];if(!valid.includes(page))page='home';
  const base=chrome.runtime.getURL('dashboard/index.html');const url=base+'#'+page;
  const tabs=await chrome.tabs.query({url:base+'*'});
  if(tabs[0]?.id) {await chrome.tabs.update(tabs[0].id,{active:true,url});await chrome.windows.update(tabs[0].windowId,{focused:true});}
  else await chrome.tabs.create({url});
}
async function reviewRecord(id) {
  const key='review:'+id;const r=(await chrome.storage.local.get(key))[key];
  if(!r||Date.now()-r.createdAt>86400000){await chrome.storage.local.remove(key);throw Error('This review expired. Start a new one.');}return r;
}
async function saveReview(r) {await chrome.storage.local.set({['review:'+r.id]:r});}
async function commitReview(r) {
  let state;
  if(HOSTS[r.target]) {
    const m=await readModel();const cfg=m.settings.protectedSites[r.target];
    cfg.enabled=r.mode!=='off';cfg.pauseUntil=r.mode==='pause'?Date.now()+600000:0;
    await writeModel(m);await chrome.storage.local.remove('session:'+r.target);state=stateFromModel(m);
    if(cfg.pauseUntil)await chrome.alarms.create('mindmoth-resume-'+r.target,{when:cfg.pauseUntil});
  } else if(r.target==='end-focus')state=await focusAction('stop');
  else if(r.target==='reset')state=await resetData();
  else if(r.target==='weaken')state=await updateSettings({interventionStrength:'firm'});
  else throw Error('Unknown review target.');
  await chrome.storage.local.remove('review:'+r.id);await notify();return state;
}
async function handle(message,sender) {
  const {type}=message||{};if(sender.id!==chrome.runtime.id)throw Error('Invalid extension sender.');
  switch(type) {
    case 'GET_APP_STATE':return {state:await getState()};
    case 'OPEN_DASHBOARD':await openDashboard(message.page);return {};
    case 'EXPORT_DATA':requireUI(sender);return {data:await readModel()};
    case 'UPDATE_SETTINGS': {
      requireUI(sender);const patch={};
      if(['dark','light'].includes(message.patch?.theme))patch.theme=message.patch.theme;
      if([15,30,45,60,90,120].includes(message.patch?.dailyGoalMinutes))patch.dailyGoalMinutes=message.patch.dailyGoalMinutes;
      if(message.patch?.interventionStrength==='firm')throw Error('Changing to Firm requires a review.');
      if(message.patch?.interventionStrength==='aggressive')patch.interventionStrength='aggressive';
      if(message.patch?.protectedSites)throw Error('Use the dedicated protection controls.');
      const state=await updateSettings(patch);await notify();return {state};
    }
    case 'ENABLE_SITE': {
      requireUI(sender);if(!HOSTS[message.host])throw Error('Unknown service.');
      const m=await readModel();m.settings.protectedSites[message.host].enabled=true;m.settings.protectedSites[message.host].pauseUntil=0;
      await writeModel(m);await notify();return {state:stateFromModel(m)};
    }
    case 'FOCUS_ACTION': {
      requireUI(sender);if(message.action!=='start')throw Error('Ending focus early requires a review.');
      const state=await focusAction('start',message.minutes);await chrome.alarms.create('mindmoth-focus-end',{when:state.focus.endsAt});await notify();return {state};
    }
    case 'RESET_DATA':throw Error('Resetting data requires a review.');
    case 'START_REVIEW': {
      requireUI(sender);const target=message.target;
      const label=HOSTS[target]||({'end-focus':'Focus session',reset:'Local data',weaken:'Intervention strength'})[target];
      if(!label)throw Error('Unknown review target.');if(!['pause','off'].includes(message.mode))throw Error('Choose a review mode.');
      const r=newReview(target,message.mode,label,message.answers);await saveReview(r);return {review:r};
    }
    case 'GET_REVIEW':requireUI(sender);return {review:await reviewRecord(message.id)};
    case 'READ_REVIEW': {
      requireUI(sender);const r=await reviewRecord(message.id);tickReview(r,message.active===true&&await foreground(sender));await saveReview(r);return {review:r};
    }
    case 'CANCEL_REVIEW':requireUI(sender);await chrome.storage.local.remove('review:'+message.id);return {};
    case 'BEGIN_REVIEW_HOLD': {
      requireUI(sender);const r=await reviewRecord(message.id);assertReviewReady(r,message.phrase);
      if(!await foreground(sender))throw Error('Keep the review tab in the foreground.');
      r.holdStart=Date.now();r.lastHoldAt=r.holdStart;await saveReview(r);return {review:r};
    }
    case 'REVIEW_HOLD_TICK': {
      requireUI(sender);const r=await reviewRecord(message.id);const now=Date.now();
      if(!message.active||!await foreground(sender)||now-r.lastHoldAt>1700)r.holdStart=0;
      r.lastHoldAt=now;await saveReview(r);return {};
    }
    case 'FINISH_REVIEW': {
      requireUI(sender);const r=await reviewRecord(message.id);assertReviewReady(r,message.phrase);assertReviewHeld(r);
      if(!await foreground(sender))throw Error('Keep the review tab in the foreground.');
      return {state:await commitReview(r)};
    }
    case 'GET_DRAFT':
    case 'SAVE_DRAFT':
    case 'CLEAR_DRAFT': {
      requireHost(sender,message.host);if(!Number.isInteger(sender.tab?.id))throw Error('Missing tab.');
      const key=`draft:${sender.tab.id}:${message.host}`;
      if(type==='CLEAR_DRAFT'){await chrome.storage.local.remove(key);return {};}
      if(type==='GET_DRAFT'){
        const item=(await chrome.storage.local.get(key))[key];
        if(!item||Date.now()-item.savedAt>86400000){await chrome.storage.local.remove(key);return {draft:null};}
        return {draft:item.draft};
      }
      const d=message.draft||{};
      if(![0,1,2,3,4,5,6,20,21,22,23,31,32].includes(d.step))throw Error('Invalid intervention step.');
      const draft={step:d.step,intent:String(d.intent||'').slice(0,40),purpose:String(d.purpose||'').slice(0,160),beforeText:String(d.beforeText||'').slice(0,140),afterText:String(d.afterText||'').slice(0,140),requestedSeconds:Math.max(30,Math.min(180,Number(d.requestedSeconds)||30)),reflectionPrompts:Array.isArray(d.reflectionPrompts)?d.reflectionPrompts.slice(0,4).map(t=>String(t).slice(0,240)):null};
      await chrome.storage.local.set({[key]:{draft,savedAt:Date.now()}});return {};
    }
    case 'GET_SESSION': {
      requireHost(sender,message.host);const key='session:'+message.host;const record=(await chrome.storage.local.get(key))[key];
      if(record?.expiresAt<=Date.now())await chrome.storage.local.remove(key);
      return {session:record?.expiresAt>Date.now()?record:null};
    }
    case 'GET_FRICTION':requireHost(sender,message.host);return {friction:await frictionFor(message.host)};
    case 'SET_SESSION': {
      requireHost(sender,message.host);const state=await getState();const now=Date.now();
      if(state.focus.active)throw Error('Focus mode is active.');
      const f=await frictionFor(message.host);const key='session:'+message.host;const previous=(await chrome.storage.local.get(key))[key];
      if(previous?.expiresAt>now)return {session:previous,friction:f};
      if(f.cooldownUntil>now)return {ok:false,blockedUntil:f.cooldownUntil,friction:f,error:'A cooldown is active.'};
      const requested=Number(message.expiresAt)-now;
      if(!Number.isFinite(requested)||requested<=0)throw Error('Invalid visit length.');
      const strength=state.settings.interventionStrength;
      const max=message.reason==='scroll'?30000:strength==='aggressive'?90000:180000;
      const expiresAt=now+Math.min(requested,max);
      f.grants+=1;f.lastGrantAt=now;f.lastPurpose=String(message.purpose||'').slice(0,240);
      const delay=cooldownAfterGrantMs(f.grants,message.reason,strength);if(delay)f.cooldownUntil=expiresAt+delay;
      const session={expiresAt,reason:message.reason,purpose:f.lastPurpose,grantedAt:now,version:4};
      await chrome.storage.local.set({[key]:session,['friction:'+message.host]:f});return {session,friction:f};
    }
    case 'USAGE_TICK': {
      requireHost(sender,message.host);const state=await getState();const s=(await chrome.storage.local.get('session:'+message.host))['session:'+message.host];
      if(!state.focus.active&&s?.expiresAt>Date.now()) {
        const tab=await chrome.tabs.get(sender.tab.id);
        if(tab.active){const next=await addUsage(message.host,message.seconds);await badge(next);}
      }return {};
    }
    case 'CLOSE_TAB': {
      if(sender.tab?.id){await recordClosedTab();await chrome.tabs.remove(sender.tab.id);}return {};
    }
    default:throw Error('Unknown request.');
  }
}
chrome.runtime.onMessage.addListener((m,s,respond)=>{
  serial(()=>handle(m,s)).then(result=>respond({ok:true,...result}),error=>respond({ok:false,error:error.message}));return true;
});
async function clearExpiredEphemera() {
  const all=await chrome.storage.local.get(null),now=Date.now();
  const expired=Object.keys(all).filter(k=>k.startsWith('review:')?now-Number(all[k].createdAt)>86400000:k.startsWith('draft:')?now-Number(all[k].savedAt)>86400000:false);
  if(expired.length)await chrome.storage.local.remove(expired);
}
async function maintenance() {
  await clearExpiredEphemera();
  await chrome.storage.local.setAccessLevel?.({accessLevel:'TRUSTED_CONTEXTS'});
  await chrome.alarms.create('mindmoth-maintenance',{periodInMinutes:1});await notify();
}
chrome.runtime.onInstalled.addListener(info=>serial(async()=>{await maintenance();if(info.reason==='install')await openDashboard('welcome');}));
chrome.runtime.onStartup.addListener(()=>serial(maintenance));
chrome.alarms.onAlarm.addListener(()=>serial(async()=>{await clearExpiredEphemera();await notify();}));

chrome.tabs.onRemoved?.addListener(tabId=>serial(async()=>{const all=await chrome.storage.local.get(null);await chrome.storage.local.remove(Object.keys(all).filter(k=>k.startsWith(`draft:${tabId}:`)));}));
