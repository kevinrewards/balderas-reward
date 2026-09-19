# Owners en negocios existentes

Ejecutar `migrations/20260923_assign_owner.sql` completo en SQL Editor. No crea cuentas ni vínculos al instalarse. Descargar la rama actualizada y abrir BALDERAS Admin → Owners → Crear o asignar Owner.

El selector muestra negocios activos por nombre y slug. Se asigna uno por operación, permitiendo repetir con el mismo correo para añadir otros negocios. La RPC exige Superadmin y obtiene el usuario existente por correo en el servidor. Solo cambia su membresía en el negocio seleccionado; conserva su perfil y demás accesos. Una membresía Staff pasa a Owner y una membresía inactiva se reactiva, previa confirmación explícita del formulario. Los guardas de cuentas retiradas de la migración de bajas siguen aplicándose.

Si la cuenta no existe se reutiliza la Edge Function `create-business-owner` ya instalada, con el mismo contrato del asistente de negocios. No se dispone de su código en este repositorio: es necesario probar su alta en un negocio existente y revisar cualquier rechazo del servidor. No hay cambios en `admin-lifecycle` ni nuevas Edge Functions que desplegar. Un alta parcial o un correo fallido no se revierte borrando automáticamente la cuenta; revisar la lista y reintentar según el mensaje.

Pruebas antes de publicar: correo nuevo en negocio existente; mismo correo en otro negocio; cuenta que ya es Staff; Owner inactivo; intento de Owner/Staff invocando la RPC (debe rechazar). Confirmar que los demás negocios no cambian y que el negocio no se duplica. Probar el envío/recepción del acceso de una cuenta nueva con un correo de prueba bajo tu control. La autorización se comprueba también en servidor, no solo en el botón.
