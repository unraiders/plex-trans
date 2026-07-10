# Cambios en esta versión

## 🐞 Correcciones

- Los medios que ya has **procesado** (escritos en Plex) ya no vuelven a aparecer en futuras importaciones aunque la detección de idioma vuelva a fallar en ellos. Antes, un medio en español mal detectado que dabas por bueno copiando su sinopsis y procesabas reaparecía en cada importación.
- Al volver a la página de **Medios** (por ejemplo tras importar desde Ajustes), la lista se **actualiza automáticamente** con el estado más reciente, sin tener que pulsar **Buscar**. Así se reflejan al instante las nuevas importaciones y los medios procesados que ahora se excluyen.

## 🔧 Mejoras

- Nuevo registro persistente de medios procesados: cuando pulsas **Procesar**, el medio se guarda de forma duradera para excluirlo de las importaciones siguientes (independiente de la caché offline, que se reconstruye por completo en cada importación).

## ℹ️ Nota

- Los medios procesados antes de esta versión no estaban registrados; se irán registrando a medida que vuelvas a procesar. Si alguno ya procesado reaparece una vez, vuelve a procesarlo y quedará excluido definitivamente.
