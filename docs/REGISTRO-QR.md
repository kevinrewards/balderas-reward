# Registro público por negocio

Instalar en este orden:

1. Ejecutar `supabase/migrations/20260930_public_registration.sql` en SQL Editor de Supabase.
2. Crear/desplegar la Edge Function `customer-registration` con `supabase/functions/customer-registration/index.ts`. Desactivar Verify JWT para esta función pública. Usa los secretos SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY ya proporcionados por Supabase; no colocar claves privadas en el frontend.
3. Publicar el frontend completo en Netlify, incluyendo registro.html, registro.js, registration.css y business-registration.js.
4. Entrar como Owner o Staff, seleccionar el negocio y abrir QR de registro. Probar una tarjeta con nombre, sin contactos opcionales. Debe abrir card.html y tener cero visitas. Actualizar clientes en el panel. Confirmar una visita con el flujo autorizado existente.

Cada negocio recibe un código público permanente. La migración agrega códigos a los existentes y un trigger los genera para nuevos negocios. Reejecutar la migración no cambia códigos. El código público permite registrarse; no da acceso a listas de clientes ni a confirmación de visitas.

El registro manual, compartir tarjetas y la confirmación de visitas mantienen sus implementaciones actuales. El registro público no inserta visitas ni activa notificaciones.

La misma solicitud puede reintentarse sin duplicados mediante un UUID guardado en la sesión del navegador. No se recuperan tarjetas por correo/teléfono sin verificación: una nueva solicitud puede crear otra tarjeta. El enlace guardado localmente facilita reabrir la tarjeta en el mismo dispositivo.

Protección básica: formulario señuelo, validación en servidor, límite de 300 registros por negocio/hora y 30 por huella de IP/10 minutos. El registro técnico se limpia después de siete días cuando hay nuevos registros; no borra clientes. Estos controles no equivalen a CAPTCHA ni a verificación de identidad. El límite por IP depende de las cabeceras suministradas por el gateway.

Validación local: 65 pruebas automatizadas, incluyendo permisos, aislamiento entre negocios, reintentos y cero visitas al registrar; navegador Chromium con backend simulado para formulario, navegación a tarjeta, QR Owner/Staff, registro manual conservado y diseño móvil. Falta validar el despliegue real de Supabase/Netlify.
