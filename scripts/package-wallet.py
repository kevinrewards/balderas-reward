"""Package only public web files for Netlify; put server code in a separate installer."""
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED
import io, subprocess
root=Path(__file__).resolve().parents[1]
web=io.BytesIO()
with ZipFile(web,'w',ZIP_DEFLATED) as z:
    for p in sorted(root.iterdir()):
        if p.is_file() and p.suffix in {'.html','.js','.css','.png','.jpg','.webmanifest'}:
            z.write(p,p.name)
    for p in sorted((root/'icons').glob('*')):
        if p.is_file(): z.write(p,p.relative_to(root))
out=root/'release'/'BALDERAS-Reward-diseno-wallet.zip'
with ZipFile(out,'w',ZIP_DEFLATED) as z:
    z.write(root/'docs/WALLET-DISENO.md','INSTRUCCIONES.txt')
    z.write(root/'docs/wallet-design/VISTA-PREVIA.html','VISTA-PREVIA.html')
    for name,target in [('index.ts','01-index.txt'),('policy.mjs','02-policy.txt'),('art.mjs','03-art.txt')]:
        z.write(root/'supabase/functions/loyalty-v2'/name,target)
    z.writestr('04-netlify-web.zip',web.getvalue())
    for name in ['index.ts','policy.mjs']:
        content=subprocess.check_output(['git','show','codex/business-modules:supabase/functions/loyalty-v2/'+name],cwd=root)
        z.writestr('RESPALDO-loyalty-v2/'+name,content)
print(out)
