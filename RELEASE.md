# Cambios en esta versión

## ✨ Novedades

- Nuevo botón **"Copiar sinopsis"** en cada fila de Medios: vuelca el texto de la sinopsis original en el campo de traducción con un clic (y selecciona la fila para poder procesarla directamente). Útil cuando quieres usar el texto tal cual en lugar de traducirlo con IA.

## 🐞 Correcciones

- Corregida de raíz la detección de idioma: sinopsis claramente en español pero cargadas de nombres propios extranjeros (actores, personajes, lugares) se clasificaban como portugués, alemán, italiano o inglés y quedaban marcadas como no-español.

## 🔧 Mejoras

- Motor de detección cambiado a **fastText (`fast-langdetect`) con el modelo grande `lid.176`**, mucho más fiable con datos reales que los detectores anteriores (langdetect y lingua fallaban con esas sinopsis). El modelo (~126 MB) se **pre-descarga durante el build** de la imagen, así que en tiempo de ejecución no hay ninguna descarga y funciona sin internet.
- La imagen resultante es además más ligera que con lingua (~126 MB frente a ~293 MB).

## ℹ️ Nota

- Tras actualizar, hay que **re-importar** una vez (Ajustes → Importar medios de Plex) para que la caché offline se rellene con las detecciones correctas.
