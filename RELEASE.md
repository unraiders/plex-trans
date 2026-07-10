# Cambios en esta versión

## ✨ Novedades

- **Panel de progreso detallado** durante la importación: en lugar de solo "Importando...", ahora se ve la fase en curso, la biblioteca y tipo que se está analizando, el número de elementos procesados, los candidatos/confirmados y el título concreto que se está mirando. La Fase 2 incluye además una barra de progreso.

## 🔧 Mejoras

- **Detección de idioma en dos fases**, mucho más rápida y con la misma fiabilidad:
  - **Fase 1 (local, fastText):** analiza a toda velocidad todos los elementos de las bibliotecas y deja solo los candidatos que no parecen español.
  - **Fase 2 (Google Translate):** verifica únicamente esos candidatos (unas pocas decenas), descartando los que en realidad son español (sinopsis con nombres propios extranjeros) y ajustando el idioma de los demás.
  - Así se pasa de llamar a Google en todos los elementos (miles) a hacerlo solo en los candidatos, reduciendo drásticamente el tiempo de importación sin perder precisión.
- El botón de copiar la sinopsis a la traducción pasa a ser un icono compacto (flecha →) situado entre ambos campos de texto y con su misma altura, sin desalinear la tabla.

## ℹ️ Nota

- Tras actualizar, hay que **re-importar** una vez (Ajustes → Importar medios de Plex) para que la caché offline se rellene con las detecciones correctas.
- La Fase 2 requiere acceso a internet (Google Translate); si falla, se conserva el resultado local de la Fase 1.
