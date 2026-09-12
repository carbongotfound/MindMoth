"""Fail packaging on missing resources, bad scripts or unsafe release leftovers."""
import json,re,subprocess,sys
from pathlib import Path
from html.parser import HTMLParser
R=Path(__file__).resolve().parents[1];S=R/'src';W=R/'website';checks=[]
def check(condition,message):
 if not condition:raise AssertionError(message)
 checks.append(message)
def local_exists(folder,url):
 if not url or url.startswith(('https:','http:','data:','#','mailto:')):return True
 return (folder/url.split('#')[0].split('?')[0]).is_file()
class Links(HTMLParser):
 def __init__(self):super().__init__();self.urls=[]
 def handle_starttag(self,tag,attrs):
  for k,v in attrs:
   if (k=='src') or (tag=='link' and k=='href'):self.urls.append(v)
m=json.loads((S/'manifest.json').read_text(encoding='utf-8'));check(m['manifest_version']==3,'Manifest V3');check(m['version']=='1.1.0','Release version 1.1.0')
check('<all_urls>' not in json.dumps(m),'No all-URLs host permission')
for x in [m['background']['service_worker'],m['action']['default_popup'],m['options_page'].split('#')[0],*m['icons'].values()]:check((S/x).is_file(),'Manifest resource exists: '+x)
for host in ['x.com','instagram.com','youtube.com','tiktok.com']:
 check('*://'+host+'/*' in m['content_scripts'][0]['matches'],'Full-domain match: '+host)
js_paths=list(S.rglob('*.js'))
html_paths=list(S.rglob('*.html'))
css_paths=list(S.rglob('*.css'))
if W.is_dir():
 js_paths+=list(W.glob('*.js'));html_paths+=list(W.glob('*.html'));css_paths+=list(W.glob('*.css'))
for p in js_paths:
 module=p.relative_to(S).as_posix()!='content/content.js' if p.is_relative_to(S) else False
 args=['node','--input-type=module','--check'] if module else ['node','--check']
 r=subprocess.run(args,input=p.read_text(encoding='utf-8'),text=True,capture_output=True,encoding='utf-8')
 check(r.returncode==0,'JavaScript parses: '+str(p.relative_to(R)))
for p in html_paths:
 parser=Links();parser.feed(p.read_text(encoding='utf-8'));check(all(local_exists(p.parent,u) for u in parser.urls),'HTML local resources: '+str(p.relative_to(R)))
for p in css_paths:
 urls=re.findall(r'''url\(["']?([^"')]+)["']?\)''',p.read_text(encoding='utf-8'))
 check(all(local_exists(p.parent,u) for u in urls),'CSS local resources: '+str(p.relative_to(R)))
for name in ['companion','grass','deep','study','meditate','streak']:check((S/f'assets/poses/{name}.png').stat().st_size>1000,'Moth pose: '+name)
for name in ['x','instagram','tiktok','youtube']:check((S/f'assets/brands/{name}.png').is_file(),'Supplied PNG logo: '+name)
check(not list(S.rglob('*.woff*')) and not list(S.rglob('*.ttf')),'Uses system fonts, no bundled font files')
if W.is_dir():
 check('https://github.com/carbongotfound/MindMoth' in (W/'index.html').read_text(encoding='utf-8'),'Website GitHub CTA configured')
else:
 checks.append('Website folder absent (expected for OSS; site hosted separately)')
check('<select' not in (S/'dashboard/app.js').read_text(encoding='utf-8'),'No dashboard dropdowns')
check('sessionStorage.setItem' not in (S/'content/content.js').read_text(encoding='utf-8'),'No intervention draft saved to website sessionStorage')
check(all((R/p).is_file() for p in ['README.md','PRIVACY.md','SECURITY.md','CONTRIBUTING.md','LICENSE','docs/INSTALL.md','docs/ASSETS.md','docs/TESTING.md']),'Public documentation present')
print(json.dumps({'passed':len(checks),'checks':checks},indent=2))