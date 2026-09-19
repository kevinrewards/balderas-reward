# Gestión de negocios y Owners — instalación previa a publicar

Estos archivos no se aplican automáticamente a Supabase al descargar o publicar la web.

1. Ejecutar completo `migrations/20260921_admin_lifecycle.sql` en SQL Editor. Crea funciones, una cola de bajas y protecciones; no elimina registros existentes. El aviso de operaciones destructivas corresponde a reemplazar triggers, no a borrar negocios.
2. Desplegar la Edge Function `admin-lifecycle`, incluyendo **ambos archivos** de `functions/admin-lifecycle/`. Desde esta carpeta del proyecto con Supabase CLI autenticada:

   ```sh
   supabase functions deploy admin-lifecycle --project-ref aitupbowuekcfdqsksny
   ```

   Usa las variables integradas del servidor `SUPABASE_URL`, `SUPABASE_ANON_KEY` y `SUPABASE_SERVICE_ROLE_KEY`. Nunca copiar la clave de servicio a JavaScript del navegador. La función verifica el usuario y su condición de Superadmin en cada solicitud; las RPC también verifican el permiso. No desactivar la validación JWT de la puerta de entrada como solución a errores sin revisar su configuración.
3. Ejecutar `tests/admin_lifecycle_rollback.sql` desde SQL Editor. El script usa las cuentas previamente identificadas en este proyecto, crea negocios temporales y termina con ROLLBACK. No llama a Auth ni elimina cuentas reales. Si ocurre un error, ejecutar ROLLBACK antes de continuar. Revisar el resultado; no publicar si falla.
4. Descargar de nuevo la rama `codex/business-control-center`. Probar con un negocio y un Owner de prueba: desactivar/reactivar, quitar un Owner con otro negocio, quitar un Owner sin otros vínculos y eliminar un negocio. Verificar los resultados también desde la segunda cuenta. Probar que Owner y Staff reciban rechazo al llamar las nuevas funciones. La prueba de baja real de Auth requiere una cuenta desechable.

## Comportamiento

- Solo Superadmin puede usar estas acciones. Owner sigue administrando sus recompensas y Staff; Staff conserva sus funciones actuales.
- Desactivar/reactivar afecta únicamente al vínculo de Owner seleccionado. Superadmin puede dejar el negocio sin Owners activos y asignar otro posteriormente. Las cuentas y vínculos de Superadmin no pueden retirarse desde la gestión de Owners.
- Eliminar un negocio borra su personalización, membresías, clientes, recompensas, visitas y canjes. Se muestran cantidades y se exige escribir su nombre; el servidor vuelve a comparar el alcance. Referencias inconsistentes entre negocios bloquean el borrado.
- Eliminar un Owner quita su vínculo, conservando el negocio y su historial. Si conserva otra membresía (incluso Staff o inactiva), una tarjeta de cliente vinculada o acceso de plataforma, se conserva la cuenta.
- Sin otros vínculos, la cuenta pasa a una cola duradera y se elimina mediante `auth.admin.deleteUser(id, true)`. Es una baja irreversible de Auth, no una desactivación reversible. Se retiene la referencia de identidad requerida por visitas/canjes y no se borra el historial de otros negocios. No equivale a purgar todos los datos personales de todas las tablas.
- La transacción de datos y la baja de Auth son pasos separados. Si Auth falla, la interfaz informa que los datos ya cambiaron y ofrece **Reintentar bajas de cuentas pendientes** en BALDERAS Admin. Las cuentas en cola no pueden recibir nuevos vínculos, evitando una baja accidental después de reasignarlas. Se procesan hasta 50 por reintento.
- La vista de cada negocio tiene secciones independientes Personal, Clientes y Recompensas. BALDERAS Admin permanece disponible aunque Superadmin no tenga negocios asignados. Staff mantiene la vista expandida.

Referencia de Supabase: https://supabase.com/docs/reference/javascript/auth-admin-deleteuser

## Validación local

`node --test tests/*.test.cjs` prueba la autorización del manejador, el rechazo previo a Auth, el uso exclusivo de IDs de la cola, los fallos parciales, los reintentos, el destino de acciones por negocio y las secciones plegables, además de las pruebas anteriores.
Las pruebas con mocks no sustituyen ejecutar la migración y las pruebas SQL en el proyecto ni probar Auth con una cuenta desechable.
