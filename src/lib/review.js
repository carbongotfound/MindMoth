/** Deliberate friction, not anti-uninstall software. Pure rules are independently tested. */
export const REVIEW_READING_MS=60000;
export const REVIEW_HOLD_MS=8000;
export function specificAnswer(text) {
  const words=String(text||'').trim().split(/\s+/);
  return text?.length>=18&&text.length<=320&&words.length>=4&&new Set(words.map(w=>w.toLowerCase())).size>=3;
}
export function reviewPolicy(target,mode,label) {
  const permanent=mode==='off';
  return {waitMs:permanent?600000:300000,readingMs:REVIEW_READING_MS,holdMs:REVIEW_HOLD_MS,
    phrase:target==='end-focus'?'I choose to end my focus session early.':target==='reset'?'I choose to reset my MindMoth data.':target==='weaken'?'I choose less friction for future visits.':
      `I choose to ${permanent?'turn off':'pause'} ${label} protection.`};
}
export function newReview(target,mode,label,answers,now=Date.now()) {
  if(!Array.isArray(answers)||answers.length!==3||!answers.every(specificAnswer))throw Error('Write three specific answers, each at least four words.');
  return {id:crypto.randomUUID(),target,mode,label,answers:answers.map(s=>s.trim()),createdAt:now,
    readyAt:now+reviewPolicy(target,mode,label).waitMs,readingMs:0,lastReadAt:0,holdStart:0,lastHoldAt:0,
    policy:reviewPolicy(target,mode,label)};
}
export function tickReview(review,active,now=Date.now()) {
  if(active&&review.lastReadAt&&now-review.lastReadAt<=2000)review.readingMs=Math.min(review.policy.readingMs,review.readingMs+Math.max(0,now-review.lastReadAt));
  review.lastReadAt=active?now:0;return review;
}
export function assertReviewReady(review,phrase,now=Date.now()) {
  if(now<review.readyAt)throw Error('The cooling-off period has not ended.');
  if(review.readingMs<review.policy.readingMs)throw Error('Finish the active reading period first.');
  if(phrase!==review.policy.phrase)throw Error('Type the confirmation exactly as shown.');
}
export function assertReviewHeld(review,now=Date.now()) {
  if(!review.holdStart||now-review.holdStart<review.policy.holdMs||now-review.lastHoldAt>1700)throw Error('Hold continuously for eight seconds.');
}
