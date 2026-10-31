# Líneas de Bus de Sevilla GPX

Web independiente para consultar recorridos de autobús de Sevilla, ver sus paradas, seguir la posición del móvil sobre el mapa y descargar el sentido elegido como GPX.

## Web de prueba

El proyecto es público por decisión del propietario y la web se publica desde `docs/` mediante GitHub Pages:

https://ndj4hfhj4v-web.github.io/lineas-bus-sevilla-gpx/

La web de Netlify es una publicación independiente.

## Funciones

- Búsqueda de líneas y selección del sentido de marcha.
- Mapa ampliable con seguimiento de posición y giro según la dirección del desplazamiento.
- Controles que aparecen al tocar el mapa y se ocultan tras cinco segundos sin interactuar durante el seguimiento.
- Exportación de un GPX del recorrido seleccionado, con trazado y paradas.
- Actualización de trazados y paradas desde IDE Sevilla; copia integrada si la consulta falla.
- Instalación desde navegadores compatibles mediante un manifiesto web.

El GPS necesita HTTPS, permiso de ubicación y la pantalla abierta. No ofrece voz, instrucciones giro a giro ni recálculo de rutas. El giro utiliza el rumbo GPS o el desplazamiento entre posiciones; parado o con mala precisión mantiene la orientación anterior. Las pruebas de seguimiento y giro se han realizado con posiciones simuladas; queda pendiente la prueba en la calle. No se conserva un historial de posiciones.

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
