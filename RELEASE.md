# Cambios en esta versión

## 🐞 Correcciones

- Corregida la detección de idioma de las sinopsis: muchas descripciones en español (sobre todo cortas) se clasificaban erróneamente como italiano, catalán, indonesio o "desconocido" y quedaban marcadas como no-español.
- Corregida la versión mostrada en el footer: ya no queda fija en `package.json`; ahora refleja la versión real inyectada en la imagen Docker (con `package.json` como valor de desarrollo local).

## 🔧 Mejoras

- Reemplazado `langdetect` por **`fast-langdetect`** (modelo fastText `lid.176`), mucho más preciso con textos cortos y capaz de distinguir español de catalán de una sola pasada.
- Eliminada toda la heurística de "rescate" basada en listas de palabras; la detección es ahora directa y aplica un único umbral de confianza (por debajo se marca "desconocido", que sigue ofreciéndose para traducir).
- El modelo comprimido (~1 MB) va incluido en el paquete: **sin descargas en tiempo de ejecución** y con impacto mínimo en el tamaño de la imagen Docker.
