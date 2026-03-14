'use client'

import Nav from '../_nav'
import { useAuth } from '../../lib/useAuth'
import { Alert, AlertTitle, AlertDescription } from '../../components/ui/alert'

export default function HelpPage() {
  const ready = useAuth()
  if (!ready) return null

  return (
    <div className="flex flex-col gap-0">
      <Nav />
      <div className="mx-auto w-full max-w-3xl px-4 py-10 flex flex-col gap-10">

        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">Guía de uso</h1>
          <p className="text-zinc-500 dark:text-zinc-400">
            <b>Plex Language Media Tool</b> traduce automáticamente las sinopsis de tu servidor Plex al español usando IA.
          </p>
        </div>

        {/* Aviso copia de seguridad */}
        <Alert className="border-yellow-400 bg-yellow-50 text-yellow-800 dark:border-yellow-500 dark:bg-yellow-900/20 dark:text-yellow-300">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
            <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
          <AlertTitle>Haz una copia de seguridad antes de continuar</AlertTitle>
          <AlertDescription>
            Se recomienda encarecidamente hacer una copia de seguridad de tu instancia de Plex antes de manipular cualquier dato. El botón <strong>Procesar</strong> escribe directamente en tu servidor Plex y esta acción no se puede deshacer desde la aplicación.
          </AlertDescription>
        </Alert>

        {/* PASO 1: Ajustes */}
        <section className="flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-yellow-500 text-sm font-bold text-zinc-950">1</span>
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">Configurar Ajustes</h2>
          </div>

          <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 divide-y divide-zinc-200 dark:divide-zinc-800">

            <div className="p-4 flex flex-col gap-1">
              <h3 className="font-medium text-zinc-800 dark:text-zinc-200">Conexión a Plex</h3>
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                Introduce la IP o hostname de tu servidor Plex, el puerto (por defecto <code className="rounded bg-zinc-100 dark:bg-zinc-800 px-1 py-0.5 text-xs">32400</code>) y el token de autenticación de Plex. El token lo puedes obtener desde cualquier petición de red en la interfaz web de Plex (cabecera <code className="rounded bg-zinc-100 dark:bg-zinc-800 px-1 py-0.5 text-xs">X-Plex-Token</code>).
              </p>
            </div>

            <div className="p-4 flex flex-col gap-1">
              <h3 className="font-medium text-zinc-800 dark:text-zinc-200">Selección de bibliotecas</h3>
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                Una vez guardada la conexión, selecciona las bibliotecas de Plex que quieres incluir en las búsquedas (películas, series, etc.). Solo se mostrarán los medios pertenecientes a las bibliotecas seleccionadas.
              </p>
            </div>

            <div className="p-4 flex flex-col gap-2">
              <h3 className="font-medium text-zinc-800 dark:text-zinc-200">Perfiles de IA</h3>
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                Puedes crear uno o varios perfiles de traducción, cada uno con su proveedor y modelo. El perfil activo es el que se usará al traducir. Los proveedores disponibles son:
              </p>
              <ul className="flex flex-col gap-3 pt-1">
                <li className="flex flex-col gap-0.5">
                  <span className="text-sm font-semibold text-yellow-600 dark:text-yellow-400">OpenAI</span>
                  <span className="text-sm text-zinc-500 dark:text-zinc-400">
                    Usa la API de OpenAI (o cualquier API compatible, como LM Studio o OpenRouter). Requiere una URL base y una API Key. Permite especificar el modelo, por ejemplo <code className="rounded bg-zinc-100 dark:bg-zinc-800 px-1 py-0.5 text-xs">gpt-4o</code> o <code className="rounded bg-zinc-100 dark:bg-zinc-800 px-1 py-0.5 text-xs">gpt-4o-mini</code>.
                  </span>
                </li>
                <li className="flex flex-col gap-0.5">
                  <span className="text-sm font-semibold text-yellow-600 dark:text-yellow-400">Ollama</span>
                  <span className="text-sm text-zinc-500 dark:text-zinc-400">
                    Usa un modelo local servido por Ollama. Introduce la URL de tu instancia (por ejemplo <code className="rounded bg-zinc-100 dark:bg-zinc-800 px-1 py-0.5 text-xs">http://localhost:11434</code>) y el nombre del modelo que tengas descargado, por ejemplo <code className="rounded bg-zinc-100 dark:bg-zinc-800 px-1 py-0.5 text-xs">llama3.2</code> o <code className="rounded bg-zinc-100 dark:bg-zinc-800 px-1 py-0.5 text-xs">mistral</code>. No requiere API Key ni coste externo.
                  </span>
                </li>
                <li className="flex flex-col gap-0.5">
                  <span className="text-sm font-semibold text-yellow-600 dark:text-yellow-400">Deep Translator</span>
                  <span className="text-sm text-zinc-500 dark:text-zinc-400">
                    Usa Google Translate de forma gratuita a través de la librería <code className="rounded bg-zinc-100 dark:bg-zinc-800 px-1 py-0.5 text-xs">deep_translator</code>. No requiere API Key ni modelo. Es la opción más rápida pero con menor calidad que los modelos de lenguaje.
                  </span>
                </li>
              </ul>
            </div>
          </div>
        </section>

        {/* PASO 2: Media */}
        <section className="flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-yellow-500 text-sm font-bold text-zinc-950">2</span>
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">Buscar medios</h2>
          </div>

          <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 divide-y divide-zinc-200 dark:divide-zinc-800">

            <div className="p-4 flex flex-col gap-1">
              <h3 className="font-medium text-zinc-800 dark:text-zinc-200">Opciones de búsqueda</h3>
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                En la página de Medios puedes filtrar los resultados por biblioteca, por texto (título o sinopsis) y activar el filtro <span className="font-medium text-zinc-700 dark:text-zinc-300">Solo no español</span> para mostrar únicamente los medios cuya sinopsis no esté en español, que son los candidatos a traducir.
              </p>
              <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
                La primera búsqueda puede tardar desde varios segundos hasta minutos dependiendo del número de bibliotecas seleccionadas y la cantidad de medios que contengan, ya que la aplicación necesita analizar el idioma de cada sinopsis para determinar cuáles no están en español.
              </p>
              <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
                Debemos tener en cuenta que la identificación del idioma en los medios puede no ser 100% precisa y aparecer con otro idioma o como desconocido, especialmente con textos cortos o difíciles de clasificar, pero serán los mínimos.
              </p>
            </div>

            <div className="p-4 flex flex-col gap-1">
              <h3 className="font-medium text-zinc-800 dark:text-zinc-200">Paginación y cantidad</h3>
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                Puedes controlar cuántos resultados se muestran por página (10, 25, 50 o 100) y navegar entre páginas con la paginación inferior. El campo <span className="font-medium text-zinc-700 dark:text-zinc-300">Límite</span> permite restringir el total de medios que se recuperan de Plex en esa búsqueda, útil para pruebas o bibliotecas muy grandes.
              </p>
            </div>

            <div className="p-4 flex flex-col gap-1">
              <h3 className="font-medium text-zinc-800 dark:text-zinc-200">Selección de elementos</h3>
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                Usa los checkboxes para seleccionar los medios sobre los que quieres actuar. Puedes seleccionar todos los de la página actual con el checkbox de la cabecera. Los medios ya procesados se muestran bloqueados para evitar duplicados.
              </p>
            </div>

          </div>
        </section>

        {/* PASO 3: Traducir y Procesar */}
        <section className="flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-yellow-500 text-sm font-bold text-zinc-950">3</span>
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">Traducir y Procesar</h2>
          </div>

          <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 divide-y divide-zinc-200 dark:divide-zinc-800">

            <div className="p-4 flex flex-col gap-1">
              <h3 className="font-medium text-zinc-800 dark:text-zinc-200">Traducir</h3>
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                Con los medios seleccionados, pulsa <span className="font-medium text-zinc-700 dark:text-zinc-300">Traducir</span> para enviar las sinopsis al proveedor de IA activo. Las traducciones se muestran en la columna <span className="italic">Traducción</span> de la tabla y quedan guardadas en memoria para revisarlas antes de aplicarlas. Este paso no modifica Plex.
              </p>
            </div>

            <div className="p-4 flex flex-col gap-1">
              <h3 className="font-medium text-zinc-800 dark:text-zinc-200">Procesar</h3>
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                Una vez revisadas las traducciones, pulsa <span className="font-medium text-zinc-700 dark:text-zinc-300">Procesar</span> para escribirlas de vuelta en Plex. Este paso sí modifica la sinopsis en tu servidor Plex. Solo se procesan los elementos seleccionados que tengan traducción disponible. Al finalizar se muestra un resumen con los elementos actualizados y los errores, si los hubiera.
              </p>
            </div>

          </div>
        </section>

      </div>
    </div>
  )
}
