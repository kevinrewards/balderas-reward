# Historial de visitas

1. Ejecutar `migrations/20260922_visit_history.sql` en Supabase SQL Editor. Es independiente de la migración de bajas. Instala una RPC de lectura y un índice, sin cambiar visitas existentes. Al finalizar devuelve las definiciones actuales de las dos funciones que registran visitas para revisar `registered_by = auth.uid()`.
2. Descargar la última versión de la rama `codex/business-control-center`. Owner: Clientes → Historial de visitas. Superadmin: Negocios → Administrar → Historial de visitas, incluso en negocios sin membresía propia.
3. Probar hoy, semana (lunes–domingo), mes, fechas personalizadas y un intervalo sin visitas. Comparar el total con las filas de CSV. Registrar una visita manual y otra por QR con una cuenta Staff de prueba y comprobar el responsable en ambas. Confirmar que Staff y un Owner de otro negocio reciben rechazo al invocar la RPC directamente.

El reporte usa la zona horaria del dispositivo y la muestra en pantalla y CSV; todavía no hay configuración de zona por negocio. Ambas fechas son inclusivas. Los totales se calculan en el servidor y no dependen de la página visible. La tabla muestra 200 filas por página y la descarga recorre todas las páginas. La hora de corte evita incorporar visitas nuevas ordinarias durante la consulta. Si se detectan cambios o una descarga incompleta se pide repetir; no es una instantánea transaccional entre solicitudes.

Se muestra el cliente, la fecha/hora y el nombre e ID del usuario en `visits.registered_by`. No se inventa el responsable de registros antiguos sin ese dato. Se utilizan nombres actuales de clientes y perfiles, no una copia histórica de sus nombres ni su rol actual. El campo no distingue registro manual de aprobación QR.

Las definiciones aportadas anteriormente por el usuario de `register_visit` y `register_visit_by_token` ya insertan `auth.uid()` en `registered_by`. La consulta final de la migración permite comprobar que siguen así en Supabase. Este desarrollo no cambia esas funciones ni instala nada automáticamente en la base real.

El acceso se valida en cada página y exportación: Superadmin global o Owner activo del negocio (`can_manage_business_settings`). Staff mantiene sus funciones operativas, sin acceso a este reporte. CSV UTF-8 compatible con Excel, con protección contra fórmulas introducidas en nombres.

Los reportes son consultables bajo demanda; no se programan envíos diarios por correo. Eliminar un negocio también elimina su historial conforme a las relaciones existentes: descargar el CSV antes de una baja si se desea conservarlo.

Validación local: `node --test tests/*.test.cjs`. Falta comprobar migración/permisos en Supabase y la vista en navegador antes de publicar.
