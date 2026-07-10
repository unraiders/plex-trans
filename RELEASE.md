# Cambios en esta versión

## 🐞 Correcciones

- Corregida la detección de idioma de las sinopsis: muchas descripciones en español (sobre todo cortas) se clasificaban erróneamente como italiano, catalán, indonesio o "desconocido" y quedaban marcadas como no-español.
- Corregida la versión mostrada en el footer: ya no queda fija en `package.json`; ahora refleja la versión real inyectada en la imagen Docker (con `package.json` como valor de desarrollo local).

## 🔧 Mejoras

- Reemplazado `langdetect` por **[lingua](https://github.com/pemistahl/lingua-py)**, mucho más fiable: acierta el español incluso en sinopsis largas plagadas de nombres propios extranjeros (actores, personajes, lugares) que antes hacían fallar la detección, y distingue español de catalán de una sola pasada.
- Eliminada toda la heurística de "rescate" basada en listas de palabras; la detección es ahora directa y aplica un único umbral de confianza (por debajo se marca "desconocido", que sigue ofreciéndose para traducir).
