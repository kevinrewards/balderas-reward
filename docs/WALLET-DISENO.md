# Diseño de Google Wallet

Preparado sobre la versión de módulos publicada y probada el 9 de octubre de 2026. Esta actualización todavía necesita publicarse manualmente en Supabase y Netlify. No cambia tablas ni requiere SQL.

## Publicación

1. Descarga y extrae `BALDERAS-Reward-diseno-wallet.zip`.
2. Supabase → Edge Functions → loyalty-v2 → Code. Reemplaza TODO `index.ts` con el contenido de `01-index.txt`; reemplaza TODO `policy.mjs` con `02-policy.txt`. Conserva los nombres de destino y no crees archivos con extensión .txt en Supabase.
3. Añade `art.mjs` con Add File y pega TODO `03-art.txt`. Si ya existe, reemplaza su contenido. La función necesita los tres archivos juntos. Los .txt se pueden abrir con Bloc de notas. Conserva las variables de entorno actuales.
4. Pulsa Deploy updates. En Settings, Verify JWT with legacy secret debe seguir apagado: imágenes y acciones con token son públicas; la administración conserva su comprobación de identidad.
5. Extrae `04-netlify-web.zip` y publica esa carpeta en Deploys del sitio ACTUAL balderas-reward. Incluye todo el sitio, también catálogo y agenda. No subas el instalador externo con los archivos de servidor.
6. Abre el panel con Ctrl+F5 → Tarjeta y promociones. Prueba la vista previa y guarda los colores deseados.
7. Abre una tarjeta de prueba → Actualizar pase guardado (si ya existe) o Agregar a Google Wallet. Conserva el mismo ID; no necesita borrar el pase.
8. En Android comprueba logo, saldo, meta, imagen, recompensa, QR y enlaces. Registra una visita y un canje de prueba. Revisa el saldo y los sellos después de cada operación. Si Google tarda o una conexión falla, usa Actualizar pase guardado en la tarjeta web.

## Comportamiento y límites

- Colores, logo y nombre proceden de la configuración actual del negocio. No se agrega una nueva configuración por separado.
- Sellos PNG 1032×812: estrella, cámara, corazón, café o regalo según el símbolo configurado en Administrar recompensas. Los símbolos no compatibles usan estrella. Si el contraste de colores resulta insuficiente, la imagen utiliza blanco o negro para conservar la legibilidad.
- Meta igual a la tarjeta web: máximo entre 10 y los requisitos de las recompensas activas devueltas por get_loyalty_card. Hasta 20: sellos individuales. Más de 20: barra proporcional.
- El saldo procede del servidor; valores enviados por el navegador no pueden alterarlo. No modifica visitas, canjes ni recompensas.
- Tras registrar una visita desde el panel o el QR, o canjear desde el panel, se intenta actualizar el pase existente. Nunca crea un pase mediante esa sincronización. Un fallo de Wallet no revierte ni repite la operación original.
- Es sincronización al operar desde la web, no una cola durable ni una tarea programada. Cerrar la página, fallos de red, escrituras directas en SQL u operaciones concurrentes pueden dejar el pase desactualizado. La tarjeta web sigue siendo la referencia; el botón manual vuelve a consultar el saldo actual. Google controla cuándo muestra los cambios.
- Guardar colores/recompensas no recorre todos los clientes: cada objeto incorpora sus imágenes y saldo al agregar/actualizar el pase o en la siguiente operación. Cambios de clase, como fondo/nombre/plantilla, afectan a la clase compartida cuando se actualiza un pase del negocio.
- La fecha de sincronización se muestra en los detalles del pase en UTC. No se prometen notificaciones de cada visita.
- No cambia la aprobación de Google, cuotas, planes ni añade Apple Wallet nativo. La tarjeta web/PWA permanece disponible.
- La vista previa es aproximada: el QR mostrado es un marcador de posición. Google determina el renderizado final.
- La URL de arte solo contiene números, colores e icono. No incluye nombre, ID ni token de cliente; tampoco obtiene imágenes remotas.

## Validación técnica

Pruebas de PNG y sus dimensiones/decodificación, progreso tras canjes, recompensas disponibles, payload de Google, token privado ausente en imágenes, refresh sin crear pases, bloqueo por módulo, enlaces por negocio, vista previa con texto escapado y sincronización fallida sin repetir operaciones. Pruebas de API de Google simuladas: falta prueba real en Supabase/Google tras el despliegue manual.

Fuentes oficiales: https://developers.google.com/wallet/retail/loyalty-cards/resources/brand-guidelines y https://developers.google.com/wallet/retail/loyalty-cards/resources/template

## Volver atrás

El paquete contiene `RESPALDO-loyalty-v2/` con index.ts y policy.mjs anteriores. Para revertir, restaura ambos y despliega; art.mjs puede quedar sin utilizar. En Netlify vuelve a publicar el despliegue anterior. No hay migración de datos que deshacer. Los pases ya actualizados conservan su aspecto hasta que se actualicen de nuevo; no se eliminan automáticamente los campos opcionales existentes en Google.

## Corrección v2 de figuras
El paquete combinado docs/AVISOS-SOLICITUDES.md sustituye la limitación inicial a cinco iconos. Se respetan progress_emoji y empty_emoji usando gráficos Twemoji incluidos en assets/wallet-emoji-v2.zip, con atribución CC-BY 4.0. La imagen usa v=2. Consultar las instrucciones combinadas para instalación y límites.
