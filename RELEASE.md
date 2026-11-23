# Cambios en esta versión

## 🐞 Correcciones

- **Compatibilidad con modelos nuevos de OpenAI** (p. ej. `gpt-6-luna`): estos modelos rechazan el parámetro `max_tokens` y daban un error 400 al traducir. Ahora la petición se adapta sola: si el modelo pide `max_completion_tokens`, se reintenta con ese parámetro (y con un margen mayor para los modelos de razonamiento), y si no admite `temperature`, se reintenta sin ella. Las APIs compatibles con OpenAI (LM Studio, etc.) siguen funcionando igual.

## 🔧 Mejoras

- **Errores descriptivos en lugar de "Failed to fetch"**: cuando el backend fallaba, el navegador bloqueaba la respuesta por CORS y solo mostraba "Failed to fetch". Ahora:
  - Los errores del proveedor de IA indican proveedor, modelo, código HTTP y el mensaje original (p. ej. `Error del proveedor de IA [openai · gpt-6-luna] (HTTP 400): …`).
  - Cualquier otro error interno se devuelve con su descripción y la traza completa queda en los logs del contenedor.
  - Si el backend no responde, se indica a qué URL se intentaba conectar y qué revisar.
