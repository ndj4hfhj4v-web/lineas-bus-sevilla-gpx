# Verificación offline — 1 de noviembre de 2026

## Comprobado

- Generación y análisis de los seis scripts integrados; se conservan los 136 trazados originales.
- Arranque inmediato desde datos locales, sin petición de red; actualización online que no reinicia una navegación activa.
- Guardado real de la línea 5 en IndexedDB, con dos sentidos y 23 paradas en el sentido probado.
- Cierre y reapertura con el servidor local apagado: interfaz desde Service Worker, recuperación de la línea y exportación GPX.
- Navegación simulada tras reabrir con el servidor de pruebas apagado: centrado, giro de rumbo 90° con mapa a 270°, pausa y reactivación del seguimiento.
- Pérdida simulada de señal de 45 segundos y recuperación de posición y rumbo.
- Caché real de teselas IGN consultadas y recuento de zonas almacenadas.
- Pruebas automatizadas con peticiones de red rechazadas: reutilización de mapas guardados, aviso para mapas ausentes, límite de 384 imágenes, exclusión de otros proveedores y respuestas opacas, y conservación de mapas al actualizar la app.
- Precisión pobre, posiciones antiguas, movimiento insuficiente, rumbo 359°/0°, permiso denegado y cambio de recorrido.
- Paradas pequeñas en vista general y grandes solo con GPS y zoom cercano.

## Límites de estas pruebas

Apagar el servidor demuestra el arranque sin servidor de origen; no equivale por sí solo a desactivar todas las conexiones del dispositivo. El rechazo total de la red se comprueba adicionalmente en las pruebas automatizadas. Las posiciones GPS son simuladas.

No se dispone de un iPhone físico. Quedan pendientes el modo avión real, recepción GPS en la calle, permiso de brújula y Wake Lock de la versión concreta de iOS. No se promete seguimiento en segundo plano o con el teléfono bloqueado.

## Prueba en el iPhone

1. Abrir la web HTTPS en Safari y añadirla a la pantalla de inicio.
2. Abrir el icono instalado con Internet, elegir la línea y guardar sus datos.
3. Visitar las zonas del mapa con el zoom de navegación. Esperar a que se indique disponibilidad offline.
4. Cerrar la app, activar modo avión y volver a entrar desde el mismo icono.
5. Abrir «Ver guardadas»; comprobar sentidos, paradas y descarga GPX.
6. Iniciar GPS con la localización activada; comprobar centrado y giro al desplazarse.
7. Pausar y reactivar el seguimiento y comprobar la recuperación tras perder señal.

Guardar una línea no descarga su mapa completo. Las zonas no visitadas o eliminadas muestran «Mapa no guardado»; el trazado y las paradas siguen disponibles. Safari puede eliminar datos por falta de espacio, incluso aunque la app solicite persistencia.
