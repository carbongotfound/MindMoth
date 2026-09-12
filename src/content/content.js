(() => {
  if (window.top !== window) return;

  const CORE = ['x.com','twitter.com','instagram.com','youtube.com','youtu.be','tiktok.com'];
  const rawHost = location.hostname.toLowerCase().replace(/^www\./, '');
  const canonical = rawHost === 'twitter.com' || rawHost.endsWith('.twitter.com') || rawHost.endsWith('.x.com')
    ? 'x.com'
    : rawHost.endsWith('.instagram.com')
      ? 'instagram.com'
      : (rawHost.endsWith('.youtube.com') || rawHost === 'youtu.be')
        ? 'youtube.com'
        : rawHost.endsWith('.tiktok.com')
          ? 'tiktok.com'
          : rawHost;

  let appState = null;
  let siteConfig = null;
  let hostEl = null;
  let shadow = null;
  let activeSession = null;
  let friction = null;
  let tickTimer = null;
  let timerLoop = null;
  let lockObserver = null;
  let waitCleanup = null;
  let flowGeneration = 0;
  let starting = false;
  let syncPending = false;

  let step = 1;
  let intent = null;
  let purpose = '';
  let beforeText = '';
  let afterText = '';
  let requestedSeconds = 120;
  let reflectionPrompts = null;
  const DRAFT_KEY = `mindmoth:draft:${canonical}`;

  const isCore = CORE.some(h => rawHost === h || rawHost.endsWith(`.${h}`));
  if (isCore) lockPageImmediately();

  function msg(payload) {
    return new Promise(resolve => {
      try { chrome.runtime.sendMessage(payload, response => {
        const error = chrome.runtime.lastError;
        resolve(error ? {ok:false,error:error.message} : response);
      }); } catch(error) { resolve({ok:false,error:error.message}); }
    });
  }

  function suppressWebsiteInput(event) {
    if (!document.documentElement.hasAttribute('data-mindmoth-locked')) return;
    const path = event.composedPath ? event.composedPath() : [];
    const target = event.target;
    const targetRoot = target?.getRootNode?.();
    if (hostEl && (path.includes(hostEl) || target === hostEl || hostEl.contains?.(target) || targetRoot === shadow)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
  }

  [
    'click', 'dblclick', 'pointerdown', 'pointerup', 'mousedown', 'mouseup',
    'touchstart', 'touchmove', 'wheel', 'keydown', 'keypress', 'contextmenu'
  ].forEach(type => {
    document.addEventListener(type, suppressWebsiteInput, { capture: true, passive: false });
  });

  function saveDraft() {
    msg({type:'SAVE_DRAFT',host:canonical,draft:{step,intent,purpose,beforeText,afterText,requestedSeconds,reflectionPrompts}});
  }
  async function loadDraft() {
    const result=await msg({type:'GET_DRAFT',host:canonical});return result?.draft||null;
  }
  function clearDraft() {
    msg({type:'CLEAR_DRAFT',host:canonical});
    // Remove older versions' website-sessionStorage copy, but never reuse it.
    try {sessionStorage.removeItem(DRAFT_KEY);} catch {}
  }

  function intentionChoices() {
    if (canonical === 'youtube.com') return [
      ['watch', 'Watch one specific video'],
      ['search', 'Search for an answer or tutorial'],
      ['channel', 'Check one specific channel'],
      ['manage', 'Upload or manage my own video'],
      ['scroll', 'Just scroll']
    ];
    if (canonical === 'tiktok.com') return [
      ['post', 'Post something'],
      ['reply', 'Reply to someone'],
      ['find', 'Find one specific video'],
      ['search', 'Search for one specific thing'],
      ['scroll', 'Just scroll']
    ];
    if (canonical === 'instagram.com') return [
      ['messages', 'Read or reply to messages'],
      ['post', 'Post something'],
      ['find', 'Find one specific account or post'],
      ['notification', 'Check one notification'],
      ['scroll', 'Just scroll']
    ];
    return [
      ['messages', 'Read or reply to one message'],
      ['post', 'Post something'],
      ['find', 'Find one specific account or post'],
      ['notification', 'Check one notification or thread'],
      ['scroll', 'Just scroll']
    ];
  }

  function intentLabel() {
    return intentionChoices().find(([value]) => value === intent)?.[1] || 'Use the site';
  }

  function chooseReflectionPrompts() {
    const sets = [
      [
        `What were you doing immediately before opening ${siteName()}?`,
        `What will you do immediately after your ${siteName()} task is finished?`,
        'Working on my code',
        'Go back to fixing the login bug'
      ],
      [
        `Why does this need ${siteName()} right now instead of later?`,
        'What exact event will make you close the site?',
        'I need the answer for the thing I am doing now',
        'The message is sent and I return to my task'
      ],
      [
        `What would happen if you did not open ${siteName()} right now?`,
        'What is the first thing you will do when the timer ends?',
        'I would have to continue without checking this',
        'Close the tab and return to the project'
      ],
      [
        'What problem are you trying to solve with this visit?',
        'How will you know the visit has become scrolling instead of the task?',
        'I need one specific piece of information',
        'When I stop following the exact thing I came for'
      ]
    ];
    return sets[Math.floor(Math.random() * sets.length)];
  }

  function purposePlaceholder() {
    if (canonical === 'youtube.com') {
      if (intent === 'watch') return 'Watch the Blender lighting tutorial I already chose';
      if (intent === 'search') return 'Find how to fix my ESP32 serial error';
      if (intent === 'channel') return 'Check the newest video from one channel';
      if (intent === 'manage') return 'Upload my finished project video';
    }
    if (canonical === 'tiktok.com') {
      if (intent === 'post') return 'Upload the clip I already edited';
      if (intent === 'reply') return 'Reply to the comment from Sam';
      if (intent === 'find') return 'Find the specific camera tutorial I need';
      if (intent === 'search') return 'Search for one recipe and leave';
    }
    if (intent === 'messages') return 'Reply to Sam about tomorrow';
    if (intent === 'post') return 'Post the update I already wrote';
    if (intent === 'notification') return 'Read the reply notification from Alex';
    return 'Find the post about the model release';
  }

  function lockPageImmediately() {
    document.documentElement.setAttribute('data-mindmoth-locked', 'true');
    if (!document.getElementById('mindmoth-lock-style')) {
      const s = document.createElement('style');
      s.id = 'mindmoth-lock-style';
      s.textContent = `
        html[data-mindmoth-locked], html[data-mindmoth-locked] body { overflow:hidden!important; }
        html[data-mindmoth-locked] body { overscroll-behavior:none!important; }
      `;
      (document.head || document.documentElement).appendChild(s);
    }
    const applyInert = () => {
      if (!document.body) return;
      if (document.documentElement.hasAttribute('data-mindmoth-locked')) {
        document.body.inert = true;
        document.querySelectorAll('video,audio').forEach(media => { if(!media.paused) media.pause(); });
      }
    };
    applyInert();
    if (!lockObserver) {
      lockObserver = new MutationObserver(applyInert);
      lockObserver.observe(document.documentElement, { childList: true, subtree: true });
    }
  }

  function unlockPage() {
    document.documentElement.removeAttribute('data-mindmoth-locked');
    if (lockObserver) {
      lockObserver.disconnect();
      lockObserver = null;
    }
    if (document.body) {
      document.body.inert = false;
      document.body.removeAttribute('inert');
    }
    if (waitCleanup) { waitCleanup(); waitCleanup = null; }
    hostEl?.remove();
    hostEl = null;
    shadow = null;
  }

  function matchesProtected(host, sites) {
    const keys = Object.keys(sites || {});
    return keys.find(key => host === key || host.endsWith(`.${key}`));
  }

  async function bootstrap() {
    const resp = await msg({ type: 'GET_APP_STATE' });
    if(!resp?.ok || !resp.state) {
      lockPageImmediately();
      render(`<h1>MindMoth needs to reconnect.</h1><p class="sub">Reload the extension from your browser’s extensions page, then refresh this tab. Your saved data is not deleted.</p><button class="secondary" id="retry-connection">Try again</button>`);
      shadow.querySelector('#retry-connection').onclick=bootstrap;return;
    }
    appState = resp.state;
    const key = matchesProtected(canonical, appState?.settings?.protectedSites);
    siteConfig = key ? appState.settings.protectedSites[key] : null;

    if (!siteConfig?.enabled && !appState?.focus?.active) {
      clearDraft();
      unlockPage();
      return;
    }

    if (!document.documentElement.hasAttribute('data-mindmoth-locked')) lockPageImmediately();

    activeSession = (await msg({ type: 'GET_SESSION', host: canonical }))?.session || null;
    friction = (await msg({ type: 'GET_FRICTION', host: canonical }))?.friction || { grants: 0, cooldownUntil: 0 };

    if (appState.focus?.active) {
      clearDraft();
      showFocusBlock();
      return;
    }

    if (activeSession && activeSession.expiresAt > Date.now()) {
      clearDraft();
      beginAllowedSession();
      return;
    }

    if (friction.cooldownUntil > Date.now()) {
      clearDraft();
      showCooldownBlock();
      return;
    }

    const draft = await loadDraft();
    if (draft && typeof draft.step === 'number') {
      step = draft.step;
      intent = draft.intent || null;
      purpose = draft.purpose || '';
      beforeText = draft.beforeText || '';
      afterText = draft.afterText || '';
      requestedSeconds = Number(draft.requestedSeconds || requestedSeconds);
      reflectionPrompts = Array.isArray(draft.reflectionPrompts) ? draft.reflectionPrompts : chooseReflectionPrompts();
      renderStep();
      return;
    }

    showIntervention();
  }

  function ensureHost() {
    if (hostEl) return;
    hostEl = document.createElement('div');
    hostEl.id = 'mindmoth-overlay-host';
    hostEl.style.cssText = [
      'position:fixed!important', 'inset:0!important', 'width:100vw!important',
      'height:100vh!important', 'z-index:2147483647!important', 'display:block!important',
      'pointer-events:auto!important', 'isolation:isolate!important', 'touch-action:auto!important'
    ].join(';');
    shadow = hostEl.attachShadow({ mode: 'open' });
    // Let MindMoth controls receive their events normally, then stop those
    // events at the host before the protected website can react to them.
    const isolateOverlayEvent = event => {
      event.stopPropagation();
    };
    ['click','dblclick','pointerdown','pointerup','mousedown','mouseup','touchstart','touchmove','wheel','keydown','keypress','keyup','input','change','contextmenu','submit'].forEach(type => {
      hostEl.addEventListener(type, isolateOverlayEvent, { capture: false });
    });
    document.documentElement.appendChild(hostEl);
  }

  function mascot(stage = 'healthy') {
    const aliases = { rotting:'drained', dead:'gone' };
    const safe = aliases[stage] || stage;
    const allowed = new Set(['thriving','healthy','tired','sick','drained','critical','gone']);
    const finalStage = allowed.has(safe) ? safe : 'healthy';
    const src = chrome.runtime.getURL(`assets/mascots/${finalStage}.png`);
    return `<img class="moth-img moth-${finalStage}" src="${src}" alt="${finalStage} MindMoth mascot">`;
  }

  const css = ":host{all:initial;--mm-text:#30223f;--mm-muted:#776986;--mm-panel:#fffdf9;--mm-field:#fff;--mm-line:#e9e1ed;--mm-purple:#785ba7;--mm-soft:#f0e7ff}*{box-sizing:border-box}button,input{font:inherit}.veil{position:fixed;inset:0;z-index:2147483647;display:grid;place-items:center;padding:20px;background:#171424de;backdrop-filter:blur(18px);font:15px/1.5 \"Segoe UI\",system-ui,sans-serif;color:var(--mm-text)}.panel{width:min(1040px,calc(100vw - 40px));max-height:calc(100vh - 40px);border-radius:27px;overflow:auto;background:var(--mm-panel);border:1px solid var(--mm-line);box-shadow:0 25px 100px #0006;padding:0;position:relative}.top{display:flex;align-items:center;justify-content:space-between;padding:18px 24px;border-bottom:1px solid var(--mm-line);gap:14px}.brand{display:flex;align-items:center;gap:10px;font-size:23px;font-weight:850;letter-spacing:-.035em}.brand-mark{width:43px;height:42px;object-fit:contain}.badge{display:inline-flex;align-items:center;gap:9px;border-radius:99px;background:#e1f2df;color:#2b7246;padding:9px 13px;font-size:12px;font-weight:650}.badge-logo{width:19px;height:19px;object-fit:contain;background:#000;border-radius:5px}.blocker-layout{display:grid;grid-template-columns:285px minmax(0,1fr)}.blocker-art{background:linear-gradient(160deg,#e6def8,#e3f1da);padding:27px 21px;color:#493853;display:flex;flex-direction:column;gap:14px;position:relative}.art-eyebrow{font-size:9px;letter-spacing:.2em;color:#847392;font-weight:700}.blocker-art h2{font-size:29px;line-height:1.18;margin:0;letter-spacing:-.035em}.blocker-art p{font-size:13px;color:#85718d;margin:0}.blocker-art img{width:100%;border-radius:20px;margin:auto 0;display:block}.blocker-art .art-footer{font-size:11px;line-height:1.5;color:#77647e}.blocker-main{padding:22px 26px}.step{padding:0;margin:0;animation:fadeStep .16s ease}.mascot-wrap{display:none}.moth-img{display:none}h1{font-size:31px;line-height:1.13;letter-spacing:-.035em;font-weight:800;margin:0 0 13px;color:var(--mm-text)}.sub{margin:0 0 18px;color:var(--mm-muted);font-size:14px;line-height:1.55}.muted,.counter{color:var(--mm-muted);font-size:11px}.counter{margin-top:12px}.grid{display:grid;grid-template-columns:1fr;gap:10px}.choice{display:flex;align-items:center;justify-content:space-between;gap:12px;border:1px solid var(--mm-line);border-radius:14px;padding:14px 15px;min-height:50px;background:var(--mm-field);color:var(--mm-text);text-align:left;font-weight:650;font-size:14px;cursor:pointer;transition:border-color .16s,background .16s}.choice:hover{border-color:var(--mm-purple);background:var(--mm-soft)}.choice.danger-choice{border-style:dashed;color:var(--mm-muted)}button:focus-visible,input:focus-visible,a:focus-visible{outline:3px solid var(--mm-purple);outline-offset:3px}.field{display:grid;gap:7px;margin:12px 0;text-align:left}.field label{font-size:12px;font-weight:700;color:var(--mm-text)}.field input{width:100%;border:1px solid var(--mm-line);border-radius:12px;padding:13px;background:var(--mm-field);color:var(--mm-text);font-size:14px;outline-offset:2px}.field small{font-size:11px;color:var(--mm-muted)}.primary,.secondary{display:flex;justify-content:center;align-items:center;width:100%;gap:8px;min-height:48px;padding:12px 16px;border-radius:14px;margin-top:11px;font-size:14px;font-weight:700;cursor:pointer}.primary{background:#9279c5;color:white;border:1px solid transparent}.primary:disabled{background:var(--mm-line);color:var(--mm-muted);cursor:not-allowed;opacity:.8}.secondary{background:var(--mm-soft);color:var(--mm-purple);border:1px solid var(--mm-line)}.primary:hover:not(:disabled){background:#8065b4}.secondary:hover{border-color:var(--mm-purple)}.close{display:block;margin:13px auto 0;padding:7px;background:transparent;color:var(--mm-muted);border:0;text-decoration:underline;font-size:13px;cursor:pointer}.attention-receipt{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:12px 0}.attention-receipt>div{padding:11px;background:var(--mm-soft);border-radius:13px}.attention-receipt span{display:block;font-size:9px;color:var(--mm-muted)}.attention-receipt b{display:block;font-size:20px;color:var(--mm-text);margin-top:5px}.warning{background:var(--mm-soft);border:1px solid var(--mm-line);color:var(--mm-text);padding:12px;border-radius:14px;font-size:12px;line-height:1.5;margin:13px 0}.wait-mini{font-size:11px;color:var(--mm-muted);margin:11px 0}.wait-mini span{font-weight:750}.receipt-list{display:grid;gap:9px}.receipt-list label,.reading-confirm{display:flex;align-items:flex-start;gap:10px;font-size:12px;color:var(--mm-muted);border:1px solid var(--mm-line);border-radius:13px;padding:12px;cursor:pointer}.receipt-list input,.reading-confirm input{width:17px;height:17px;margin:2px 0;flex:none;accent-color:var(--mm-purple)}.reading-card{padding:19px;border:1px solid var(--mm-line);background:var(--mm-soft);border-radius:17px;margin:13px 0}.reading-label{font-size:9px;font-weight:750;letter-spacing:.17em;color:var(--mm-purple)}.reading-card p{margin:12px 0 0;font-size:14px;line-height:1.65;color:var(--mm-text)}.wait-box{width:165px;height:165px;margin:25px auto;position:relative;display:grid;place-items:center;border-radius:50%;text-align:center;background:var(--mm-field)}.wait-box:before{content:\"\";position:absolute;inset:0;border-radius:50%;background:conic-gradient(#b19cde var(--wait-progress,0deg),var(--mm-line) 0);mask:radial-gradient(circle,transparent 63%,#000 65%);pointer-events:none}.wait-number{font-size:51px;line-height:1.3;font-weight:800}.wait-label{font-size:11px;color:var(--mm-muted)}.time-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}.time{background:var(--mm-field);color:var(--mm-text);border:1px solid var(--mm-line);border-radius:13px;padding:15px;cursor:pointer;font-size:25px;font-weight:750}.time small{display:block;font-size:10px;color:var(--mm-muted)}.time.selected,.time:hover{background:var(--mm-soft);border-color:var(--mm-purple)}.quote{padding:16px;background:var(--mm-soft);border-left:3px solid var(--mm-purple);border-radius:0 13px 13px 0;font-size:15px;font-weight:650;color:var(--mm-text);margin:14px 0;overflow-wrap:anywhere}.trace{display:grid;grid-template-columns:1fr auto 1fr;gap:8px;align-items:center;font-size:11px;color:var(--mm-muted);margin:10px 0 14px}.trace span{background:var(--mm-field);padding:10px;border:1px solid var(--mm-line);border-radius:10px;overflow-wrap:anywhere}.hold{position:relative;overflow:hidden;user-select:none;touch-action:none}.hold:before{content:\"\";position:absolute;inset:0 auto 0 0;width:var(--hold,0%);background:#ffffff50;pointer-events:none}.hold span{position:relative;z-index:1;display:block;width:100%;text-align:center}.cooldown{font-size:63px;font-weight:800;letter-spacing:-.04em;font-variant-numeric:tabular-nums;text-align:center;margin:20px 0}.exact{font-size:13px;font-family:ui-monospace,monospace;background:var(--mm-soft);padding:12px;display:block;border-radius:12px;color:var(--mm-text)}.footer{border-top:1px solid var(--mm-line);padding-top:14px;margin-top:18px;display:grid;gap:6px;font-size:10px;color:var(--mm-muted);text-align:center}.creator-link{color:var(--mm-muted);font-weight:650;text-decoration:none}.creator-link:hover{color:var(--mm-purple)}.timer-pill{position:fixed;right:15px;bottom:15px;border:1px solid #d8cce8;border-radius:99px;background:#fffdf7;color:#43304e;padding:9px 15px;display:flex;align-items:center;gap:9px;box-shadow:0 4px 20px #0002;font:13px \"Segoe UI\",system-ui,sans-serif;z-index:2147483647}.timer-pill i{height:7px;width:7px;border-radius:50%;background:#71b986}.timer-pill em{font-style:normal;font-size:10px;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#837189}.theme-dark{--mm-text:#f5effa;--mm-muted:#c0b6c9;--mm-panel:#252332;--mm-field:#2d2a3b;--mm-line:#433c54;--mm-purple:#bea6ef;--mm-soft:#362e48}.theme-dark .badge{background:#274634;color:#a2d9b2}.hard .blocker-art{background:linear-gradient(160deg,#e9dfeb,#d9e6dd)}@keyframes fadeStep{from{opacity:.8}to{opacity:1}}@media(max-width:760px){.blocker-layout{grid-template-columns:1fr}.blocker-art{display:none}.panel{max-height:calc(100vh - 24px);width:calc(100vw - 24px)}.veil{padding:12px}.blocker-main{padding:20px}.top{padding:16px}h1{font-size:27px}.top .brand{font-size:20px}.badge{font-size:10px;padding:8px}.attention-receipt b{font-size:17px}}@media(prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}\n";

  function stageId() { return appState?.stage?.id || 'healthy'; }
  function siteName() { return siteConfig?.label || canonical; }
  function aggressive() { return appState?.settings?.interventionStrength === 'aggressive'; }
  function grants() { return Math.max(0, Number(friction?.grants || 0)); }

  function render(body, className = '') {
    ensureHost();
    if (waitCleanup) { waitCleanup(); waitCleanup = null; }
    let root = shadow.querySelector('#mindmoth-root');
    if (!root) {
      shadow.innerHTML = `<style>${css}</style><div id="mindmoth-root" class="veil"><section class="panel" role="dialog" aria-modal="true" aria-label="MindMoth website protection"><div class="top"><span class="brand"><img class="brand-mark" src="${chrome.runtime.getURL('assets/poses/companion.png')}" alt=""><span>MindMoth</span></span><span class="badge" id="mindmoth-badge"></span></div><div class="blocker-layout"><aside class="blocker-art"><span class="art-eyebrow">MAKE ROOM FOR YOUR DAY</span><h2>A little space.<br>A clearer intention.</h2><p>This website can wait until you know why you are opening it.</p><img src="${chrome.runtime.getURL('assets/scenes/shield.webp')}" alt="MindMoth guarding your attention"><span class="art-footer">Whole-site protection.<br>No feed-only loophole.</span></aside><main class="blocker-main"><div id="mindmoth-content"></div><div class="footer" id="mindmoth-footer"></div></main></div></section></div>`;
      root = shadow.querySelector('#mindmoth-root');
    }
    root.className = `veil theme-${appState?.settings?.theme || 'dark'} ${className}`.trim();
    const badge = shadow.querySelector('#mindmoth-badge');
    const footer = shadow.querySelector('#mindmoth-footer');
    const content = shadow.querySelector('#mindmoth-content');
    if (badge) badge.innerHTML = `<img class="badge-logo" src="${chrome.runtime.getURL('assets/brands/'+({'x.com':'x','youtube.com':'youtube','tiktok.com':'tiktok','instagram.com':'instagram'}[canonical])+'.png')}" alt="">${escapeHtml(siteName())} protected`;
    if (footer) footer.innerHTML = `<span class="footer-copy">The entire ${escapeHtml(siteName())} website is protected. There is no feed-only loophole.</span><a class="creator-link" href="https://x.com/Carbonthecoder" target="_blank" rel="noopener noreferrer">Made by Carbonthecoder</a>`;
    if (content) { content.innerHTML = body; content.querySelectorAll('button').forEach(b=>b.type='button'); content.querySelectorAll('.field').forEach(field=>{const input=field.querySelector('input');const label=field.querySelector('label');if(input&&label)label.htmlFor=input.id;}); }
  }

  function closeSite() { clearDraft(); msg({ type: 'CLOSE_TAB' }); }

  function isSpecific(text, min = 10) {
    const t = String(text || '').trim();
    if (t.length < min) return false;
    if (t.split(/\s+/).length < 3) return false;
    const lower = t.toLowerCase();
    const weak = ['idk', 'i dont know', "i don't know", 'stuff', 'things', 'check stuff', 'whatever', 'just check', 'scroll'];
    return !weak.some(w => lower === w || lower.startsWith(`${w} `));
  }

  function preventPaste(input) {
    input.addEventListener('paste', e => {
      e.preventDefault();
      input.classList.remove('bad');
      void input.offsetWidth;
      input.classList.add('bad');
    });
  }

  function bindValidatedInputs(inputs, button, validate) {
    const update = () => { button.disabled = !validate(); };
    inputs.forEach(input => {
      preventPaste(input);
      input.addEventListener('input', update);
    });
    update();
  }


  function todayMinutes() { return Math.floor(Number(appState?.totalUsageSeconds || 0) / 60); }
  function annualizedHours() { return Math.round((Number(appState?.totalUsageSeconds || 0) / 3600) * 365); }
  function readingPassage() {
    const passages = {
      'x.com': [
        'X has no natural stopping point. New posts arrive faster than you can finish them.',
        'If you came for one thread, message, or post, that is the whole job. The feed around it is not part of your task.',
        'When your reason is finished, close X even if MindMoth gave you time left.'
      ],
      'instagram.com': [
        'Instagram is built so one post becomes another before you notice the decision.',
        'Your original reason has a finish line. Reels and Explore do not.',
        'When the thing you named is done, the useful part of this visit is over.'
      ],
      'youtube.com': [
        'YouTube can be useful. Its recommendation system is not your task list.',
        'Finish the video, search, upload, or channel check you named. The next thumbnail is a new decision.',
        'Do not spend leftover allowance simply because the timer still exists.'
      ],
      'tiktok.com': [
        'TikTok has no end screen. The next video arrives before you have to decide whether you wanted it.',
        'If you came for one post, reply, search, or video, stop when that one thing is finished.',
        'The feed continuing does not mean your task is continuing.'
      ]
    };
    return passages[canonical] || [
      'An infinite feed has no natural finish line.',
      'The task you named does.',
      'When that task is done, leave even if time remains.'
    ];
  }

  function bluntLine() {
    const lines = [
      `The feed has no finish line. Your task does.`,
      `An infinite feed is designed to keep going after your reason is gone.`,
      `The algorithm does not need a reason to keep you here. You do.`,
      `If your purpose disappears, the correct next action is to close ${siteName()}.`,
      `Leftover timer is not free time. It is attention you did not plan to spend.`
    ];
    return lines[(grants() + todayMinutes()) % lines.length];
  }

  function showIntervention() {
    stopUsage();
    lockPageImmediately();
    step = aggressive() ? 0 : 1;
    intent = null;
    purpose = '';
    beforeText = '';
    afterText = '';
    requestedSeconds = grants() >= 1 ? 30 : 60;
    reflectionPrompts = chooseReflectionPrompts();
    renderStep();
  }

  function renderStep() {
    saveDraft();
    if (step === 0) {
      const seconds = Math.min(18, 6 + grants() * 3 + (appState?.health < 40 ? 3 : 0));
      render(`<div class="step"><div class="mascot-wrap">${mascot(grants() ? 'drained' : stageId())}</div><h1>Before you hand over more attention.</h1><p class="sub">You have spent <strong>${todayMinutes()} minutes</strong> on protected sites today. Your focus health is <strong>${appState?.health ?? 100}</strong>.</p><div class="attention-receipt"><div><span>Today</span><b>${todayMinutes()}m</b></div><div><span>If every day looked like today</span><b>${annualizedHours()}h/year</b></div><div><span>This hour</span><b>unlock #${grants()+1}</b></div></div><div class="warning">${escapeHtml(bluntLine())}</div><div class="wait-mini"><span id="gate-count">${seconds}</span>s before Continue becomes available</div><button class="primary" id="gate-next" disabled>Continue is intentionally unavailable</button><button class="secondary" id="close-site">Close ${siteName()} instead</button></div>`);
      const next=shadow.querySelector('#gate-next');
      startActiveWait(seconds,(remaining)=>{ const n=shadow.querySelector('#gate-count'); if(n)n.textContent=Math.ceil(remaining); },()=>{ next.disabled=false; next.textContent='I still have a specific reason'; });
      next.onclick=()=>{ if(!next.disabled){step=1;renderStep();} };
      shadow.querySelector('#close-site').onclick=closeSite;
      return;
    }

    if (step === 1) {
      const title = grants() > 0 ? `You're opening ${siteName()} again. Why?` : `What exactly are you opening ${siteName()} to do?`;
      const choices = intentionChoices().map(([value, label]) => `<button class="choice ${value === 'scroll' ? 'danger-choice' : ''}" data-intent="${value}">${label}<span>›</span></button>`).join('');
      render(`<div class="step"><div class="mascot-wrap">${mascot(grants() > 0 ? 'tired' : (stageId() === 'healthy' ? 'tired' : stageId()))}</div><h1>${title}</h1><p class="sub">Pick a task with a finish line. If there isn't one, closing the tab is the point.</p><div class="grid">${choices}</div><div class="counter">${grants()} successful unlock${grants() === 1 ? '' : 's'} in the current friction window.</div><button class="close" id="close-site">Never mind, close ${siteName()}</button></div>`);
      shadow.querySelectorAll('[data-intent]').forEach(b => {
        b.onclick = () => {
          intent = b.dataset.intent;
          step = intent === 'scroll' ? 20 : 2;
          renderStep();
        };
      });
      shadow.querySelector('#close-site').onclick = closeSite;
      return;
    }

    if (step === 2) {
      render(`<div class="step"><div class="mascot-wrap">${mascot(stageId())}</div><h1>Name the finish line.</h1><p class="sub">You chose <strong>${intentLabel()}</strong>. Type the exact thing that makes this visit complete. Vague answers do not unlock the site.</p><div class="field"><label>What exactly will you do?</label><input id="purpose" maxlength="160" autocomplete="off" spellcheck="false" placeholder="${purposePlaceholder()}" value="${escapeHtml(purpose)}"><small>At least 3 words and specific enough that you can tell when you're done. Pasting is disabled.</small></div><button class="primary" id="purpose-next" disabled>Continue</button><button class="close" id="back">Back</button></div>`);
      const input = shadow.querySelector('#purpose');
      const next = shadow.querySelector('#purpose-next');
      input.focus();
      bindValidatedInputs([input], next, () => isSpecific(input.value, 12));
      next.onclick = () => {
        purpose = input.value.trim();
        step = aggressive() ? 3 : 4;
        renderStep();
      };
      shadow.querySelector('#back').onclick = () => { step = 1; renderStep(); };
      return;
    }

    if (step === 3) {
      const prompts = reflectionPrompts || chooseReflectionPrompts();
      render(`<div class="step"><div class="mascot-wrap">${mascot('tired')}</div><h1>Two more questions.</h1><p class="sub">These rotate so the blocker cannot become another mindless click pattern.</p><div class="field"><label>${escapeHtml(prompts[0])}</label><input id="before" maxlength="140" autocomplete="off" spellcheck="false" placeholder="${escapeHtml(prompts[2])}" value="${escapeHtml(beforeText)}"></div><div class="field"><label>${escapeHtml(prompts[1])}</label><input id="after" maxlength="140" autocomplete="off" spellcheck="false" placeholder="${escapeHtml(prompts[3])}" value="${escapeHtml(afterText)}"></div><button class="primary" id="answers-next" disabled>Continue</button><button class="close" id="back">Back</button></div>`);
      const before = shadow.querySelector('#before');
      const after = shadow.querySelector('#after');
      const next = shadow.querySelector('#answers-next');
      bindValidatedInputs([before, after], next, () => isSpecific(before.value, 8) && isSpecific(after.value, 8));
      next.onclick = () => {
        beforeText = before.value.trim();
        afterText = after.value.trim();
        step = aggressive() ? 31 : 4;
        renderStep();
      };
      shadow.querySelector('#back').onclick = () => { step = 2; renderStep(); };
      return;
    }

    if (step === 31) {
      render(`<div class="step"><div class="mascot-wrap">${mascot('sick')}</div><h1>Your attention receipt.</h1><p class="sub">Nothing below is a promise to MindMoth. It is a reminder to yourself before the site becomes clickable.</p><div class="receipt-list"><label><input type="checkbox" class="receipt-check"><span>I know the exact finish line: <b>${escapeHtml(purpose)}</b></span></label><label><input type="checkbox" class="receipt-check"><span>I will leave when that task is done, even if the timer still has time.</span></label><label><input type="checkbox" class="receipt-check"><span>I am not treating the leftover allowance as permission to scroll.</span></label></div><div class="warning">${escapeHtml(bluntLine())}</div><button class="primary" id="receipt-next" disabled>Continue</button><button class="secondary" id="close-site">Close ${siteName()} instead</button></div>`);
      const checks=[...shadow.querySelectorAll('.receipt-check')];
      const next=shadow.querySelector('#receipt-next');
      checks.forEach(c=>c.onchange=()=>{ next.disabled=!checks.every(x=>x.checked); });
      next.onclick=()=>{ if(!next.disabled){step=32;renderStep();} };
      shadow.querySelector('#close-site').onclick=closeSite;
      return;
    }

    if (step === 32) {
      const passage = readingPassage();
      const seconds = Math.min(16, 8 + grants() * 2);
      render(`<div class="step"><div class="mascot-wrap">${mascot('tired')}</div><h1>Read this before you continue.</h1><p class="sub">Do not click through it. This is the part where MindMoth reminds you what the site is designed to do.</p><div class="reading-card"><span class="reading-label">READ SLOWLY</span>${passage.map(line=>`<p>${escapeHtml(line)}</p>`).join('')}</div><label class="reading-confirm"><input type="checkbox" id="reading-check" disabled><span>I read this. My task is still: <b>${escapeHtml(purpose)}</b></span></label><div class="wait-mini">Reading time: <span id="reading-count">${seconds}</span>s</div><button class="primary" id="reading-next" disabled>I have not finished reading yet</button><button class="secondary" id="close-site">Close ${siteName()} instead</button></div>`);
      const check = shadow.querySelector('#reading-check');
      const next = shadow.querySelector('#reading-next');
      const update = () => { next.disabled = !(check.checked && !check.disabled); };
      startActiveWait(seconds, remaining => { const el=shadow.querySelector('#reading-count'); if(el) el.textContent=Math.ceil(remaining); }, () => {
        check.disabled = false;
        next.textContent = 'I read it and still need this site';
        update();
      });
      check.onchange = update;
      next.onclick = () => { if(!next.disabled){ step=4; renderStep(); } };
      shadow.querySelector('#close-site').onclick = closeSite;
      return;
    }

    if (step === 4) {
      const seconds = Math.min(aggressive() ? 26 : 14, (aggressive() ? 8 : 4) + grants() * (aggressive() ? 4 : 2) + Math.floor(Math.random() * 4));
      render(`<div class="step"><div class="mascot-wrap">${mascot('tired')}</div><h1>Do nothing for a moment.</h1><p class="sub">The countdown only moves while this tab is visible and focused. Switching away does not count.</p><div class="wait-box" id="wait-box"><div><div class="wait-number" id="wait-number">${seconds}</div><div class="wait-label">seconds</div></div></div><button class="primary" id="wait-next" disabled>Wait</button><button class="close" id="close-site">Close ${siteName()} instead</button></div>`);
      const button = shadow.querySelector('#wait-next');
      startActiveWait(seconds, (remaining, progress) => {
        const n = shadow.querySelector('#wait-number');
        const box = shadow.querySelector('#wait-box');
        if (n) n.textContent = Math.ceil(remaining).toString();
        if (box) box.style.setProperty('--wait-progress', `${progress * 360}deg`);
      }, () => {
        button.disabled = false;
        button.textContent = 'Fine. Continue.';
      });
      button.onclick = () => { if (!button.disabled) { step = 5; renderStep(); } };
      shadow.querySelector('#close-site').onclick = closeSite;
      return;
    }

    if (step === 5) {
      const options = aggressive()
        ? (grants() >= 2 ? [30] : grants() >= 1 ? [30, 60] : [30, 60, 90])
        : (grants() >= 2 ? [120, 300] : [120, 300, 600]);
      if (!options.includes(requestedSeconds)) requestedSeconds = options[Math.min(1, options.length - 1)];
      const cls = options.length === 1 ? 'one' : options.length === 2 ? 'two' : '';
      render(`<div class="step"><div class="mascot-wrap">${mascot(stageId())}</div><h1>How little time can this take?</h1><p class="sub">This is an allowance, not a session. The entire site locks again the second it expires.</p><div class="time-grid ${cls}">${options.map(seconds => `<button class="time ${seconds === requestedSeconds ? 'selected' : ''}" data-sec="${seconds}">${formatDuration(seconds)}<small>maximum</small></button>`).join('')}</div>${grants() >= 1 ? `<div class="warning">Repeated unlocks trigger cooldowns. After another successful visit, ${siteName()} may become completely unavailable for 15 to 60 minutes.</div>` : ''}<button class="primary" id="time-next">Continue with ${formatDuration(requestedSeconds)}</button><button class="close" id="back">Back</button></div>`);
      shadow.querySelectorAll('[data-sec]').forEach(b => {
        b.onclick = () => {
          requestedSeconds = Number(b.dataset.sec);
          shadow.querySelectorAll('[data-sec]').forEach(x => x.classList.toggle('selected', x === b));
          shadow.querySelector('#time-next').textContent = `Continue with ${formatDuration(requestedSeconds)}`;
        };
      });
      shadow.querySelector('#time-next').onclick = () => { step = 6; renderStep(); };
      shadow.querySelector('#back').onclick = () => { step = 4; renderStep(); };
      return;
    }

    if (step === 6) {
      render(`<div class="step"><div class="mascot-wrap">${mascot(grants() ? 'tired' : stageId())}</div><h1>Read your own answer.</h1><div class="quote">“${escapeHtml(purpose)}”</div>${aggressive() ? `<div class="trace"><span>${escapeHtml(beforeText)}</span><b>→ ${siteName()} →</b><span>${escapeHtml(afterText)}</span></div>` : ''}<p class="sub">When that one task is finished, close the site. Do not spend the leftover timer because it exists.</p><button class="primary hold" id="final-hold"><span>Hold ${aggressive() ? 4 : 2} seconds to unlock</span></button><button class="secondary" id="close-final">Close ${siteName()} instead</button></div>`);
      setupHold(shadow.querySelector('#final-hold'), aggressive() ? 4 : 2, () => grantSeconds(requestedSeconds, intent, purpose));
      shadow.querySelector('#close-final').onclick = closeSite;
      return;
    }

    if (step === 20) {
      render(`<div class="step"><div class="mascot-wrap">${mascot('tired')}</div><h1>So there is no task.</h1><p class="sub">You selected <strong>Just scroll</strong>. There is no finish line, which is exactly why this option gets much more friction.</p><div class="grid"><button class="choice" id="close-scroll">Close ${siteName()} <span>✓</span></button><button class="choice danger-choice" id="insist-scroll">I still want to scroll <span>›</span></button></div><button class="close" id="back">Back</button></div>`);
      shadow.querySelector('#close-scroll').onclick = closeSite;
      shadow.querySelector('#insist-scroll').onclick = () => { step = 21; renderStep(); };
      shadow.querySelector('#back').onclick = () => { step = 1; renderStep(); };
      return;
    }

    if (step === 21) {
      const phrase = `I am choosing 30 seconds of scrolling even though I have no task.`;
      render(`<div class="step"><div class="mascot-wrap">${mascot('sick')}</div><h1>Type the choice.</h1><p class="sub">Type this sentence exactly. Pasting is disabled.</p><div class="exact">${phrase}</div><div class="field"><label>Type it yourself</label><input id="scroll-phrase" autocomplete="off" spellcheck="false"></div><button class="primary" id="scroll-next" disabled>Continue</button><button class="close" id="back">Back</button></div>`);
      const input = shadow.querySelector('#scroll-phrase');
      const next = shadow.querySelector('#scroll-next');
      preventPaste(input);
      input.focus();
      input.oninput = () => { next.disabled = input.value !== phrase; };
      next.onclick = () => { if (!next.disabled) { step = 22; renderStep(); } };
      shadow.querySelector('#back').onclick = () => { step = 20; renderStep(); };
      return;
    }

    if (step === 22) {
      const seconds = Math.min(45, 20 + grants() * 7);
      render(`<div class="step"><div class="mascot-wrap">${mascot('sick')}</div><h1>Now wait.</h1><p class="sub">This timer only runs while you stay on the blocker. A scrolling unlock also creates a cooldown after it expires.</p><div class="wait-box" id="wait-box"><div><div class="wait-number" id="wait-number">${seconds}</div><div class="wait-label">seconds</div></div></div><button class="primary" id="scroll-wait" disabled>Wait</button><button class="close" id="close-site">Close ${siteName()} instead</button></div>`);
      const button = shadow.querySelector('#scroll-wait');
      startActiveWait(seconds, (remaining, progress) => {
        shadow.querySelector('#wait-number').textContent = Math.ceil(remaining).toString();
        shadow.querySelector('#wait-box').style.setProperty('--wait-progress', `${progress * 360}deg`);
      }, () => {
        button.disabled = false;
        button.textContent = 'One last step';
      });
      button.onclick = () => { if (!button.disabled) { step = 23; renderStep(); } };
      shadow.querySelector('#close-site').onclick = closeSite;
      return;
    }

    if (step === 23) {
      render(`<div class="step"><div class="mascot-wrap">${mascot('drained')}</div><h1>Still choosing it?</h1><p class="sub">Hold the button for 7 continuous seconds. You get 30 seconds, then ${siteName()} locks and enters a hard cooldown.</p><button class="primary hold" id="scroll-hold"><span>Hold 7 seconds for 30 seconds of scrolling</span></button><button class="secondary" id="close-scroll">Close ${siteName()}</button></div>`);
      setupHold(shadow.querySelector('#scroll-hold'), 7, () => grantSeconds(30, 'scroll', 'Unstructured scrolling'));
      shadow.querySelector('#close-scroll').onclick = closeSite;
    }
  }

  function startActiveWait(seconds, onTick, onDone) {
    let remainingMs = seconds * 1000;
    let last = performance.now();
    let finished = false;
    const total = remainingMs;

    const interval = setInterval(() => {
      const now = performance.now();
      const delta = now - last;
      last = now;
      if (document.visibilityState === 'visible' && document.hasFocus()) remainingMs = Math.max(0, remainingMs - delta);
      const progress = Math.max(0, Math.min(1, 1 - remainingMs / total));
      onTick(remainingMs / 1000, progress);
      if (remainingMs <= 0 && !finished) {
        finished = true;
        clearInterval(interval);
        onDone();
      }
    }, 100);

    onTick(seconds, 0);
    waitCleanup = () => clearInterval(interval);
  }

  function setupHold(button, seconds, done) {
    let started = 0;
    let raf = 0;
    let completing = false;

    const cancel = () => {
      if (completing) return;
      started = 0;
      cancelAnimationFrame(raf);
      button.style.setProperty('--hold', '0%');
    };

    const loop = () => {
      if (!started || completing) return;
      const p = Math.min(1, (performance.now() - started) / (seconds * 1000));
      button.style.setProperty('--hold', `${p * 100}%`);
      if (p >= 1) {
        completing = true;
        started = 0;
        cancelAnimationFrame(raf);
        done();
      } else {
        raf = requestAnimationFrame(loop);
      }
    };

    button.onpointerdown = e => {
      e.preventDefault();
      if (completing) return;
      started = performance.now();
      try { button.setPointerCapture(e.pointerId); } catch {}
      loop();
    };
    button.onpointerup = cancel;
    button.onpointercancel = cancel;
    button.onpointerleave = () => { if (started) cancel(); };
    button.onkeydown=e=>{if([' ','Enter'].includes(e.key)&&!e.repeat){e.preventDefault();if(!completing&&!started){started=performance.now();loop();}}};
    button.onkeyup=e=>{if([' ','Enter'].includes(e.key)){e.preventDefault();cancel();}};
    const onBlur=()=>cancel();window.addEventListener('blur',onBlur);
    const previousCleanup=waitCleanup;waitCleanup=()=>{previousCleanup?.();cancelAnimationFrame(raf);window.removeEventListener('blur',onBlur);};
  }

  async function grantSeconds(seconds, reason = intent, statedPurpose = purpose) {
    clearDraft();
    const expiresAt = Date.now() + seconds * 1000;
    const response = await msg({
      type: 'SET_SESSION',
      host: canonical,
      expiresAt,
      reason,
      purpose: statedPurpose,
      strength: appState?.settings?.interventionStrength || 'aggressive'
    });

    if (!response?.ok) {
      if(!response?.blockedUntil){render(`<h1>Still protected.</h1><p class="sub">${escapeHtml(response?.error||'The connection changed. Try again.')}</p><button class="secondary" id="retry-grant">Return to the blocker</button>`);shadow.querySelector('#retry-grant').onclick=bootstrap;return;}
      friction = response?.friction || friction;
      if (response?.blockedUntil) friction.cooldownUntil = response.blockedUntil;
      showCooldownBlock();
      return;
    }

    friction = response.friction || friction;
    activeSession = response.session || { expiresAt, reason, purpose: statedPurpose };
    beginAllowedSession();
  }

  function beginAllowedSession() {
    const generation=flowGeneration;
    document.querySelector('#mindmoth-session-pill')?.remove();
    clearDraft();
    if (!purpose && activeSession?.purpose) purpose = activeSession.purpose;
    unlockPage();
    if (timerLoop) clearInterval(timerLoop);

    const pill = document.createElement('div');
    pill.id = 'mindmoth-session-pill';
    const s = pill.attachShadow({ mode: 'open' });
    s.innerHTML = `<style>${css}</style><div class="timer-pill"><i></i><span>${siteName()}</span><b id="t"></b><em>${escapeHtml(activeSession?.purpose || '')}</em></div>`;
    document.documentElement.appendChild(pill);

    let lastFocusCheck = 0;
    const update = async () => {
      if(generation!==flowGeneration || !activeSession) return;
      const remaining = Math.max(0, Math.ceil((activeSession.expiresAt - Date.now()) / 1000));
      const t = s.querySelector('#t');
      if (t) t.textContent = clockDuration(remaining);

      if (Date.now() - lastFocusCheck > 2000) {
        lastFocusCheck = Date.now();
        const latest = (await msg({ type: 'GET_APP_STATE' }))?.state;
        if (latest) appState = latest;
        if (appState?.focus?.active) {
          clearInterval(timerLoop);
          pill.remove();
          stopUsage();
          lockPageImmediately();
          showFocusBlock();
          return;
        }
      }

      if (remaining <= 0) {
        clearInterval(timerLoop);
        pill.remove();
        activeSession = null;
        stopUsage();
        lockPageImmediately();
        appState = (await msg({ type: 'GET_APP_STATE' }))?.state || appState;
        friction = (await msg({ type: 'GET_FRICTION', host: canonical }))?.friction || friction;
        if (friction?.cooldownUntil > Date.now()) showCooldownBlock();
        else showTimeUp();
      }
    };

    update();
    timerLoop = setInterval(update, 1000);
    startUsage();
  }

  function showTimeUp() {
    render(`<div class="step"><div class="mascot-wrap">${mascot('tired')}</div><h1>Time's up.</h1><p class="sub">Did you finish what you explicitly came here to do?</p>${purpose ? `<div class="quote">“${escapeHtml(purpose)}”</div>` : ''}<div class="grid"><button class="choice" id="done">Yes. Close ${siteName()} <span>✓</span></button><button class="choice danger-choice" id="not-done">No. I still need it <span>›</span></button></div></div>`);
    shadow.querySelector('#done').onclick = closeSite;
    shadow.querySelector('#not-done').onclick = async () => {
      friction = (await msg({ type: 'GET_FRICTION', host: canonical }))?.friction || friction;
      if (friction.cooldownUntil > Date.now()) showCooldownBlock();
      else showIntervention();
    };
  }

  function showCooldownBlock() {
    clearDraft();
    stopUsage();
    lockPageImmediately();
    if (timerLoop) clearInterval(timerLoop);
    const until = Number(friction?.cooldownUntil || Date.now());
    const updateText = () => {
      const remain = Math.max(0, Math.ceil((until - Date.now()) / 1000));
      const el = shadow?.querySelector('#cooldown-time');
      if (el) el.textContent = clockDuration(remain);
      if (remain <= 0) {
        clearInterval(timerLoop);
        friction.cooldownUntil = 0;
        showIntervention();
      }
    };

    render(`<div class="step"><div class="mascot-wrap">${mascot('critical')}</div><h1>No more unlocks right now.</h1><p class="sub">You have reopened ${siteName()} enough times that MindMoth has stopped negotiating. The whole site is locked until the cooldown ends.</p><div class="cooldown" id="cooldown-time"></div><div class="warning">There is no Continue button on this screen. This is the escalation.</div><button class="secondary" id="close-site">Close ${siteName()}</button></div>`, 'hard');
    shadow.querySelector('#close-site').onclick = closeSite;
    updateText();
    timerLoop = setInterval(updateText, 1000);
  }

  function startUsage() {
    stopUsage();
    let last = Date.now();
    tickTimer = setInterval(() => {
      const now = Date.now();
      if (document.visibilityState === 'visible' && document.hasFocus()) {
        const seconds = Math.min(10, Math.max(1, Math.round((now - last) / 1000)));
        msg({ type: 'USAGE_TICK', host: canonical, seconds });
      }
      last = now;
    }, 5000);
  }

  function stopUsage() {
    if (tickTimer) clearInterval(tickTimer);
    tickTimer = null;
  }

  function showFocusBlock() {
    clearDraft();
    stopUsage();
    if (timerLoop) clearInterval(timerLoop);
    const remain = () => Math.max(0, Math.ceil(((appState?.focus?.endsAt) || Date.now()) - Date.now()) / 1000);

    render(`<div class="step"><div class="mascot-wrap">${mascot('healthy')}</div><h1>Focus mode is active.</h1><p class="sub">${siteName()} is completely blocked until your timer ends.</p><div class="cooldown" id="focus-remain"></div><div class="warning">Focus mode has no website bypass.</div></div>`, 'hard');

    let lastStateCheck = 0;
    const update = async () => {
      if (Date.now() - lastStateCheck > 2000) {
        lastStateCheck = Date.now();
        const latest = (await msg({ type: 'GET_APP_STATE' }))?.state;
        if (latest) appState = latest;
        if (!appState?.focus?.active) {
          clearInterval(timerLoop);
          friction = (await msg({ type: 'GET_FRICTION', host: canonical }))?.friction || friction;
          if (friction?.cooldownUntil > Date.now()) showCooldownBlock();
          else showIntervention();
          return;
        }
      }
      const r = remain();
      const el = shadow?.querySelector('#focus-remain');
      if (el) el.textContent = clockDuration(r);
      if (r <= 0) {
        clearInterval(timerLoop);
        appState = (await msg({ type: 'GET_APP_STATE' }))?.state || appState;
        showIntervention();
      }
    };

    update();
    timerLoop = setInterval(update, 1000);
  }

  function formatDuration(seconds) {
    if (seconds < 60) return `${seconds}s`;
    return `${Math.round(seconds / 60)}m`;
  }

  function clockDuration(seconds) {
    const s = Math.max(0, Math.ceil(seconds));
    const m = Math.floor(s / 60);
    const sec = String(s % 60).padStart(2, '0');
    return `${m}:${sec}`;
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[c]));
  }

  async function restartForControlChange(next) {
    const oldEnabled=Boolean(siteConfig?.enabled);const newConfig=next.settings.protectedSites[canonical];
    const focusChanged=Boolean(appState?.focus?.active)!==Boolean(next.focus.active)||appState?.focus?.endsAt!==next.focus.endsAt;
    const changed=oldEnabled!==Boolean(newConfig?.enabled)||focusChanged;
    appState=next;siteConfig=newConfig;
    if(!changed)return;
    flowGeneration++;
    if(timerLoop)clearInterval(timerLoop);timerLoop=null;stopUsage();
    document.querySelector('#mindmoth-session-pill')?.remove();
    if(waitCleanup){waitCleanup();waitCleanup=null;}
    await bootstrap();
  }
  chrome.runtime.onMessage.addListener(message=>{
    if(message?.type!=='STATE_CHANGED'||!message.state||!appState)return;
    restartForControlChange(message.state).catch(()=>{});
  });
  window.addEventListener('beforeunload', stopUsage);
  bootstrap();
})();
