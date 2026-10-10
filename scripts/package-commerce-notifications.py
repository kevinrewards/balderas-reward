"""Build the manual deployment kit without credentials or customer data."""
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED
import io,subprocess
root=Path(__file__).resolve().parents[1]
web=io.BytesIO()
with ZipFile(web,'w',ZIP_DEFLATED) as z:
    for p in sorted(root.iterdir()):
        if p.is_file() and p.suffix in {'.html','.js','.css','.png','.jpg','.webmanifest'}:z.write(p,p.name)
    for p in sorted((root/'icons').glob('*')):
        if p.is_file():z.write(p,p.relative_to(root))
    with ZipFile(root/'assets/wallet-emoji-v2.zip') as assets:
        for name in assets.namelist():z.writestr(name,assets.read(name))
out=root/'release'/'BALDERAS-Reward-avisos-y-wallet-v2.zip'
with ZipFile(out,'w',ZIP_DEFLATED) as z:
    for source,target in [
        ('docs/AVISOS-SOLICITUDES.md','INSTRUCCIONES.txt'),
        ('supabase/migrations/20261010_commerce_notifications.sql','01-avisos.sql'),
        ('supabase/migrations/20261010_commerce_notifications_cron.sql','02-envio-automatico.sql'),
        ('supabase/functions/commerce/index.ts','03-commerce-index.txt'),
        ('supabase/functions/commerce/push-policy.mjs','04-push-policy.txt'),
        ('supabase/functions/loyalty-v2/index.ts','06-wallet-index.txt'),
        ('supabase/functions/loyalty-v2/art.mjs','07-wallet-art.txt'),
        ('supabase/functions/loyalty-v2/symbols.mjs','08-wallet-symbols.txt'),
        ('docs/TWEMOJI-LICENSE.txt','LICENCIA-TWEMOJI.txt')]:z.write(root/source,target)
    z.writestr('05-netlify-web.zip',web.getvalue())
    z.writestr('RESPALDO-commerce/index.ts',subprocess.check_output(['git','show','codex/wallet-design:supabase/functions/commerce/index.ts'],cwd=root))
    for name in ['index.ts','art.mjs','policy.mjs']:
        z.writestr('RESPALDO-wallet/'+name,subprocess.check_output(['git','show','codex/wallet-design:supabase/functions/loyalty-v2/'+name],cwd=root))
print(out)
