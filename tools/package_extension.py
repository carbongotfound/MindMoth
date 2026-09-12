from pathlib import Path
from zipfile import ZIP_DEFLATED,ZipFile
import json,subprocess,sys
R=Path(__file__).resolve().parents[1];S=R/'src'
subprocess.run([sys.executable,str(R/'tools/check_release.py')],check=True)
v=json.loads((S/'manifest.json').read_text())['version'];out=R/'dist'/f'MindMoth-extension-{v}.zip';out.parent.mkdir(exist_ok=True)
with ZipFile(out,'w',ZIP_DEFLATED,compresslevel=9) as z:
 for p in sorted(S.rglob('*')):
  if p.is_file() and not any(x.startswith('.') or x=='__pycache__' for x in p.relative_to(S).parts):z.write(p,f'MindMoth-extension-{v}/'+p.relative_to(S).as_posix())
print(out)
