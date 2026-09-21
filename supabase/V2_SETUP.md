# BALDERAS Reward V2 — versión de trabajo, sin publicar

Esta rama parte de `codex/business-status-toggle` e incluye su desactivación/reactivación de negocios. No sustituir la V1 publicada hasta terminar las pruebas con dispositivos y proveedores.

## Permisos

| Función | Superadmin | Owner activo | Staff | Cliente |
|---|---|---|---|---|
| Desactivar/reactivar negocio | Todos | No | No | No |
| Diseño, promociones y novedades | Todos | Sus negocios | No | No |
| Publicar o enviar notificaciones | Todos | Sus negocios | No | No |
| Guardar tarjeta/aceptar notificaciones | Su tarjeta | Su tarjeta | Su tarjeta | Su tarjeta |

Los controles de administración se verifican de nuevo en cada RPC y en la Edge Function. Ocultar botones no es el control de seguridad. Los suscriptores y sus claves Push no se exponen a Owner, Staff ni al público.

## Qué incluye

- Superadmin: Negocios → Administrar → Tarjeta y promociones. Owner: botón Tarjeta y promociones en su negocio.
- Nombre del programa, bienvenida, colores y enlace HTTPS de logotipo con vista previa. Los símbolos siguen en Administrar recompensas. No se agrega carga de archivos en este cambio; el logotipo debe tener una URL pública de imagen. Se eliminó el logo fijo de LG ESTUDIO de tarjetas de otros negocios.
- Promociones/novedades como borradores, publicación explícita en la tarjeta, vencimiento y archivo. Hasta 100 campañas recientes en el panel; hasta 20 vigentes en la tarjeta. Las publicadas no se editan: archivar y crear otra conserva el contenido enviado.
- PWA instalada con su tarjeta individual, detección de iPhone/Android, instrucciones y botón de instalación cuando el navegador lo permite. Necesita internet para consultar visitas; no se cachean tarjetas, saldos ni tokens para uso offline.
- Google Wallet con un pase por cliente y una clase por negocio, QR y enlace al progreso actualizado. **No incluye un saldo nativo sincronizado en segundo plano**: se consulta mediante el enlace. El diseño de la web cambia al recargar; la clase de Google se actualiza cuando se solicita guardar el pase. La suspensión bloquea el registro por QR y las consultas web, pero no elimina automáticamente la copia visual ya guardada en Wallet.
- Web Push voluntario para tarjetas instaladas/navegadores compatibles. Cada tarjeta tiene su suscripción; cancelarla no cancela tarjetas de otros negocios en el mismo navegador. iPhone requiere instalación en pantalla de inicio y una versión compatible de iOS (Web Push desde iOS 16.4). Se pide permiso solo al pulsar el botón.
- Avisos nativos de Google Wallet mediante mensaje al pase, separados de Web Push. El cliente debe permitir notificaciones en Google Wallet. Límite conservador de tres avisos por negocio/clase en 24 horas, además de las cuotas de Google. Se evita reenviar una campaña ya aceptada o de resultado incierto.

## Instalación, por orden

1. Ejecutar una vez `migrations/20260924_business_status.sql` si todavía no se instaló.
2. Ejecutar una vez `migrations/20260925_customer_experience.sql` completo. Crea tablas/RPC/políticas y bloquea visitas/canjes nuevos en negocios desactivados; no elimina datos ni envía mensajes. No volver a ejecutarla sobre tablas ya creadas.
3. Crear la Edge Function **loyalty-v2**, con `functions/loyalty-v2/index.ts` y `policy.mjs` en la misma carpeta. No reemplazar `admin-lifecycle` ni las funciones de altas existentes.
4. Solo para **loyalty-v2**, desactivar `Verify JWT with legacy secret` en el gateway, o desplegar con el `config.toml` incluido. Este endpoint incluye acciones públicas para tarjetas por token. Las acciones de gestión verifican `auth.getUser()`, los permisos del negocio y las RPC del servidor; la clave publicable no concede permiso de Owner. No desactivar esta opción en otras funciones por analogía.
5. Configurar los secretos del servidor descritos abajo. No pegarlos en archivos HTML/JS, GitHub ni en el chat.
6. Probar primero el panel con la rama descargada. Para instalación PWA, Push y Wallet usar una URL HTTPS de pruebas con estos archivos, configurada como PUBLIC_APP_URL; abrir archivos locales no permite probar esas integraciones. No confundir un enlace a la V1 publicada con una prueba de V2.

### Variables del servidor

Las variables integradas `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` se leen solo desde Edge Functions.

| Secreto | Valor |
|---|---|
| PUBLIC_APP_URL | URL HTTPS completa del directorio de esta versión, con `/` final. Al publicar: `https://kevinrewards.github.io/balderas-reward/` |
| VAPID_PUBLIC_KEY | Clave pública del par Web Push |
| VAPID_PRIVATE_KEY | Clave privada del mismo par |
| VAPID_SUBJECT | Contacto real `mailto:...` del administrador |
| GOOGLE_WALLET_ISSUER_ID | ID de emisor autorizado en Google Wallet |
| GOOGLE_SERVICE_ACCOUNT_JSON | JSON de la cuenta de servicio autorizada para ese emisor |

Generar VAPID en un equipo de confianza usando `web-push.generateVAPIDKeys()`; guardar ambas claves en Supabase Secrets. No rotarlas sin planificar la renovación de suscripciones existentes. Las claves no se generan ni se guardan en este repositorio.

Google requiere crear el emisor, habilitar la API y autorizar la cuenta de servicio. En modo demo solo probar con cuentas autorizadas; el lanzamiento público requiere aprobación de Google. Comprobar también los requisitos de marca del botón de Google Wallet antes de lanzar. Sin configuración los botones de Wallet/Push no aparecen en la tarjeta; el panel explica por qué no se puede enviar.

## Envíos y límites

Publicar en tarjetas no envía una alerta. Los botones de notificación requieren confirmación del Owner/Superadmin. **No se envió ninguna promoción real durante el desarrollo.**

Web Push procesa hasta 10 suscripciones por pulsación, con máximo tres intentos por entrega. Repetir el botón continúa pendientes; no hay un cron automático. Las aceptadas por el proveedor no se vuelven a seleccionar. Las suscripciones vencidas (404/410) se eliminan. Si el proceso muere tras enviar y antes de registrar el éxito, puede repetirse después de vencer el bloqueo de cinco minutos: no se promete entrega exactamente una vez. Una aceptación del proveedor no acredita recepción ni lectura.

Google Wallet limita y decide la visualización de alertas. Si el resultado de la llamada es incierto, queda bloqueado el reenvío de esa campaña hasta revisión técnica para evitar duplicados. No intentar resolverlo enviando repetidamente nuevas campañas. Archivar una campaña la retira de la web, pero no borra notificaciones ya recibidas ni mensajes ya guardados en Google; su vencimiento se envía al proveedor.

Las funciones públicas usan el token de tarjeta como credencial de acceso, igual que V1. Proteger los enlaces, controlar cuotas de Supabase/Google y habilitar límites de tráfico del despliegue antes de abrirlo a gran escala. No se prometen capacidad, notificaciones ni alojamiento ilimitados o gratuitos.

## Validación y aceptación antes de publicar

- Ejecutadas las 52 pruebas de regresión de V1.
- Ejecutada migración nueva en PostgreSQL WASM (PGlite), con pruebas de denegación Staff, Owner ajeno, acceso Superadmin, token inválido, borradores no públicos, negocios inactivos, privacidad de suscriptores y exclusión de envíos concurrentes.
- Pruebas de endpoints Push permitidos, enlaces de Wallet por cliente y ausencia de saldo nativo desactualizado.
- Verificar en Supabase real roles y políticas con usuarios de prueba. No implica que el servidor de producción ya tenga esta migración.
- Android: guardar pase demo, abrir QR, consultar progreso, enviar aviso de prueba con consentimiento.
- iPhone compatible: instalar desde Safari, abrir la app instalada, aceptar notificaciones, recibir un aviso de prueba y cancelar la suscripción de una sola tarjeta.
- Verificar diseño en móvil, promociones vencidas/archivadas, negocio desactivado y reactivado, denegación Staff invocando RPC directamente, doble clic/reintentos sin repetir aceptadas.
- Revisar cuotas, aprobación del emisor y casos de error del proveedor. Estas pruebas de dispositivos/proveedores están pendientes; no se considera lista para publicar todavía.

Pruebas locales:
```sh
node --test tests/*.test.cjs
node --test tests/wallet-policy.test.mjs
# Instalar @electric-sql/pglite en un entorno de pruebas y apuntar a su módulo:
PGLITE_MODULE=/ruta/node_modules/@electric-sql/pglite/dist/index.js node --test tests/customer-experience-db.test.mjs
```

Referencias oficiales: [Google Wallet](https://developers.google.com/wallet/retail/loyalty-cards), [emisión web](https://developers.google.com/wallet/retail/loyalty-cards/web), [avisos y cuotas](https://developers.google.com/wallet/retail/loyalty-cards/use-cases/trigger-push-notifications), [Apple Web Push](https://developer.apple.com/documentation/usernotifications/sending-web-push-notifications-in-web-apps-and-browsers).
