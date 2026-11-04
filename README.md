# Bus Co-Pilot

Web independiente para consultar recorridos de autobús de Sevilla, ver sus paradas, seguir la posición del móvil sobre el mapa y descargar el sentido elegido como GPX.

## Web de prueba

El proyecto es público por decisión del propietario y la web se publica desde `docs/` mediante GitHub Pages:

https://ndj4hfhj4v-web.github.io/lineas-bus-sevilla-gpx/

La web de Netlify es una publicación independiente.

## Preparación automática y uso sin conexión

1. Abre la web HTTPS e instálala en la pantalla de inicio si la vas a utilizar como aplicación.
2. Abre el icono mientras tienes conexión. La aplicación guarda automáticamente todas las líneas, sentidos, paradas y GPX en IndexedDB y completa el callejero IGN alrededor de toda la red, en niveles de zoom 11 a 18.
3. Consulta el progreso en Opciones → Información. La primera preparación puede tardar bastante; las peticiones se espacian al menos 250 ms para no saturar el proveedor. Con la red integrada de unas 10.300 imágenes, una descarga desde cero requiere del orden de tres cuartos de hora, además del tiempo de red y almacenamiento. La navegación online no queda bloqueada.
4. Al ocultar o cerrar la app se pausa el trabajo. Se reanuda al volver y reutiliza cada imagen que ya esté guardada. Se verifican las entradas de la caché antes de declarar la red disponible sin conexión.
5. Cuando el estado lo confirme, prueba el modo avión desde ese mismo icono. Mapbox es el proveedor inicial (se respeta una elección anterior de IGN); sin conexión se utiliza el callejero IGN guardado. Al volver la conexión se recuperan proveedor y tipo de mapa preferidos.

Los mapas preparados se conservan en una caché protegida separada de las 384 imágenes temporales. Se deduplican las calles compartidas por varias líneas y se admite un máximo de 24.000 imágenes protegidas, sujeto al espacio que permita el navegador. Solo se guardan imágenes CORS válidas de IGN; los recursos de Mapbox no se precargan. Los paquetes anteriores se reutilizan. El gestor evita descargas concurrentes entre pestañas mediante Web Locks cuando está disponible, solicita almacenamiento persistente y vuelve a comprobar los mapas al abrir la app. El sistema operativo o el usuario pueden eliminar los datos: la disponibilidad permanente no está garantizada.

Los controles manuales de guardar, filtrar copias y borrar mapas se han retirado. El listado de paradas permanece en Opciones → Paradas del recorrido y la exportación GPX sigue en su apartado. Las consultas de datos actualizadas preparan automáticamente la nueva cobertura sin sustituir el recorrido que se está siguiendo.

## Funciones

- Búsqueda de líneas y selección del sentido de marcha.
- Cabeceras cuadradas (inicio verde y final marrón) y paradas intermedias circulares, con tamaño adaptado al zoom de navegación.
- Interfaz compacta, sin bloques de instrucciones ni descarga conjunta de toda la red.
- Mapa a pantalla completa al abrir el recorrido con GPS, con giro según la dirección del desplazamiento.
- Solo un botón de regreso al tocar el mapa, que se oculta tras cinco segundos, y un icono de ubicación para recuperar el seguimiento.
- Exportación GPX de la línea, con archivos separados por sentido, trazado y paradas.
- Actualización de trazados y paradas desde IDE Sevilla; copia integrada si la consulta falla.
- Instalación desde navegadores compatibles mediante un manifiesto web.

El GPS necesita HTTPS, permiso de ubicación y la pantalla abierta; una ruta preparada no necesita Internet para iniciarse. El centrado se suaviza entre posiciones fiables. Arrastrar el mapa pausa el seguimiento; tocar el icono de ubicación (la diana de la esquina inferior derecha del mapa) lo centra de nuevo y reactiva el seguimiento. Volver al inicio cierra la navegación y libera el GPS. Se intenta impedir el apagado mediante Screen Wake Lock cuando el navegador y la versión de iOS lo permiten. No ofrece voz, instrucciones giro a giro ni recálculo de rutas. El giro utiliza el rumbo GPS o el desplazamiento entre posiciones; parado o con mala precisión mantiene la orientación anterior. Las pruebas automatizadas cubren señal antigua, pérdida temporal, recuperación, giro y pausa del seguimiento con posiciones simuladas. Se ha comprobado el arranque con el servidor local apagado y la recuperación de líneas guardadas. Queda pendiente la prueba real en iPhone y modo avión, especialmente GPS y Wake Lock. No se conserva un historial de posiciones.

## Estructura

- `src/`: archivos de desarrollo, iconos y copia de los datos.
- `docs/`: web lista para publicar en GitHub Pages.
- `scripts/`: generación, validación y servidor local.
- `tests/`: pruebas de navegación GPS, estados de carga y descarga.

## Desarrollo

Requiere Node.js 22 o posterior. No necesita instalar dependencias.

```sh
npm run build
npm test
npm start
```

Abre la dirección que muestra el servidor. Modifica `src/` y ejecuta la generación antes de subir cambios. La generación conserva el manifiesto y sus iconos, también al publicar bajo el nombre de un repositorio.

## Publicar con GitHub Pages

1. Sube este proyecto a un repositorio de GitHub.
2. En el repositorio, abre **Settings → Pages**.
3. Selecciona **Deploy from a branch**, rama **main**, carpeta **/docs**, y guarda.
4. GitHub mostrará la dirección cuando termine la publicación.

Para actualizar la web, genera `docs/`, ejecuta las pruebas y sube tanto los cambios de `src/` como los de `docs/`. GitHub Pages publicará los archivos de esa carpeta. No es necesario Netlify.

## Datos y mapa

Los recorridos y las paradas se consultan en los servicios públicos de IDE Sevilla. No se extraen de la página comercial del operador. El botón **Actualizar datos** vuelve a consultar esos servicios; los GPX ya guardados deben descargarse de nuevo para renovarlos. Los desvíos temporales pueden no estar reflejados.

- [Catálogo de recorridos](https://www.arcgis.com/home/item.html?id=c5e6ecf63aa944c8a09eb1e65e72d8f4).
- Fondo cartográfico: Instituto Geográfico Nacional (IGN), con atribución visible en el mapa.
- Copia integrada de referencia: 29/10/2026.

Aplicación independiente y no oficial, sin afiliación ni patrocinio de operadores de transporte.

## Estadísticas y componentes

La página conserva el fragmento de Cloudflare Web Analytics configurado por el propietario. Al cambiar el dominio hay que revisar la configuración de ese sitio en Cloudflare. No hay un registro específico de descargas.

Leaflet 1.9.4 y el complemento de rotación 0.3.0 se incluyen localmente: no hace falta descargarlos de un CDN al abrir la web. Consulta `THIRD_PARTY_NOTICES.txt` para sus licencias. La publicación de este repositorio no concede por sí sola una licencia sobre el resto del proyecto ni sobre los datos o la cartografía de terceros.

## Mapas y almacenamiento

La licencia del IGN es compatible con CC BY 4.0 y la atribución sigue visible también sin conexión. La caché usa solo teselas vistas, en zooms 11–18 y dentro del área de Sevilla; no presupone autorización para descargas ilimitadas del servicio. Para paquetes completos offline se puede preparar una publicación propia con cartografía licenciada y servirla desde almacenamiento propio, después de comprobar el tamaño y las condiciones de los datos.

Referencias: [licencia del IGN](https://www.ign.es/resources/licencia/Condiciones_licenciaUso_IGN.pdf), [política de almacenamiento de WebKit](https://webkit.org/blog/14403/updates-to-storage-policy/).

## Instalación en el teléfono

En Opciones → Instalar aplicación se muestran las instrucciones correspondientes al dispositivo. Chrome y Edge muestran el botón de instalación cuando el navegador ofrece esa función. En iPhone/iPad, abre la web en Safari, usa Compartir → Añadir a pantalla de inicio y activa Abrir como app web si aparece. Abre el icono instalado y guarda las líneas y sus mapas desde ahí. No se garantiza navegación GPS con la pantalla bloqueada.

Se incluyen un icono Apple opaco de 180 × 180 y un icono maskable de 512 × 512 con margen seguro para Android. Ambos se precargan en el Service Worker. Una actualización del código cambia la versión de la caché de la aplicación y conserva las cachés de mapas y los datos de IndexedDB.

## Mantener la pantalla encendida

Durante la navegación se solicita Screen Wake Lock. Se recupera al volver a la aplicación y después de una liberación del sistema; los rechazos se reintentan con una espera de 30 segundos o mediante una interacción del usuario. No se solicita en segundo plano ni después de detener el GPS. En Opciones → Ajustes se indica si está activo, pendiente o no disponible, con Reintentar cuando el sistema lo rechaza. Las pruebas cubren las solicitudes simultáneas, la suspensión, la recuperación, los rechazos y las respuestas tardías. La comprobación física en iPhone sigue siendo necesaria.

### Proveedor opcional Mapbox

Ajustes permite elegir IGN o Mapbox. Mapbox GL JS 3.33.0 se carga desde su CDN oficial solo al seleccionar Mapbox; utiliza un token público de lectura, sujeto a los límites y tarifas de la cuenta. La instancia se reutiliza al alternar proveedores o estilos para evitar reinicializaciones innecesarias. El canvas vectorial se sincroniza con la cámara Leaflet (zoom menos uno por la diferencia entre teselas de 256 y 512 px, rumbo con signo inverso); Leaflet conserva recorridos, paradas, controles y GPS.

Mapbox utiliza sus estilos oficiales: Streets durante el día y Dark v11 en el callejero nocturno. No se personalizan sus colores. Vista aérea y topográfico conservan sus estilos originales. El SDK y los recursos de Mapbox no se precargan ni se añaden a las cachés offline de la app. La preparación automática guarda el callejero IGN de toda la red, que se muestra al perder la conexión. Se conserva la preferencia Mapbox para recuperar el proveedor al volver a tener red. Un fallo de carga o de WebGL deja IGN visible.

El token público se configura en la variable de repositorio de GitHub Actions `MAPBOX_PUBLIC_TOKEN`. El flujo `publish-pages.yml` genera el HTML y el ZIP en el despliegue; el token no forma parte de los archivos versionados. Un build local sin esa variable mantiene IGN disponible y muestra Mapbox como pendiente de configuración. GitHub Pages utiliza GitHub Actions como origen de publicación.

### Flechas del recorrido

Ajustes permite activar o desactivar las flechas, con preferencia guardada en el dispositivo. Indican el orden real de las coordenadas del sentido seleccionado. Se muestran como geometrías SVG no interactivas sobre ambos proveedores, incluso sin conexión, sin unir segmentos separados. Mantienen separación visual al cambiar el zoom y giran con el recorrido. Se evita superponerlas a las paradas y recrearlas con cada pequeño movimiento GPS.
