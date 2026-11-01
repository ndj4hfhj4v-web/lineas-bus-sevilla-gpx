# Líneas de Bus de Sevilla GPX

Web independiente para consultar recorridos de autobús de Sevilla, ver sus paradas, seguir la posición del móvil sobre el mapa y descargar el sentido elegido como GPX.

## Web de prueba

El proyecto es público por decisión del propietario y la web se publica desde `docs/` mediante GitHub Pages:

https://ndj4hfhj4v-web.github.io/lineas-bus-sevilla-gpx/

La web de Netlify es una publicación independiente.

## Uso sin conexión en iPhone

1. Abre la web HTTPS en Safari y elige Compartir → Añadir a pantalla de inicio.
2. Abre el icono instalado mientras tienes Internet. Safari y la app instalada pueden usar almacenes separados: prepara las copias desde el icono que usarás después.
3. Selecciona la línea y pulsa **Guardar línea sin conexión**. Se guardan todos sus sentidos, paradas, trazado completo y GPX en IndexedDB. Espera a que el estado indique que la aplicación está disponible sin Internet.
4. Visita las zonas del mapa al nivel de zoom que necesitarás. Guardar la línea no descarga automáticamente su mapa entero. Solo se conservan las teselas consultadas del área de Sevilla.
5. Activa el modo avión, vuelve a abrir desde el mismo icono, pulsa **Ver guardadas** y comprueba el sentido y las paradas antes de salir. Activa la localización del dispositivo para iniciar GPS.

El Service Worker guarda la interfaz y las librerías incluidas. La caché de mapas, separada de las líneas, conserva como máximo 384 teselas de hasta 512 KiB cada una (límite teórico de imágenes: 192 MiB, sin contar la sobrecarga del navegador). Reutiliza imágenes CORS legibles del IGN; no guarda respuestas opacas, imágenes con instrucciones no-store/private ni mapas de otros proveedores. No hace descargas masivas ni precarga toda Sevilla. Al llenarse reemplaza las copias más antiguas; iOS también puede eliminar datos por falta de espacio. Se solicita almacenamiento persistente, sin prometer que el sistema lo conceda. Las zonas ausentes muestran **Mapa no guardado**, con el trazado y las paradas encima.

El botón **Borrar mapas guardados** conserva tus líneas. **Eliminar copia de esta línea** elimina solo la línea elegida. Las consultas en directo se guardan como última copia local. Actualizar datos durante una navegación no sustituye el recorrido que estás siguiendo.

## Funciones

- Búsqueda de líneas y selección del sentido de marcha.
- Interfaz compacta, sin bloques de instrucciones ni descarga conjunta de toda la red.
- Mapa a pantalla completa al abrir el recorrido con GPS, con giro según la dirección del desplazamiento.
- Solo un botón de regreso al tocar el mapa, que se oculta tras cinco segundos, y un icono de ubicación para recuperar el seguimiento.
- Exportación de un GPX del recorrido seleccionado, con trazado y paradas.
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
