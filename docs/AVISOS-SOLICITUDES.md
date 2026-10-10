# Avisos de pedidos y citas

Actualización posterior al diseño Wallet ya publicado. No cambia la tarjeta Wallet, sus visitas, canjes, diseños o enlaces. Estos avisos son Web Push independientes del programa de lealtad y sirven también a negocios que solo tienen agenda.

## Instalación

1. Extraer BALDERAS-Reward-avisos-solicitudes.zip.
2. Abrir 01-avisos.sql en Bloc de notas y ejecutar TODO en Supabase → SQL Editor. Es una migración nueva; ejecutarla una sola vez.
3. Edge Functions → commerce → Code. Reemplazar todo index.ts por 03-commerce-index.txt. Añadir un archivo llamado exactamente push-policy.mjs y pegar 04-push-policy.txt. Desplegar ambos juntos con Deploy updates.
4. En commerce, Verify JWT with legacy secret debe seguir APAGADO. Las acciones públicas usan el token privado del seguimiento; el envío programado valida un ticket de uso único en el servidor.
5. Ejecutar 02-envio-automatico.sql en SQL Editor. Habilita pg_cron y pg_net y crea dos tareas propias: balderas-commerce-push y balderas-commerce-push-cleanup. Si la plataforma impide crear las extensiones, habilitarlas en Database → Extensions y volver a ejecutar este segundo archivo.
6. Extraer 05-netlify-web.zip y publicar ESA carpeta en el sitio actual balderas-reward. No subir el ZIP externo con el código de servidor.
7. Abrir el panel con Ctrl+F5 y actualizar el seguimiento del cliente. No hay que regenerar sus enlaces.

Reutiliza VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT y PUBLIC_APP_URL configurados para las promociones. Son secretos globales del proyecto: no copiar claves al navegador ni al SQL. No se necesita un proveedor de correo o WhatsApp. Las cuotas existentes de Supabase/Netlify siguen aplicando.

## Prueba con el teléfono

1. Crear una solicitud de prueba y conservar el enlace privado de seguimiento.
2. En Android, abrirlo y pulsar Recibir avisos de esta solicitud; aceptar el permiso del navegador.
3. En iPhone/iPad, abrir en Safari, Compartir → Añadir a pantalla de inicio; entrar desde ese icono y activar los avisos. Requiere una versión compatible con Web Push (iOS/iPadOS 16.4 o posterior).
4. Desde el panel, confirmar la solicitud con un horario; esperar alrededor de un minuto, sujeto a cola y proveedor. Cerrar el panel no detiene el trabajo programado.
5. Tocar el aviso: debe abrir el seguimiento privado correcto, con su estado y horario actuales.
6. Modificar la hora y la nota y verificar un nuevo aviso. En otra solicitud, probar rechazo/cancelación del negocio.
7. Desactivar estos avisos desde el seguimiento y comprobar que una modificación posterior ya no los genera para ese dispositivo. Las promociones y otras solicitudes siguen suscritas.

## Funcionamiento

- Consentimiento por dispositivo y solicitud, máximo cinco dispositivos por solicitud. Activar avisos no suscribe a promociones ni envía cambios pasados.
- Cada guardado del negocio que registra un evento en la solicitud encola el aviso para sus suscriptores. Esto incluye hora, estado, nota, dirección y productos. Guardar sin cambios también registra un evento. Las acciones del cliente no generan un nuevo envío.
- Varias actualizaciones antes del procesamiento sustituyen los avisos pendientes por el más reciente. El historial conserva todos los cambios. Avisos que ya están en tránsito pueden llegar después de un cambio posterior; el enlace siempre consulta el estado actual.
- La notificación muestra nombre del negocio, estado y hora confirmada. No muestra nombre/contacto del cliente, dirección, productos o comentarios en la pantalla bloqueada.
- El trabajador se revisa cada minuto y atiende hasta diez entregas por invocación, cinco simultáneas. Con mucha carga puede tardar más. No invoca la Edge Function si no hay trabajo pendiente.
- Errores definitivos que permiten reintento se prueban hasta tres veces, con cinco minutos entre intentos. Si el resultado es incierto (timeout, error del proveedor 5xx o trabajador interrumpido), no se repite automáticamente para evitar duplicados. El panel señala avisos que necesitan atención.
- HTTP 404/410 del proveedor retira esa suscripción expirada. No se elimina la solicitud ni su historial.
- Los avisos pendientes de negocios inactivos, agenda deshabilitada o eventos de más de 24 horas se omiten. Suscripciones de solicitudes cerradas y registros de entrega terminados se limpian después de 30 días. Los historiales de ejecución de estas dos tareas se conservan siete días; no se alteran las tareas de otros sistemas.
- “Aceptado” significa aceptado por el servicio Push, no leído por el cliente. La recepción depende de permisos, conexión y ajustes del dispositivo. Correo, SMS y WhatsApp no se envían.
- El enlace de seguimiento conserva su actualización cada 20 segundos mientras está visible. Sigue funcionando sin activar avisos.

## Seguridad y validación

La cola, claves de suscripciones y tickets no son accesibles a anon/authenticated. Los reportes del panel comprueban permisos del negocio y no exponen endpoints ni claves. Las suscripciones requieren token privado y consentimiento explícito. Los destinos Push se limitan a proveedores conocidos (FCM, Mozilla y Apple).

pg_net solo recibe un ticket aleatorio de un uso, válido dos minutos, que únicamente permite procesar entregas ya autorizadas. No lleva service_role, VAPID ni una clave permanente. Su respuesta contiene solo contadores. Esto evita poner credenciales de larga duración en tablas internas de peticiones HTTP.

Pruebas locales: PostgreSQL/PGlite con RLS y permisos, reemplazo de eventos pendientes, leases y reintentos, tickets de un uso, tareas programadas con HTTP simulado, cliente/servidor, rutas del service worker, conservación de promociones y módulos. Envíos y cron reales pendientes de probar tras la instalación.

## Diagnóstico

- El botón indica “no configurados”: comprobar los cuatro secretos existentes de VAPID/PUBLIC_APP_URL y que commerce se desplegó con ambos archivos.
- Revisar Supabase → Cron: tarea balderas-commerce-push activa, ejecución por minuto. La configuración SQL de este proyecto usa https://aitupbowuekcfdqsksny.supabase.co/functions/v1/commerce.
- Consultar Edge Functions → commerce → Logs para errores de inicio; no compartir secretos ni claves privadas.
- Panel → Agenda → Actualizar: cada solicitud indica dispositivos activos, pendientes o avisos cuyo resultado no se confirmó.
- Si el cliente no recibe nada, revisar el permiso y probar el seguimiento instalado en iPhone. No registrar solicitudes o visitas duplicadas para corregir una notificación.

## Pausar o revertir

Pausar solo el envío automático: UPDATE cron.job SET active=false WHERE jobname='balderas-commerce-push'; Reactivar con active=true. Los avisos recientes pendientes podrán enviarse al reactivar.

Para revertir por completo la función de avisos: pausar ambas tareas propias, ejecutar DROP TRIGGER IF EXISTS commerce_event_push ON public.commerce_events; restaurar el index.ts anterior de commerce incluido en RESPALDO-commerce (push-policy.mjs puede quedarse sin uso) y republicar el despliegue anterior de Netlify. No borrar las tablas si se quiere conservar el historial. El código de Wallet no necesita cambios.

Referencias: https://supabase.com/docs/guides/cron/quickstart ; https://supabase.com/docs/guides/troubleshooting/database-roles-can-read-request-headers-queued-by-pg_net-ad6357 ; https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/
