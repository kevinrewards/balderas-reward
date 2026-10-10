"""Build the deployment kit; never include credentials, Git metadata or customer data."""
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED
import io
root=Path(__file__).resolve().parents[1]
web=io.BytesIO()
with ZipFile(web,'w',ZIP_DEFLATED) as z:
    for p in sorted(root.iterdir()):
        if p.is_file() and p.suffix in {'.html','.js','.css','.png','.jpg','.webmanifest'}:
            z.write(p,p.name)
    for p in sorted((root/'icons').glob('*')):
        if p.is_file(): z.write(p,p.relative_to(root))
out=root/'release'/'BALDERAS-Reward-actualizacion-modulos.zip'
with ZipFile(out,'w',ZIP_DEFLATED) as z:
    z.writestr('01-LEEME.txt','Actualización preparada, aún no publicada.\n\n1. Ejecuta 02-modulos.sql en Supabase SQL Editor.\n2. Ejecuta 03-imagenes.sql.\n3. Despliega commerce y loyalty-v2 (ambos archivos), con la configuración incluida.\n4. Publica 04-netlify-web.zip en el sitio actual Netlify.\n5. Habilita los módulos en un negocio de prueba y verifica todo antes de usarlos con clientes.\n\nLee INSTRUCCIONES.md para pasos, límites y retorno. No publiques el paquete externo completo en Netlify: solo el ZIP 04 contiene el sitio web.\nNo necesita contraseñas ni claves privadas en los archivos del navegador.\n')
    z.write(root/'docs/MODULOS-CATALOGO-AGENDA.md','INSTRUCCIONES.md')
    z.write(root/'supabase/migrations/20261010_business_modules.sql','02-modulos.sql')
    z.write(root/'supabase/migrations/20261010_catalog_storage.sql','03-imagenes.sql')
    z.writestr('04-netlify-web.zip',web.getvalue())
    z.write(root/'supabase/config.toml','supabase/config.toml')
    for directory in ['commerce','loyalty-v2']:
        for p in sorted((root/'supabase/functions'/directory).iterdir()):
            if p.is_file():z.write(p,p.relative_to(root))
print(out)
