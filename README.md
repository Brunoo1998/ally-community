# Ally Community

Foro en español para ASUS ROG Ally. Frontend estático, Cloudflare Pages Functions y SQLite en D1. La migración inicial solo contiene categorías y ajustes, sin publicaciones de muestra.

## Desarrollo y pruebas

Requisitos para la prueba de integración local: Node.js 24. Ejecuta `node tests/api.mjs`. Usa una base SQLite temporal en disco y sustituye solo la respuesta de Turnstile. Prueba las rutas reales y las migraciones. Para probar despliegue, binding y Turnstile reales configura un proyecto o entorno de vista previa con una D1 distinta y un widget independiente.

## Puesta en marcha

1. Crea el repositorio `ally-community` y sube este árbol. En Cloudflare verifica que la cuenta esté en Workers Free y que haya cuota disponible. Crea el proyecto Pages independiente `ally-community`. Si el nombre no está libre, usa la URL asignada y actualiza el parche de integración antes de aplicarlo.
2. Crea la D1 de producción `ally-community-db` y otra de pruebas. Configura el binding `DB` en cada entorno con la base correspondiente. Si declaras el binding en `wrangler.toml`, sustituye los ejemplos por los IDs verificados.
3. Aplica la migración a la base de pruebas primero. Con el binding configurado, ejecuta `npx wrangler d1 migrations apply DB --local` en un entorno local y `npx wrangler d1 migrations apply DB --remote` para la base remota que corresponda. Verifica el destino antes de ejecutar.
4. Crea un widget Turnstile Free para el dominio publicado. Define `TURNSTILE_SITE_KEY` como variable y `TURNSTILE_SECRET`, `RATE_SECRET` y `ADMIN_TOKEN` como secretos del proyecto. Genera claves independientes de al menos 32 bytes para los dos últimos y guárdalas en un gestor. No reutilices valores de Ally Lab. La verificación exige el hostname de la solicitud y la acción `community_session`.
5. Despliega desde la raíz con el directorio estático `public` y sin compilación. Con Pages Direct Upload mediante CLI, usa `npx wrangler pages deploy public --project-name ally-community`. El directorio `functions` debe permanecer en la raíz del proyecto en ambos casos.
6. Antes de abrir al público, completa identidad y contacto del responsable, plazos de conservación, procedimiento de retirada y ejercicio de derechos. Valida con asesoramiento adecuado las obligaciones concretas de un foro público. `contacto.html` indica el canal de denuncias dentro de los hilos y el contacto directo queda por definir.
7. Verifica desde dos navegadores independientes un alta Turnstile, una publicación, una respuesta, permisos de edición, denuncias, votos y administración. Verifica también el origen autorizado y las cuotas en el panel de Cloudflare.

## Ally Lab

`integration/ally-lab.patch` se preparó sobre el commit `358c4418be1f6fc3b8f27cd72ed1311a082fd7a2`. Añade «Comunidad» al menú y enlaces por ID de juego desde las fichas. El borrador toma la resolución, calidad y opciones identificables del preajuste visible y permite editarlas. Las FPS observadas quedan para el usuario. Aplica con `git apply --check ruta/ally-lab.patch` y `git apply ruta/ally-lab.patch` después de verificar el dominio y las escrituras en producción. Comprueba que la ficha de ida y vuelta funciona en ambas superficies de Ally Lab.

## Moderación y mantenimiento

Abre `/admin.html` y usa la clave privada. Cada ruta administrativa comprueba la clave en el servidor. La interfaz la mantiene en memoria hasta cerrar o recargar la página. Para una segunda capa, configura Cloudflare Access en un dominio compatible y cubre tanto la página como `/api/admin*`, incluidos accesos alternativos. La autenticación por clave sigue protegiendo los endpoints si se accede por otro dominio.

Los controles permiten gestionar categorías y denuncias, ocultar, eliminar, aprobar, fijar, cerrar, restringir sesiones, pausar publicaciones y activar solo lectura. La cola y el historial del panel muestran los 50 registros más recientes por tabla. Los votos se aplican con clave única y disparadores. El borrado vacía el texto y las ramas de comentarios conservan un marcador. Los contadores públicos no representan usuarios únicos. Las tendencias ordenan por votos y comentarios sobre los últimos siete días. Las estadísticas se calculan bajo demanda y se cachean hasta cinco minutos.

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
