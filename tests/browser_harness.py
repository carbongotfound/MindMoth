"""Chromium DOM tests of real app modules with an extension-API adapter.

Uses locally supplied HTML/data modules, not native extension installation or
network navigation. No managed browser policies are changed. Test fixtures are
not part of the extension package.
"""
import asyncio,base64,json,mimetypes,os,re,uuid,shutil
from functools import lru_cache
from pathlib import Path
from playwright.async_api import async_playwright
ROOT=Path(__file__).resolve().parents[1];SRC=ROOT/'src';OUT=ROOT/'docs/screenshots'
OUT.mkdir(parents=True,exist_ok=True)
BASE='chrome-extension://mindmoth-test/'
def data_uri(path):
 return 'data:'+(mimetypes.guess_type(str(path))[0] or 'application/octet-stream')+';base64,'+base64.b64encode(path.read_bytes()).decode()
@lru_cache(None)
def module_uri(path):
 path=Path(path);text=path.read_text()
 def repl(m):return m[1]+m[2]+module_uri((path.parent/m[3]).resolve())+m[2]
 text=re.sub(r'''(from\s*|import\s*\()("|')(\.[^"']+)\2''',repl,text)
 return 'data:text/javascript;base64,'+base64.b64encode(text.encode()).decode()
def css_text(path):
 return re.sub(r'''url\(["']?(\.\.?/[^"')]+)["']?\)''',lambda m:'url("'+data_uri((path.parent/m[1]).resolve())+'")',path.read_text())
BRIDGE=r'''(() => {
 const noop={addListener:()=>{}};window.__listeners=[];window.__storage={};
 const clone=x=>JSON.parse(JSON.stringify(x));
 window.__foreground=true;document.hasFocus=()=>window.__foreground;
 for(const name of ['sessionStorage','localStorage']) {try{window[name].getItem('test');}catch{const store={};Object.defineProperty(window,name,{value:{getItem:k=>store[k]??null,setItem:(k,v)=>{store[k]=String(v)},removeItem:k=>delete store[k],clear:()=>{for(const k of Object.keys(store))delete store[k]}}});}}

 window.chrome={runtime:{id:'mindmoth-test',lastError:null,getURL:p=>window.__assets?.[p]||BASE+p,getManifest:()=>({version:'1.1.0'}),
 sendMessage:(m,cb)=>window.__send(m).then(r=>cb(r)),onMessage:{addListener:f=>window.__listeners.push(f)},onInstalled:noop,onStartup:noop},
 storage:{local:{get:async keys=>{const d=window.__storage;if(keys===null)return clone(d);if(typeof keys==='string')return {[keys]:d[keys]?clone(d[keys]):undefined};return Object.fromEntries(keys.map(k=>[k,d[k]?clone(d[k]):undefined]));},set:async vals=>{await new Promise(r=>setTimeout(r,1));Object.assign(window.__storage,clone(vals));},remove:async keys=>{for(const k of (Array.isArray(keys)?keys:[keys]))delete window.__storage[k];},setAccessLevel:async()=>{}},onChanged:noop},
 tabs:{query:q=>window.__tabs({op:'query',q}),get:id=>window.__tabs({op:'get',id}),create:d=>window.__tabs({op:'create',d}),update:(id,d)=>window.__tabs({op:'update',id,d}),remove:id=>window.__tabs({op:'remove',id}),sendMessage:(id,m)=>window.__tabs({op:'message',id,m})},
 windows:{update:async()=>({}),getLastFocused:async()=>({focused:true,id:1})},alarms:{create:async()=>{},onAlarm:noop},action:{setTitle:async()=>{},setBadgeBackgroundColor:async()=>{},setBadgeText:async()=>{}}};
 if(!crypto.randomUUID)crypto.randomUUID=()=>UUID_PREFIX+'-'+Math.random().toString(16).slice(2);
 const patch=node=>{if(node.nodeType!==1)return;for(const el of [node,...node.querySelectorAll('img')]){if(el.tagName!=='IMG')continue;const raw=el.getAttribute('src');if(!raw||raw.startsWith('data:'))continue;const key=raw.replace(/^\.\.\//,'').replace(BASE,'');const uri=window.__assets[key];if(uri){el.dataset.source=raw;el.setAttribute('src',uri);}}};
 new MutationObserver(ms=>{for(const m of ms){if(m.type==='attributes')patch(m.target);else for(const n of m.addedNodes)patch(n);}}).observe(document.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:['src']});
})();'''.replace('BASE',json.dumps(BASE)).replace('UUID_PREFIX',json.dumps(str(uuid.uuid4())))

async def run():
 results=[];errors=[]
 async with async_playwright() as p:
  browser=await p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH') or shutil.which('chromium') or p.chromium.executable_path,headless=True,args=['--no-sandbox','--disable-gpu'])
  ctx=await browser.new_context(viewport={'width':1440,'height':1040})
  pages={};ids={};logical={};counter=0;bg=None
  assets={p.relative_to(SRC).as_posix():data_uri(p) for p in (SRC/'assets').rglob('*') if p.is_file()}
  def track(pg):
   nonlocal counter
   counter+=1;pages[counter]=pg;ids[pg]=counter;pg.on('pageerror',lambda e:errors.append(str(e)))
  ctx.on('page',track)
  def url(pg):return logical.get(pg,'about:blank').split('#')[0]+('#'+pg.url.split('#',1)[1] if '#' in pg.url else '')
  async def activate(pg):
   for other in list(pages.values()):
    if not other.is_closed():await other.evaluate('(active)=>{const changed=window.__foreground!==active;window.__foreground=active;if(changed)window.dispatchEvent(new Event(active?"focus":"blur"));}',other is pg)
   await pg.bring_to_front()
  async def send(source,m):
   pg=source['page'];s={'id':'mindmoth-test','url':url(pg)}
   if not s['url'].startswith(BASE):s['tab']={'id':ids[pg],'url':s['url'],'active':True,'windowId':1}
   return await bg.evaluate('({m,s})=>new Promise(resolve=>window.__listeners[0](m,s,resolve))',{'m':m,'s':s})
  async def tab_api(source,arg):
   op=arg['op'];id=arg.get('id');pg=pages.get(id)
   if op=='query':
    data=[]
    for id,page in list(pages.items()):
     if page.is_closed() or page is bg:continue
     data.append({'id':id,'url':url(page),'active':await page.evaluate('document.hasFocus()'),'windowId':1})
    q=arg['q']
    if q.get('active'):data=[t for t in data if t['active']]
    if q.get('url'):data=[t for t in data if t['url'].startswith(q['url'].rstrip('*'))]
    return data
   if op=='get':return {'id':id,'url':url(pg),'active':await pg.evaluate('document.hasFocus()'),'windowId':1}
   if op=='message':
    if pg and not pg.is_closed():await pg.evaluate('m=>{window.__listeners.forEach(f=>{f(m);});}',arg['m'])
    return None
   if op=='remove':
    if pg:await pg.close()
    return None
   if op=='create':
    pg=await load_ui('dashboard',arg['d']['url'].split('#')[-1]);return {'id':ids[pg],'url':url(pg),'windowId':1}
   if op=='update':
    if 'url' in arg['d']:await pg.evaluate('h=>{location.hash=h}',arg['d']['url'].split('#')[-1])
    await activate(pg);return {'id':id,'url':url(pg),'windowId':1}
  await ctx.expose_binding('__send',send);await ctx.expose_binding('__tabs',tab_api)
  async def prep(pg,html='<html><body></body></html>'):
   await pg.set_content(html);await pg.evaluate('x=>{window.__assets=x}',assets);await pg.add_script_tag(content=BRIDGE)
  async def load_ui(kind,hash='home'):
   pg=await ctx.new_page();logical[pg]=BASE+kind+'/index.html'
   html=(SRC/kind/'index.html').read_text();html=re.sub(r'<script\b[^>]*>.*?</script>','',html,flags=re.S);html=re.sub(r'<link\b[^>]*>','',html)
   await prep(pg,html);await pg.add_style_tag(content=css_text(SRC/kind/('styles.css' if kind=='dashboard' else 'popup.css')))
   await pg.evaluate('h=>{history.replaceState({},"","#"+h)}',hash)
   entry=SRC/kind/('app.js' if kind=='dashboard' else 'popup.js')
   await pg.add_script_tag(type='module',content=f'import {json.dumps(module_uri(entry.resolve()))};')
   await activate(pg);return pg
  async def site_fixture(siteurl):
   pg=await ctx.new_page();logical[pg]=siteurl
   await prep(pg,'<html><body><h1>Protected-site fixture</h1><button id="underlying" onclick="this.textContent=\'Clicked\'">Website button</button><input id="site-input"><div id="spa"></div></body></html>')
   await pg.add_script_tag(content='(()=>{const location=new URL('+json.dumps(siteurl)+');\n'+(SRC/'content/content.js').read_text()+'\n})();')
   await activate(pg);return pg
  async def shot(pg,name):
   await pg.evaluate("()=>{for(const i of document.images)i.loading='eager';return Promise.all([...document.images].map(i=>i.decode().catch(()=>{})));}");await pg.wait_for_timeout(250)
   await pg.screenshot(path=str(OUT/name),full_page=True)
  def passed(s):results.append(s);print('PASS:',s,flush=True)
  bg=await ctx.new_page();logical[bg]=BASE+'background/service-worker.js';await prep(bg)
  await bg.add_script_tag(type='module',content=f'import {json.dumps(module_uri((SRC/"background/service-worker.js").resolve()))};')
  await bg.wait_for_function('window.__listeners.length>0')
  app=await load_ui('dashboard');await app.get_by_role('heading',name='Distractions meet their match.').wait_for()
  passed('Dashboard modules load and render without a syntax/runtime error')
  async def api(m):return await send({'page':app},m)
  await app.locator('[data-page="settings"]').first.click()
  await app.get_by_role('button',name='Light',exact=True).click();await app.wait_for_function("document.documentElement.dataset.theme==='light'")
  await app.get_by_role('button',name='45m',exact=True).click();await app.wait_for_function("document.querySelector('[data-goal=\"45\"]').getAttribute('aria-pressed')==='true'")
  newapp=await load_ui('dashboard','settings');await app.close();app=newapp
  await app.get_by_role('button',name='45m',exact=True).wait_for();assert await app.locator('[data-goal="45"]').get_attribute('aria-pressed')=='true'
  passed('Theme and goal buttons work and persist in a newly opened dashboard')
  await app.locator('[data-page="home"]').first.click();await app.locator('.home-banner').wait_for();await shot(app,'home-light.png')
  await app.locator('[data-page="history"]').first.click();await app.get_by_role('button',name='View all',exact=False).click()
  await app.get_by_role('heading',name='Challenges & milestones').wait_for();assert app.url.endswith('#challenges')
  passed('View all opens the dedicated Challenges page')
  await app.locator('[data-page="history"]').first.click();await shot(app,'stats-light.png')
  await app.locator('[data-page="focus"]').first.click();await app.get_by_role('button',name='50m',exact=True).click();assert await app.locator('#focus-clock').inner_text()=='50:00'
  await shot(app,'focus-light.png');passed('Focus preset updates the displayed timer before starting')
  site=await site_fixture('https://x.com/home')
  await site.locator('#mindmoth-overlay-host').wait_for();assert await site.evaluate('document.body.inert')
  await shot(site,'blocker-light.png')
  await site.wait_for_function("!document.querySelector('#mindmoth-overlay-host').shadowRoot.querySelector('#gate-next').disabled",timeout=25000)
  await site.locator('#gate-next').click();await site.locator('[data-intent="find"]').click()
  await site.locator('#purpose').fill('Find one specific post about my project');await site.locator('#purpose-next').click()
  await site.locator('#before').fill('I was working on a school project');await site.locator('#after').fill('Return to the school project immediately');await site.locator('#answers-next').click()
  for check in await site.locator('.receipt-check').all():await check.check()
  await site.locator('#receipt-next').click();await site.locator('#reading-check').wait_for();assert await site.locator('#reading-check').is_disabled()
  await shot(site,'reading-light.png')
  passed('Whole-site inert lock; blocker choices, text fields, checkboxes and reading gate work')
  denied=await api({'type':'UPDATE_SETTINGS','patch':{'protectedSites':{'x.com':{'enabled':False}}}});assert denied['ok'] is False
  passed('Worker rejects direct settings requests to turn off protection')
  await activate(app);await app.evaluate("location.hash='blockers'");await app.locator('[data-service="x.com"]').click()
  for n,text in enumerate(['I need to send a project update','I will write the planned message only','I will stop after sending that message'],1):await app.locator(f'#answer-{n}').fill(text)
  await app.locator('#start-review').click();await app.locator('#review-phrase').wait_for();assert await app.locator('#review-phrase').is_disabled()
  rid=await app.evaluate("sessionStorage.getItem('mindmoth:review')");r=(await api({'type':'GET_REVIEW','id':rid}))['review']
  assert r['policy']['waitMs']==300000 and r['policy']['readingMs']==60000 and r['policy']['holdMs']==8000
  denied=await api({'type':'FINISH_REVIEW','id':rid,'phrase':r['policy']['phrase']});assert denied['ok'] is False
  await shot(app,'disable-review-light.png')
  passed('Pause review enforces written answers, 60s reading, 5m wait and 8s hold')
  await app.wait_for_timeout(2300);r=(await api({'type':'GET_REVIEW','id':rid}))['review'];assert r['readingMs']>0
  before=r['readingMs'];await activate(site);await site.wait_for_timeout(2200);r=(await api({'type':'GET_REVIEW','id':rid}))['review'];assert r['readingMs']<=before+1200
  passed('Active review reading stops when its tab loses focus')
  # Test clock fixture: the packaged extension contains no wait bypass.
  await bg.evaluate("id=>{const r=window.__storage['review:'+id];r.readyAt=Date.now()-1;r.readingMs=60000;}",rid)
  await activate(app);await app.wait_for_timeout(1800);await app.locator('#review-ack').check();await app.locator('#review-phrase').fill(r['policy']['phrase'])
  await app.locator('#review-hold').hover();await app.mouse.down();await app.wait_for_timeout(9000);await app.mouse.up()
  await app.wait_for_function("!document.querySelector('#review-dialog').open",timeout=12000)
  latest=(await api({'type':'GET_APP_STATE'}))['state'];assert latest['settings']['protectedSites']['x.com']['paused'] is True
  await site.wait_for_timeout(700);assert await site.evaluate('document.body.inert') is False
  await site.locator('#underlying').click();assert await site.locator('#underlying').inner_text()=='Clicked'
  passed('Held review completion pauses the service and restores website clicks without reload')
  await api({'type':'ENABLE_SITE','host':'x.com'});await site.wait_for_timeout(700);assert await site.evaluate('document.body.inert')
  passed('Instant re-enable protects an already open website')
  await activate(app);await app.locator('[data-service="x.com"]').click();await app.locator('[data-service="x.com"]').filter(has_text='Review').wait_for();await app.locator('[data-service="x.com"]').click();await app.locator('[data-mode="off"]').click()
  for n in range(1,4):await app.locator(f'#answer-{n}').fill(f'I have a clear practical reason number {n}')
  await app.locator('#start-review').click();await app.locator('#review-phrase').wait_for();rid2=await app.evaluate("sessionStorage.getItem('mindmoth:review')")
  off=(await api({'type':'GET_REVIEW','id':rid2}))['review'];assert off['policy']['waitMs']==600000
  await app.locator('#keep-protection').click();assert (await api({'type':'GET_APP_STATE'}))['state']['settings']['protectedSites']['x.com']['enabled']
  passed('Turning off uses a 10m review; cancellation retains protection')
  await app.evaluate("location.hash='focus'");await app.get_by_role('button',name='Start focus session',exact=True).click();await site.wait_for_timeout(700)
  await site.get_by_role('heading',name='Focus mode is active.').wait_for();denied=await api({'type':'FOCUS_ACTION','action':'stop'});assert denied['ok'] is False
  passed('Focus locks existing site fixtures and direct early-stop requests are denied')
  for siteurl in ['https://www.youtube.com/watch?v=test','https://www.instagram.com/p/test/','https://www.tiktok.com/@test/video/123']:
   other=await site_fixture(siteurl);await other.get_by_role('heading',name='Focus mode is active.').wait_for();assert await other.evaluate('document.body.inert');await other.close()
  passed('YouTube, Instagram and TikTok direct-post URL fixtures receive full-site focus locks')
  popup=await load_ui('popup');await popup.set_viewport_size({'width':360,'height':600});await popup.locator('.companion-card').wait_for()
  await popup.wait_for_function("[...document.images].every(i=>i.complete&&i.naturalWidth>0)")
  assert await popup.evaluate('document.body.scrollHeight<=600');await shot(popup,'popup-light.png');await popup.locator('#manage').click();await app.wait_for_function("location.hash==='#blockers'")
  passed('Popup loads moth and supplied PNG logos; Manage opens protection settings')
  await activate(app);await app.evaluate("location.hash='settings'");await app.get_by_role('button',name='Dark',exact=True).click()
  await app.wait_for_function("document.documentElement.dataset.theme==='dark'");await app.evaluate("location.hash='home'");await app.locator('.home-banner').wait_for();await shot(app,'home-dark.png')
  await popup.close();popup=await load_ui('popup');await popup.set_viewport_size({'width':360,'height':600});await popup.locator('.companion-card').wait_for();await shot(popup,'popup-dark.png')
  await app.set_viewport_size({'width':390,'height':844});await activate(app);assert await app.evaluate('document.documentElement.scrollWidth<=window.innerWidth')
  await shot(app,'home-mobile.png');passed('Dashboard fits a 390px viewport without horizontal overflow')
  if (ROOT/'website').is_dir():
   web=await ctx.new_page();logical[web]='https://mindmoth.example/'
   html=(ROOT/'website/index.html').read_text();html=re.sub(r'<script\b[^>]*>.*?</script>','',html,flags=re.S);html=re.sub(r'<link\b[^>]*>','',html)
   def local_src(m):
    path=ROOT/'website'/m[2]
    return m[1]+'"'+data_uri(path)+'"' if path.is_file() else m[0]
   html=re.sub(r'''(src=)["'](assets/[^"']+)["']''',local_src,html)
   await web.set_content(html);await web.add_style_tag(content=css_text(ROOT/'website/site.css'));await web.add_script_tag(content=(ROOT/'website/site.js').read_text())
   await web.set_viewport_size({'width':1440,'height':1040});await shot(web,'website-desktop.png')
   assert await web.locator('a[href*="github.com/carbongotfound/MindMoth"]').count()>=3
   await web.locator('details').first.locator('summary').click();assert await web.locator('details').first.get_attribute('open') is not None
   await web.set_viewport_size({'width':390,'height':844});assert await web.evaluate('document.documentElement.scrollWidth<=window.innerWidth')
   await shot(web,'website-mobile.png');passed('Website GitHub CTAs, FAQ controls and mobile layout work')
  else:
   passed('Website folder absent (skipped; site hosted separately)')
  assert not errors,errors
  report={'environment':'Chromium DOM tests with local HTML/data modules and extension-API adapter. Not native installed-extension or Opera GX tests.','passed':results,'pageErrors':errors}
  (ROOT/'docs/browser-test-results.json').write_text(json.dumps(report,indent=2));print(json.dumps(report,indent=2),flush=True)
  await browser.close()
if __name__=='__main__':asyncio.run(run())
