# Cambios en esta versión

## 🐞 Correcciones

- Corregida de raíz la detección de idioma: sinopsis claramente en español pero con nombres propios extranjeros (actores, personajes, lugares) se marcaban como portugués, alemán, italiano, francés o inglés. Ocurría incluso con sinopsis largas y enteramente en español en cuanto aparecían varios nombres extranjeros.

## 🔧 Mejoras

- La detección de idioma pasa a usar **Google Translate** como motor principal, que es mucho más fiable con este tipo de textos porque entiende el contexto y no se deja engañar por los nombres propios. Se mantiene **fastText** como respaldo local automático por si Google no está disponible o limita peticiones, de modo que la importación nunca se queda sin detectar.

## ℹ️ Nota

- Tras actualizar, hay que **re-importar** una vez (Ajustes → Importar medios de Plex) para que la caché offline se rellene con las detecciones correctas.
- La detección principal requiere acceso a internet (endpoint público de Google Translate); si falla, se usa el respaldo local automáticamente.
