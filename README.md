# Ally Community

Foro en español para ASUS ROG Ally. Frontend estático, Cloudflare Pages Functions y SQLite en D1. La migración inicial solo contiene categorías y ajustes, sin publicaciones de muestra.

## Desarrollo y pruebas

Requisitos para la prueba de integración local: Node.js 24. Ejecuta `node tests/api.mjs`. Usa una base SQLite temporal en disco y sustituye solo la respuesta de Turnstile. Prueba las rutas reales y las migraciones. Para probar despliegue, binding y Turnstile reales configura un proyecto o entorno de vista previa con una D1 distinta y un widget independiente.

## Puesta en marcha

1. Crea el repositorio `ally-community` y sube este árbol. En Cloudflare verifica que la cuenta esté en Workers Free y que haya cuota disponible. Crea el proyecto Pages independiente `ally-community`. Si el nombre no está libre, usa la URL asignada y actualiza el parche de integración antes de aplicarlo.
2. Crea la D1 de producción `ally-community-db` y otra de pruebas. Configura el binding `DB` en cada entorno con la base correspondiente. Si declaras el binding en Wrangler para trabajar en local, copia `wrangler.example.toml` y sustituye los ejemplos por los IDs verificados. En Pages conectado a Git, gestiona las variables y los bindings en el panel.
3. Aplica la migración a la base de pruebas primero. Con el binding configurado, ejecuta `npx wrangler d1 migrations apply DB --local` en un entorno local y `npx wrangler d1 migrations apply DB --remote` para la base remota que corresponda. Verifica el destino antes de ejecutar.
4. Crea un widget Turnstile Free para el dominio publicado. Define `TURNSTILE_SITE_KEY` como variable y `TURNSTILE_SECRET`, `RATE_SECRET` y `ADMIN_TOKEN` como secretos del proyecto. Genera claves independientes de al menos 32 bytes para los dos últimos y guárdalas en un gestor. No reutilices valores de Ally Lab. La verificación exige el hostname de la solicitud y la acción `community_session`.
5. Despliega desde la raíz con el directorio estático `public` y sin compilación. Con Pages Direct Upload mediante CLI, usa `npx wrangler pages deploy public --project-name ally-community`. El directorio `functions` debe permanecer en la raíz del proyecto en ambos casos.
6. Antes de abrir al público, completa identidad y contacto del responsable, plazos de conservación, procedimiento de retirada y ejercicio de derechos. Valida con asesoramiento adecuado las obligaciones concretas de un foro público. `contacto.html` indica el canal de denuncias dentro de los hilos y el contacto directo es allycommunity.contact@gmail.com.
7. Verifica desde dos navegadores independientes un alta Turnstile, una publicación, una respuesta, permisos de edición, denuncias, votos y administración. Verifica también el origen autorizado y las cuotas en el panel de Cloudflare.

## Ally Lab

`integration/ally-lab.patch` se preparó sobre el commit `358c4418be1f6fc3b8f27cd72ed1311a082fd7a2`. Añade «Comunidad» al menú y enlaces por ID de juego desde las fichas. El borrador toma la resolución, calidad y opciones identificables del preajuste visible y permite editarlas. Las FPS observadas quedan para el usuario. Aplica con `git apply --check ruta/ally-lab.patch` y `git apply ruta/ally-lab.patch` después de verificar el dominio y las escrituras en producción. Comprueba que la ficha de ida y vuelta funciona en ambas superficies de Ally Lab.

## Acceder al mismo perfil desde otro dispositivo

Se conserva el flujo existente de **código de recuperación** y se añade otra opción independiente: **nombre de usuario + clave de acceso entre dispositivos**.

1. En un dispositivo donde el usuario ya tenga la sesión iniciada, abrir **Mi perfil → Generar clave para otros dispositivos**. El servidor genera un secreto criptográficamente aleatorio de 32 bytes (64 caracteres hexadecimales), lo devuelve una sola vez y guarda su SHA-256 en `profiles.device_key_hash`. Se debe copiar a un gestor de contraseñas; no se guarda en `localStorage`.
2. En un segundo navegador o dispositivo, abrir **Elegir nombre → Ya tengo cuenta · Acceder desde otro dispositivo**, completar el desafío Turnstile cuando corresponda y escribir **nombre de usuario + clave**. No se crea un perfil nuevo: se reutilizan las publicaciones, votos, seudónimo y rol anteriores.
3. En **Mi perfil → Renovar clave**, se emite otro secreto; el anterior deja de servir para futuras entradas. Las sesiones ya establecidas permanecen abiertas. El código de recuperación original es independiente y sigue funcionando.
4. Si el usuario pierde la clave, puede generar otra desde algún navegador aún autenticado o recuperar su perfil mediante el código de recuperación. Si pierde todos los accesos y el código, no existe recuperación mediante correo: el foro no solicita una dirección de correo electrónico.

La API aplica límites por IP+usuario, almacenados como identificadores HMAC temporales, sin guardar la IP en claro en la tabla de claves. El acceso desde otros dispositivos utiliza cookies de sesión `Secure`, `HttpOnly` y `SameSite=Lax`, con caducidad máxima de 180 días. La migración `0005_device_access.sql` es aditiva y se aplicó a la D1 de producción por API: no se debe repetir el `ALTER TABLE` si la columna ya está presente.

## Visitas únicas y ranking

El contador se inicia al abrir una publicación completa (`/?post=ID`), no al mostrar tarjetas en el listado. La llamada POST a `/api/visits` requiere origen del propio sitio y valida que el post sea público. La tabla `post_views` identifica una sola visita por publicación y visitante; un disparador incrementa `posts.views` solo cuando se inserta una combinación nueva. Se aplica una cuota temporal por IP seudonimizada con `RATE_SECRET`, pero la IP no se guarda en `post_views`.

- Perfil identificado: la deduplicación se basa en el identificador de perfil, incluso al recuperar el perfil desde otro dispositivo.
- Visitante sin perfil: cookie de primera parte `__Host-ally_visitor`, aleatoria, `Secure`, `HttpOnly`, `SameSite=Lax`, duración máxima 365 días. Solo se almacena su hash en la tabla de visitas.
- El contador es una **estimación de visitantes únicos reconocibles**, no una cifra infalible de personas: un navegador nuevo, las cookies borradas o el uso del foro antes de identificarse pueden contarse de nuevo. No se contabilizan visitas anteriores a la puesta en marcha.
- El filtro «Más visitadas» ordena por `posts.views`, prescindiendo de la prioridad de publicaciones fijadas. «Estadísticas» muestra los cinco posts con más vistas; el resumen puede actualizarse hasta 60 segundos después.
- La migración `0004_post_unique_views.sql` es aditiva y se aplicó a la D1 de producción por API. Antes de ejecutar migraciones manualmente en producción, comprueba los objetos existentes para no repetir el `ALTER TABLE`.
- El uso de un identificador de visitante y su conservación requieren revisión legal. La política de privacidad publicada lo documenta provisionalmente; el responsable debe fijar plazo de supresión y la base jurídica o consentimiento exigible antes de considerarla definitiva.

## Moderación y mantenimiento

Abre `/admin.html` y usa la clave privada. Cada ruta administrativa comprueba la clave en el servidor. La interfaz la mantiene en memoria hasta cerrar o recargar la página. Para una segunda capa, configura Cloudflare Access en un dominio compatible y cubre tanto la página como `/api/admin*`, incluidos accesos alternativos. La autenticación por clave sigue protegiendo los endpoints si se accede por otro dominio.

Los controles permiten gestionar categorías y denuncias, ocultar, eliminar, aprobar, fijar, cerrar, restringir sesiones, pausar publicaciones y activar solo lectura. La cola y el historial del panel muestran los 50 registros más recientes por tabla. Los votos se aplican con clave única y disparadores. El borrado vacía el texto y las ramas de comentarios conservan un marcador. Los contadores de publicaciones, comentarios y votos no representan usuarios únicos; el contador de visitas intenta deduplicar por perfil o navegador. Las tendencias ordenan por votos y comentarios sobre los últimos siete días. Las estadísticas se calculan bajo demanda y se cachean hasta cinco minutos.

### Copias de seguridad y restauración

- Activa solo lectura durante una copia coherente. Exporta D1 con `npx wrangler d1 export ally-community-db --remote --output copia.sql`. Conserva la copia cifrada fuera del repositorio. La exportación por tablas del panel es para revisión y portabilidad, no sustituye la copia SQL.
- Conserva la revisión de Git y las migraciones que correspondan a la copia. Guarda los secretos por separado en el gestor de claves.
- Prueba la restauración en una base D1 nueva con `npx wrangler d1 execute NOMBRE_PRUEBAS --remote --file copia.sql`. Verifica filas, búsquedas, contadores, sesiones y permisos antes de cambiar un binding de producción.
- En una incidencia, usa modo de solo lectura, conserva la base anterior y restaura primero en una vista previa. Actualiza el binding de producción solo tras comprobar la recuperación.
- Revisa caducidad de sesiones, ventanas de cuota y conservación de denuncias y auditoría según la política efectiva. Expirar una sesión cancela su acceso. El hash de sesión puede permanecer asociado a contenido publicado.

### Referencias oficiales

- [Turnstile](https://developers.cloudflare.com/turnstile/get-started/)
- [Bindings de Pages](https://developers.cloudflare.com/pages/functions/bindings/)
- [Cuotas D1](https://developers.cloudflare.com/d1/platform/pricing/)
- [Cuotas Workers](https://developers.cloudflare.com/workers/platform/limits/)

## Fotos adjuntas
Hasta 3 fotos por publicación y 2 por comentario. El navegador reduce a 1600 px y 150 KB por imagen WebP; la API verifica contenedor y dimensiones y rechaza bloques adicionales. La migración 0007 añade las columnas y un presupuesto global de 100 MB de datos codificados; no activa R2 ni servicios de pago. Las imágenes se sirven bajo las mismas restricciones de visibilidad que su contenido y se vacían al eliminarlo. Aplica la migración antes de publicar el código; las exportaciones JSON del panel incluyen el número de fotos, no su contenido. Las copias D1 completas sí incluyen las fotos.

## Informes privados de moderación
La migración 0008 crea admin_notifications. La tarea de moderación escribe informes con una clave de entrega idempotente y destinatario resuelto por el rol admin único. El endpoint /api/admin-notices comprueba la sesión y el rol admin, además del owner, y no devuelve informes a visitantes ni miembros. Notificaciones muestra historial, contador y marcado de lectura. La bandeja no concede permisos para suspender cuentas. No contiene credenciales ni datos privados del titular.

## Ally como participante virtual
Migración 0009: perfil reservado Ally (miembro de servicio, no puede iniciar sesión), pausa y registro idempotente. La tarea horaria genera respuestas contextuales; la inserción controlada en ally_bot_replies respeta estado del hilo, moderación previa, solo lectura y cuotas de 8 respuestas cada 24h, 2 por hilo cada 24h y 1 por hilo cada hora. Stickers con lista cerrada y recurso local ally.webp.

## Estado en línea
Migración 0010: presencia voluntaria por perfil, consentimiento inicial explícito y revocable desde Mi perfil. Señal de 150 segundos, renovación aproximadamente cada minuto solo con la pestaña visible, consultas de hasta 80 nombres, sin publicar fechas ni historial. Ally IA no anuncia presencia humana. Las filas caducadas se purgan con las peticiones de presencia.

## Amigos y mensajes privados
Migración 0011: solicitudes aceptadas de forma explícita, bloqueos, mensajes de texto entre miembros de cada relación, límites por cuenta y conversación, lectura paginada y contador. Mensajes accesibles durante 30 días, limpieza acotada al usar la función, eliminación del chat al romper amistad/bloquear. Sin cifrado extremo a extremo. Última actividad aproximada solo para amigos y con autorización adicional; no se consulta por la IA pública. Sondeo visible cada 15 s dentro de chat y cada minuto para avisos; no requiere servicios nuevos.

## Notificaciones sociales
Migración 0012: solicitudes entrantes y mensajes no leídos se muestran directamente desde sus tablas, sin duplicar contenidos. Las respuestas explícitas de amistad crean avisos privados al solicitante con caducidad de 30 días. Cancelar, bloquear o caducar no crea aviso de rechazo. El contador combina los avisos sociales y de administración, sin exponer texto de chat.
