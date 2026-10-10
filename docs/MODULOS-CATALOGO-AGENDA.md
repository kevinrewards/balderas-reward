# Actualización: módulos, catálogo y solicitudes

## Base verificada y estado

Preparada sobre `1c8d29c` (`codex/business-setup-retry`). Antes de cambiar el código se compararon los 31 archivos JS/CSS/HTML de esa base con `https://balderas-reward.netlify.app/`: todos los JS/CSS coincidían; las diferencias HTML eran reescrituras de enlaces de Netlify. Incluye correcciones de alta con Owner y de RLS para logotipos que aún no estaban en `main`.

Esta actualización NO se ha aplicado al Supabase del negocio ni publicado en Netlify. No se dispone en esta sesión de acceso de despliegue a esos servicios. El frontend actual y los datos de clientes se mantienen en producción.

## Incluido

- Superadmin elige Lealtad, Catálogo y Agenda al crear el negocio. Desde Negocios → Administrar → Módulos, catálogo y agenda puede desactivar/reactivar, cambiar etiquetas y habilitar modalidades.
- Negocios existentes: Lealtad activada, Catálogo y Agenda desactivados hasta que el Superadmin los habilite. Desactivar conserva datos; las solicitudes anteriores siguen consultables por su enlace privado.
- Catálogo con categoría, imagen, precio opcional, descripción, orden, destacado, visibilidad, disponibilidad y duración de servicios. Staff marca disponibilidad; crear/editar requiere permiso del Owner; eliminar requiere Owner/Superadmin.
- Owner/Superadmin configura permisos de Staff, zona horaria, apertura/cierre y capacidades. Superadmin conserva el control de módulos/modalidades.
- Página pública `negocio.html?negocio=CODIGO`, con QR general, de catálogo o solicitudes imprimible con el logo. Se conserva el código por negocio usado por registro, sin alterar el QR personal de visitas.
- Delivery, consumo en sitio, recoger, servicio/cita y reservación. Cliente elige productos/cantidades; dirección obligatoria para delivery; comentarios, fecha y hora opcionales. Se admite fecha sin hora. Reservaciones pueden no incluir productos.
- Solicitudes pendientes no bloquean. Confirmaciones de servicios/mesas con hora controlan capacidad por negocio; pedidos delivery/recoger no ocupan citas. Confirmadas sin hora permanecen sin espacio reservado. Se almacenan hora solicitada y confirmada por separado. Las fechas del formulario se interpretan en la zona del negocio.
- Panel con últimas 300 solicitudes, filtros de estado, día, siete días o sin hora confirmada. Cambios de hora/productos, notas públicas, estados y respuesta del cliente. Puede registrarse una solicitud telefónica mediante el formulario público y confirmarla desde el panel.
- Seguimiento privado por token en fragmento de URL (no en registros HTTP ni encabezado Referer). Actualiza cada 20 s mientras la página está abierta. Cliente acepta cambios, pide revisión o cancela. Solicitar revisión no libera la cita; cancelar sí.
- Historial y versión de solicitud para rechazar ediciones de una versión antigua. Precios/nombres se copian del catálogo en servidor. Cambios de productos explícitos recalculan desde catálogo.
- Enlaces a menú y solicitudes en tarjeta web y en pases Google Wallet creados/actualizados mediante la integración; no cambia el diseño de Wallet. Los pases ya guardados no se actualizan masivamente en este paquete.
- Una solicitud no crea cliente de lealtad ni suma visitas.

## Activación, en este orden

1. Conservar el despliegue Netlify actual como versión de retorno. Revisar este cambio antes de publicarlo.
2. En Supabase SQL Editor ejecutar **una sola vez** `supabase/migrations/20261010_business_modules.sql` completa. Depende del esquema existente y del autorregistro QR (`business_registration_links`). Es una transacción: ante un error se revierte. No volver a ejecutar migraciones históricas que ya estén aplicadas.
3. Ejecutar **una sola vez** `supabase/migrations/20261010_catalog_storage.sql`. Crea bucket público `catalog-assets`, con máximo 4 MiB y JPG/PNG/WEBP. Solo se deben subir imágenes de productos destinadas a publicación.
4. Desplegar la nueva Edge Function `commerce`, usando `supabase/functions/commerce/index.ts`; desactivar verificación JWT para esta función pública (configurado en `supabase/config.toml`). Valida acciones y limita acceso mediante RPCs service-role; NO publicar ninguna clave service-role en el navegador.
5. Desplegar `loyalty-v2` incluyendo **index.ts y policy.mjs** del paquete. Mantener los secretos existentes de Wallet/VAPID y `PUBLIC_APP_URL`. El archivo config conserva sus opciones. No se añaden secretos para comercio; usa SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY de la función.
6. Publicar frontend completo en el mismo sitio Netlify. El ZIP de frontend incluye HTML, JS, CSS e imágenes y excluye SQL, pruebas y funciones. No cambiar el dominio ni los tokens de tarjetas.
7. Habilitar Catálogo y Agenda en UN negocio de prueba. Crear un producto con imagen, enviar solicitud sin hora, otra con hora, confirmar cambiando hora, abrir el enlace privado y aceptar. Comprobar permisos de Staff, QR con logo, negocio distinto, cancelación/liberación de capacidad, y ocultar/reactivar módulos.
8. Probar la tarjeta web y generación de Wallet con la cuenta de prueba autorizada. Wallet sigue sujeto a la aprobación de Google; el despliegue de este código no la concede.

CLI opcional, desde la carpeta del proyecto ya vinculada a Supabase:

```sh
supabase functions deploy commerce --no-verify-jwt
supabase functions deploy loyalty-v2 --no-verify-jwt
```

Si una migración falla, conservar el mensaje completo; no saltar al despliegue del frontend. Es necesario comprobar el esquema real de Supabase antes de declarar la actualización activa.

## Validación realizada y límites

Pruebas locales con PostgreSQL embebido (PGlite), pruebas DOM con jsdom, sintaxis JS y pruebas existentes de la aplicación. Cubren aislamiento por negocio, permisos, disponibilidad, hora opcional/zona horaria, idempotencia, duplicados, conflictos de capacidad, modificaciones/versiones, historial, suspensión/reactivación, enlaces privados, formularios y escape de contenido.

No se ha hecho validación visual en navegador real, integración con el Supabase de producción, subida real de imágenes ni impresión física. Requieren comprobarse antes de activar a clientes.

Este paquete ofrece actualizaciones en el enlace privado abierto; NO incluye avisos de correo, WhatsApp ni push cuando la página está cerrada. No genera cobros ni pagos. No incluye agenda por empleado, asignación de mesas específicas, cierres por festivos, horarios nocturnos que crucen medianoche ni recordatorios automáticos. La capacidad es por negocio y modalidad (servicios o personas en sitio). La confirmación manual permite operar con estas limitaciones.

## Pruebas reproducibles

Instalar dependencias de prueba fuera del frontend:

```sh
npm install --prefix ../test-deps @electric-sql/pglite jsdom
PGLITE_MODULE="$(realpath ../test-deps/node_modules/@electric-sql/pglite/dist/index.js)" JSDOM_MODULE="$(realpath ../test-deps/node_modules/jsdom/lib/api.js)" node --test tests/*.cjs tests/*.mjs
```

## Retorno

Antes de habilitar módulos a clientes, se puede volver al despliegue previo de Netlify y a la Edge Function anterior. Dejar tablas nuevas sin borrarlas conserva las solicitudes. Reactivar Lealtad en todos los negocios que deban usar la interfaz anterior: las reglas nuevas de base de datos siguen vigentes aunque se restaure el frontend.
