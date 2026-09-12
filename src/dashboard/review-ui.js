import {request} from '../lib/api.js';
import {esc,clock,icon} from '../lib/ui.js';
import {specificAnswer} from '../lib/review.js';
const dialog=document.querySelector('#review-dialog');
const names={'x.com':'X','instagram.com':'Instagram','tiktok.com':'TikTok','youtube.com':'YouTube','end-focus':'this focus session',reset:'your saved data',weaken:'intervention strength'};
let target='',mode='pause',review=null,interval=0,holding=false,busy=false,onComplete=()=>{};
let holdTimer=0,holdProgress=0,holdStarted=0,done=false,modeHandler=null;
function error(message){const el=dialog.querySelector('#review-error');if(el)el.textContent=message;}
function base(body){return `<div class="review-shell"><aside class="review-art"><span class="eyebrow">A MOMENT, NOT AN IMPULSE</span><h2>The feed can wait.</h2><p>Protection stays on until you finish this review. You can cancel at any point.</p><img src="../assets/scenes/shield.webp" alt="MindMoth holding a leaf shield"></aside><section class="review-body"><button type="button" class="icon-button review-close" id="review-close" aria-label="Cancel and keep protection">${icon('close')}</button>${body}<p id="review-error" role="alert"></p></section></div>`;}
function setupCancel(){dialog.querySelector('#review-close').onclick=cancel;dialog.querySelector('#keep-protection')?.addEventListener('click',cancel);}
function stopTimers(){clearInterval(interval);clearInterval(holdTimer);cancelAnimationFrame(holdProgress);interval=0;holding=false;}
async function cancel(){stopTimers();if(review){await request('CANCEL_REVIEW',{id:review.id}).catch(()=>{});}sessionStorage.removeItem('mindmoth:review');review=null;dialog.close();}
dialog.addEventListener('cancel',event=>{event.preventDefault();cancel();});
function showForm(){
 const isSite=target.includes('.');
 const action=target==='end-focus'?'End focus early?':target==='reset'?'Reset your local data?':target==='weaken'?'Reduce intervention strength?':`Change ${names[target]} protection?`;
 dialog.innerHTML=base(`<span class="eyebrow">PROTECTION REVIEW</span><h1 id="review-title">${action}</h1><p class="review-lead">This is deliberately slower than turning protection back on.</p>
 ${isSite?`<div class="chips mode-chips"><button type="button" class="chip selected" data-mode="pause" aria-pressed="true">Pause for 10 minutes</button><button type="button" class="chip" data-mode="off" aria-pressed="false">Turn off</button></div>`:''}
 <div class="review-requirements" id="review-policy">60 seconds of active reading, a 5 minute cooling-off period, an exact confirmation, and an 8 second hold. Reading counts toward the cooling-off period.</div>
 <form id="review-form"><label class="field">Why do you need this change right now?<textarea id="answer-1" maxlength="320" placeholder="Name the specific task or problem." required></textarea></label><label class="field">What will you do instead of mindless scrolling?<textarea id="answer-2" maxlength="320" placeholder="Describe a concrete plan for this time." required></textarea></label><label class="field">What will make you stop or restore protection?<textarea id="answer-3" maxlength="320" placeholder="Name a clear finish line." required></textarea></label><small>At least four words per answer. Type them yourself.</small><button type="submit" class="button primary full" id="start-review" disabled>Begin review</button></form><button type="button" class="button full" id="keep-protection">Keep protection on</button>`);
 setupCancel();mode='pause';
 dialog.querySelectorAll('[data-mode]').forEach(b=>b.addEventListener('click',()=>{
  mode=b.dataset.mode;dialog.querySelectorAll('[data-mode]').forEach(c=>{c.classList.toggle('selected',c===b);c.setAttribute('aria-pressed',String(c===b));});
  dialog.querySelector('#review-policy').textContent=`60 seconds of active reading, a ${mode==='off'?10:5} minute cooling-off period, an exact confirmation, and an 8 second hold. Reading counts toward the cooling-off period.`;
 }));
 const answers=[1,2,3].map(n=>dialog.querySelector('#answer-'+n));
 answers.forEach(el=>{el.addEventListener('input',()=>dialog.querySelector('#start-review').disabled=!answers.every(a=>specificAnswer(a.value)));for(const type of ['paste','drop'])el.addEventListener(type,e=>e.preventDefault());});
 dialog.querySelector('#review-form').addEventListener('submit',async event=>{
  event.preventDefault();if(busy)return;busy=true;const button=dialog.querySelector('#start-review');button.disabled=true;
  try{review=(await request('START_REVIEW',{target,mode,answers:answers.map(a=>a.value)})).review;sessionStorage.setItem('mindmoth:review',review.id);showWaiting();}catch(e){error(e.message);button.disabled=false;}finally{busy=false;}
 });
}
function ready(){return review&&review.readingMs>=review.policy.readingMs&&Date.now()>=review.readyAt;}
function showWaiting(){
 stopTimers();done=false;
 dialog.innerHTML=base(`<span class="eyebrow">LET THE IMPULSE SETTLE</span><h1 id="review-title">Read before you change it.</h1><div class="review-reading"><p>The reason you installed a blocker still matters when you feel like switching it off.</p><p>A pause can be intentional. An automatic escape is the same habit with one extra button.</p><p>Finish the task you named. A new feed item is not part of that task.</p></div><div class="review-metrics"><div><small>Active reading</small><strong id="reading-time"></strong><progress id="reading-progress" max="60000" value="0" aria-label="Reading progress"></progress></div><div><small>Cooling-off time left</small><strong id="cooling-time"></strong><span>Protection is still on.</span></div></div><p class="quiet">Reading only advances while this tab is visible and focused. The cooling-off timer can run while you do something else.</p><div class="review-own-answer"><small>Your reason</small><p>${esc(review.answers[0])}</p></div><label class="review-check"><input type="checkbox" id="review-ack"><span>I read the reminder and still need the change I named.</span></label><div class="confirmation-area"><label class="field" for="review-phrase">When the timers finish, type this exactly:<code>${esc(review.policy.phrase)}</code></label><input id="review-phrase" type="text" autocomplete="off" spellcheck="false" disabled><button type="button" class="button primary full hold-button" id="review-hold" disabled><span>Hold 8 seconds to confirm</span></button></div><button type="button" class="button full" id="keep-protection">Cancel and keep protection</button>`);
 setupCancel();const phrase=dialog.querySelector('#review-phrase');for(const type of ['paste','drop'])phrase.addEventListener(type,e=>e.preventDefault());
 phrase.addEventListener('input',update);dialog.querySelector('#review-ack').addEventListener('change',update);
 const hold=dialog.querySelector('#review-hold');
 hold.addEventListener('pointerdown',event=>{if(event.button!==0||hold.disabled)return;event.preventDefault();try{hold.setPointerCapture(event.pointerId);}catch{}beginHold();});
 for(const type of ['pointerup','pointercancel','lostpointercapture'])hold.addEventListener(type,endHold);
 hold.addEventListener('keydown',e=>{if([' ','Enter'].includes(e.key)&&!e.repeat){e.preventDefault();beginHold();}});
 hold.addEventListener('keyup',e=>{if([' ','Enter'].includes(e.key)){e.preventDefault();endHold();}});
 window.addEventListener('blur',endHold,{once:true});
 let ticking=false;
 interval=setInterval(async()=>{if(ticking||done)return;ticking=true;try{review=(await request('READ_REVIEW',{id:review.id,active:document.visibilityState==='visible'&&document.hasFocus()})).review;update();}catch(e){error(e.message);}finally{ticking=false;}},1000);update();
}
function update(){if(!review||!dialog.open)return;const read=dialog.querySelector('#reading-time');if(!read)return;
 read.textContent=clock((review.policy.readingMs-review.readingMs)/1000);dialog.querySelector('#reading-progress').value=review.readingMs;
 dialog.querySelector('#cooling-time').textContent=clock((review.readyAt-Date.now())/1000);
 const phrase=dialog.querySelector('#review-phrase');phrase.disabled=!ready();
 const hold=dialog.querySelector('#review-hold');if(!holding)hold.disabled=!ready()||!dialog.querySelector('#review-ack').checked||phrase.value!==review.policy.phrase;
}
async function beginHold(){
 const button=dialog.querySelector('#review-hold');if(holding||button.disabled||done)return;
 holding=true;holdStarted=performance.now();
 try{await request('BEGIN_REVIEW_HOLD',{id:review.id,phrase:dialog.querySelector('#review-phrase').value});if(!holding)return;holdStarted=performance.now();
  let tickBusy=false;
  holdTimer=setInterval(async()=>{if(tickBusy||!holding)return;tickBusy=true;try{await request('REVIEW_HOLD_TICK',{id:review.id,active:document.hasFocus()&&document.visibilityState==='visible'});}catch(e){error(e.message);endHold();}finally{tickBusy=false;}},600);
  const paint=async()=>{
   if(!holding)return;const progress=Math.min(1,(performance.now()-holdStarted)/review.policy.holdMs);button.style.setProperty('--hold',`${progress*100}%`);
   if(progress>=1){done=true;clearInterval(holdTimer);holding=false;button.disabled=true;try{const response=await request('FINISH_REVIEW',{id:review.id,phrase:dialog.querySelector('#review-phrase').value});stopTimers();sessionStorage.removeItem('mindmoth:review');review=null;dialog.close();onComplete(response.state);}catch(e){error(e.message);done=false;button.style.setProperty('--hold','0%');update();}return;}
   holdProgress=requestAnimationFrame(paint);
  };holdProgress=requestAnimationFrame(paint);
 }catch(e){error(e.message);endHold();}
}
function endHold(){if(!holding)return;holding=false;clearInterval(holdTimer);cancelAnimationFrame(holdProgress);dialog.querySelector('#review-hold')?.style.setProperty('--hold','0%');if(review)request('REVIEW_HOLD_TICK',{id:review.id,active:false}).catch(()=>{});}
export function openReview(t,callback){stopTimers();target=t;review=null;onComplete=callback;showForm();if(!dialog.open)dialog.showModal();}
export async function resumeReview(callback){const id=sessionStorage.getItem('mindmoth:review');if(!id)return;try{review=(await request('GET_REVIEW',{id})).review;target=review.target;onComplete=callback;showWaiting();dialog.showModal();update();}catch{sessionStorage.removeItem('mindmoth:review');}}
