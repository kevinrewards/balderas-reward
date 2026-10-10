# Alta de negocio con Owner

Corrección para el error `new row violates row-level security policy` antes de llegar a la invitación.

1. Ejecutar `supabase/migrations/20260930_business_setup_permissions.sql` en SQL Editor.
2. Ejecutar `supabase/migrations/20260930_business_logo_rls.sql`: corrige la consulta de existencia del negocio en Storage cuando RLS lo oculta al Superadmin antes de asignar Owner.
3. Publicar frontend completo en Netlify, incluyendo `new-business-workflow.js`, app.js e index.html actualizados.
4. Crear un negocio nuevo como Superadmin, con logo y un correo nuevo; confirmar recepción de invitación. Para un correo existente, se vincula la cuenta sin crearla ni enviar otra invitación.

La migración agrega permisos exclusivos de Superadmin para SELECT/INSERT/UPDATE de branding y carga de logos en business-assets, dentro de carpetas de negocios existentes. Mantiene las políticas de Owner/Staff y RLS activado. No elimina datos ni configura envíos de correo.

El formulario valida datos antes de crear. Guarda checkpoints después de recibir el ID del negocio, cargar el logo y guardar el diseño. Si falla un paso posterior, Continuar alta reutiliza el negocio confirmado. El checkpoint se guarda por administrador e identificador en sessionStorage, con respaldo en memoria. No recupera altas anteriores a esta versión ni garantiza idempotencia si la respuesta inicial con el ID nunca llega. No se reutiliza automáticamente un negocio existente desconocido ni se elimina un alta parcial.

Una invitación nueva depende del servicio de correo de Supabase y sus límites. El formulario muestra el error original y el paso que falló. Para cuentas existentes reutiliza el flujo ya instalado de asignación al negocio.

Pruebas: permisos RLS en PostgreSQL, reintentos después de fallos de logo/diseño/Owner, persistencia tras recarga, separación por administrador y validación previa. El resto de las pruebas del proyecto pasa. El despliegue real debe verificarse con el usuario.

Regresión de Storage: la prueba reproduce el bloqueo con RLS activado en businesses y sin membresía para el Superadmin. La función SECURITY DEFINER solo devuelve un permiso booleano tras comprobar identidad, Superadmin, bucket y carpeta de negocio existente. No revela datos del negocio ni concede permisos a Owner/Staff.
