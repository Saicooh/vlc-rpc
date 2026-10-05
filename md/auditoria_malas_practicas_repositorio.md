# Auditoría Calibrada de Calidad y Buenas Prácticas (vlc-rpc)

Esta revisión reevalúa el repositorio con criterio técnico riguroso: distingue entre **decisiones de diseño intencionales** (y sus compromisos reales) y **verdaderas malas prácticas o riesgos de bugs/fugas**.

---

## 1. Riesgos Críticos (Integridad de Datos y Fugas de Recursos)

### 🔴 1.1 Fuga de memoria continua en `ImageProxy` (Caché no acotada)
- **Ubicación:** [`src/main/features/media/media.image-proxy.ts` (L10, L59-62)](file:///c:/Users/Nijika/vlc-rpc/src/main/features/media/media.image-proxy.ts#L10)
- **Diagnóstico:** `ImageProxy` almacena en un `Map` en memoria las imágenes convertidas a cadenas Base64 (`data:image/...`).
  ```ts
  private cache: Map<string, { dataUrl: string; timestamp: number }> = new Map()
  ```
  Aunque se consulta `cacheTtl` al leer, **nunca se eliminan las entradas expiradas ni existe un límite máximo de elementos**.
- **Impacto:** En una aplicación diseñada para ejecutarse en segundo plano en la bandeja del sistema durante días o semanas, cada carátula o fotograma nuevo genera strings de 200 KB a 2 MB que quedan retenidos en RAM indefinidamente.
- **Solución recomendada:** Adoptar el mismo patrón de límite acotado (LRU) que ya usa [`Catalog.Cache`](file:///c:/Users/Nijika/vlc-rpc/src/main/features/catalog/catalog.cache.ts) o [`EpisodeTitleResolver`](file:///c:/Users/Nijika/vlc-rpc/src/main/features/catalog/catalog.episode.ts#L209), limitando el caché a un máximo de 30–50 imágenes y purgando las más antiguas.

---

### 🔴 1.2 Sobrescritura destructiva de `vlcrc` por captura indiscriminada de errores
- **Ubicación:** [`src/main/features/vlc/vlc-config.handler.ts` (L144-146, L266-285)](file:///c:/Users/Nijika/vlc-rpc/src/main/features/vlc/vlc-config.handler.ts#L266-L285)
- **Diagnóstico:** El bloque `try/catch` alrededor de `fs.readFile(this.vlcConfigPath)` pretendía manejar el caso en que el archivo no existiera aún. Sin embargo, captura cualquier excepción (`EACCES` por permisos, `EBUSY` por archivo bloqueado por VLC, error de I/O temporal) e inmediatamente reemplaza todo el contenido por una plantilla mínima de 5 líneas:
  ```ts
  } catch (error) {
    configContent = [
      "# VLC Configuration File",
      "# Configured by VLC Discord RP",
      "",
      "[core]",
      `http-port=${config.httpPort}`,
    ]
  ```
- **Impacto:** Si VLC u otro proceso bloquea momentáneamente el archivo en Windows, **se borran de forma irreversible todos los ajustes del usuario en VLC** (dispositivos de audio, teclas rápidas, filtros, renderizadores).
- **Solución recomendada:**
  1. Comprobar específicamente si el error es `ENOENT` (`(error as NodeJS.ErrnoException).code === "ENOENT"`). Ante cualquier otro error, abortar con fallo sin tocar el disco.
  2. Crear una copia de seguridad (`vlcrc.bak`) antes de realizar modificaciones.
  3. Realizar una escritura atómica: escribir en un archivo temporal (`vlcrc.tmp`) y luego renombrarlo (`fs.rename`).

---

### 🔴 1.3 Fuga potencial de sockets en `Discord.Client.connect()`
- **Ubicación:** [`src/main/features/discord/discord.client.ts` (L104-106, L171-185)](file:///c:/Users/Nijika/vlc-rpc/src/main/features/discord/discord.client.ts#L104-L106)
- **Diagnóstico:** En `forceReconnect()` se destruye explícitamente el cliente anterior (`await this.rpc?.destroy()`). No obstante, en `connect()`:
  ```ts
  this.rpc = new RpcClient({ clientId: this.clientId })
  ```
  Si `connect()` se invoca tras perder la conexión (por ejemplo desde `update()` cuando `this.connected` es false), se crea una nueva instancia de `RpcClient` sobrescribiendo la referencia sin haber llamado a `destroy()` sobre la anterior.
- **Impacto:** Posible fuga de descriptores de sockets IPC y listeners huérfanos que sigan escuchando eventos de Discord en el sistema.
- **Solución recomendada:** Asegurar que `connect()` invoque `await this.rpc?.destroy()` antes de instanciar un nuevo `RpcClient`.

---

## 2. Seguridad e Interacción con el Sistema (Electron)

### 🟡 2.1 Apertura de URLs arbitrarias en `shell.openExternal`
- **Ubicación:** [`src/main/features/app/app.window.ts` (L126-129)](file:///c:/Users/Nijika/vlc-rpc/src/main/features/app/app.window.ts#L126-L129)
- **Diagnóstico:** El manejador de apertura de ventanas externas ejecuta:
  ```ts
  this.mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: "deny" }
  })
  ```
- **Riesgo:** La documentación oficial de seguridad de Electron advierte no pasar URLs sin sanear a `shell.openExternal`. Si un enlace local o metadato contiene esquemas como `file://`, `powershell://` o rutas UNC de Windows, podría ejecutarse código o abrirse archivos locales no deseados.
- **Solución recomendada:** Validar que el protocolo sea estrictamente `http:` o `https:` antes de abrirlo.

---

### 🟡 2.2 Política de Seguridad de Contenido (CSP) con `unsafe-eval` en Producción
- **Ubicación:** [`src/main/features/app/app.window.ts` (L67)](file:///c:/Users/Nijika/vlc-rpc/src/main/features/app/app.window.ts#L67)
- **Diagnóstico:** Se permite `'unsafe-eval'` de forma estática:
  ```ts
  `default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; ...`
  ```
- **Matiz importante:** En desarrollo (`is.dev`), Vite suele requerir `eval` para source-maps y Hot Module Replacement. Sin embargo, en producción el bundle final no lo necesita.
- **Solución recomendada:** Hacer la directiva condicional:
  ```ts
  const scriptSrc = is.dev ? "'self' 'unsafe-inline' 'unsafe-eval'" : "'self' 'unsafe-inline'"
  ```

---

### 🟡 2.3 Interpolación de rutas con comillas en scripts de PowerShell
- **Ubicación:** [`scripts/fetch-fpcalc.mjs` (L85)](file:///c:/Users/Nijika/vlc-rpc/scripts/fetch-fpcalc.mjs#L85)
- **Diagnóstico:** Se descomprime el archivo invocando PowerShell con interpolación directa de cadenas:
  ```js
  `Expand-Archive -Path '${archive}' -DestinationPath '${work}' -Force`
  ```
- **Riesgo:** Si el usuario tiene un apóstrofe o comilla simple en su nombre de usuario de Windows (por ejemplo `C:\Users\John's PC\...`), el comando de PowerShell fallará con un error de sintaxis al ejecutar `bun install`.
- **Solución recomendada:** Usar sintaxis segura pasando argumentos sin interpolación de comillas en el comando o escapar las comillas simples.

---

## 3. Red y Resiliencia: `Cover.Uploader` y Servicios Externos

### 🔵 3.1 Análisis de `Cover.Uploader`: Patrón *Hedged Requests* y sus Puntos Ciegos
- **Ubicación:** [`src/main/features/cover/cover.uploader.ts` (L106-135)](file:///c:/Users/Nijika/vlc-rpc/src/main/features/cover/cover.uploader.ts#L106-L135)
- **Evaluación del diseño:** Lanzar subidas concurrentes a varios hosts y abortar a los perdedores con `AbortController` **no es un descuido, sino un patrón deliberado (Hedged Requests / Speculative Racing)** para garantizar que la presencia en Discord no se demore si un servidor anónimo está lento o caído.
- **Los problemas técnicos reales que SÍ tiene la implementación actual:**
  1. **Falta de Circuit Breaker / Cooldown:** Si un servicio como `catbox` o `0x0.st` devuelve error `429 (Rate Limit)` o `500 (Caído)`, la aplicación lo vuelve a incluir en la carrera en la canción siguiente. Debería haber un estado de enfriamiento temporal (ej. ignorar ese host durante 10 minutos tras fallar).
  2. **Privacidad de contenido local:** La subida de imágenes de archivos locales a hosts públicos de terceros se realiza sin una advertencia explícita en la UI para el usuario final.
  3. **Multiplicación de ancho de banda:** Aunque se cancele al ganador, los primeros paquetes de datos de la imagen ya se enviaron por red a 5 servidores.

---

### 🟡 3.2 Invocación de subshell con `exec` en `SyncplayDetector`
- **Ubicación:** [`src/main/features/presence/presence.syncplay.ts` (L30-36)](file:///c:/Users/Nijika/vlc-rpc/src/main/features/presence/presence.syncplay.ts#L30-L36)
- **Diagnóstico:** Se ejecuta `exec(command, ...)` cada 15 segundos para consultar `tasklist`.
- **Impacto:** A diferencia de `execFile` (que invoca el binario directamente sin intermediarios), `exec` crea una instancia de `cmd.exe` en cada ciclo.
- **Solución recomendada:** Sustituir por `execFile("tasklist", ["/FI", "IMAGENAME eq Syncplay.exe", "/NH"])` igual que ya hace [`vlc-process.ts`](file:///c:/Users/Nijika/vlc-rpc/src/main/features/vlc/vlc-process.ts#L7).

---

### 🟡 3.3 Desincronización del temporizador en `DiscordRpcHandler`
- **Ubicación:** [`src/main/features/discord/discord.handler.ts` (L121-124)](file:///c:/Users/Nijika/vlc-rpc/src/main/features/discord/discord.handler.ts#L121-L124)
- **Diagnóstico:** El bucle de sondeo se crea con `setInterval(..., this.pollIntervalMs())`.
- **Impacto:** Si el usuario modifica el intervalo de sondeo en la configuración de la app, el temporizador en ejecución mantiene el intervalo anterior y no se adapta hasta reiniciar la aplicación.
- **Solución recomendada:** Utilizar un encadenamiento recursivo con `setTimeout` o reiniciar el intervalo cuando se reciba una notificación de cambio de configuración.

---

## 4. Frontend y Manejo de Errores (React)

### 🔴 4.1 Falta de `ErrorBoundary` en la raíz de la interfaz
- **Ubicación:** [`src/renderer/src/App.tsx`](file:///c:/Users/Nijika/vlc-rpc/src/renderer/src/App.tsx)
- **Diagnóstico:** Las rutas de la aplicación (`HomePage`, `LayoutPage`, `SettingsPage`) no están envueltas en un límite de captura de errores de React.
- **Impacto:** Cualquier excepción no controlada en tiempo de renderizado (por ejemplo, datos inesperados en una respuesta IPC o fallos al pintar el canvas del layout) provoca que toda la ventana de Electron se quede en **pantalla blanca permanente**, obligando a matar el proceso.
- **Solución recomendada:** Añadir un componente `ErrorBoundary` alrededor de `<Switch>` que muestre un aviso amigable y un botón para recargar la vista.

---

### 🟡 4.2 Estado mutable a nivel de módulo en `media.actions.ts`
- **Ubicación:** [`src/renderer/src/features/media/media.actions.ts` (L11)](file:///c:/Users/Nijika/vlc-rpc/src/renderer/src/features/media/media.actions.ts#L11)
- **Diagnóstico:** Se utiliza una variable mutable global:
  ```ts
  let corrections = 0
  ```
- **Impacto:** Queda fuera del árbol reactivo de Nanostores/React y persiste entre pruebas unitarias a menos que se resetee manualmente.
- **Solución recomendada:** Moverla al estado del store (`media.store.ts`) o encapsularla en un `atom(0)`.

---

## 5. Prácticas Ejemplares en el Repositorio (Lo que está muy bien hecho)

Para ser justos con la calidad global del proyecto, existen patrones sobresalientes que merecen reconocimiento:
1. **Contrato estricto y tipado de IPC:** En [`typed-bridge.ts`](file:///c:/Users/Nijika/vlc-rpc/src/preload/typed-bridge.ts) y [`channels.ts`](file:///c:/Users/Nijika/vlc-rpc/src/shared/ipc/channels.ts), la comunicación entre Main y Renderer está 100% tipada sin `any`.
2. **Throttling y respeto de cuotas en APIs:** En [`MusicBrainzProvider`](file:///c:/Users/Nijika/vlc-rpc/src/main/features/music/music.musicbrainz.ts#L50-L56) se implementa una cola serializada estricta para no exceder 1 petición por segundo, protegiendo al usuario de baneos.
3. **Caché LRU inteligente en Catálogos:** [`Catalog.Cache`](file:///c:/Users/Nijika/vlc-rpc/src/main/features/catalog/catalog.cache.ts) y [`EpisodeTitleResolver`](file:///c:/Users/Nijika/vlc-rpc/src/main/features/catalog/catalog.episode.ts#L209) tienen deduplicación de peticiones en vuelo (*in-flight de-duplication*) y límites máximos con desalojo LRU impecables.
4. **Limpieza de listeners en React:** Los hooks personalizados (como [`use-update-offer.ts`](file:///c:/Users/Nijika/vlc-rpc/src/renderer/src/features/updates/hooks/use-update-offer.ts#L43)) retornan correctamente la función de desuscripción de IPC.

---

## 6. Matriz de Prioridad Actualizada

| Prioridad | Componente | Hallazgo | Acción sugerida |
| :--- | :--- | :--- | :--- |
| **P1 - Crítica** | `vlc-config.handler.ts` | El `catch` general borra el archivo `vlcrc` | Capturar solo `ENOENT`, añadir `.bak` y reemplazo atómico |
| **P1 - Crítica** | `media.image-proxy.ts` | Fuga de memoria: Map Base64 sin tope | Añadir límite LRU (tope de 50 imágenes) |
| **P1 - Crítica** | `discord.client.ts` | Re-instanciación de `RpcClient` sin `destroy()` | Destruir la instancia previa antes de crear una nueva |
| **P2 - Alta** | `App.tsx` | Sin `ErrorBoundary` en React | Envolver las rutas en un componente de captura de errores |
| **P2 - Alta** | `app.window.ts` | `shell.openExternal` sin validar protocolo | Validar `http:` y `https:` antes de abrir |
| **P3 - Media** | `cover.uploader.ts` | Sin Circuit Breaker en hosts caídos | Suspender temporalmente los hosts que respondan 429/500 |
| **P3 - Media** | `presence.syncplay.ts` | `exec` crea subshells innecesarias | Cambiar a `execFile` directo |
| **P3 - Media** | `discord.handler.ts` | `pollInterval` no se actualiza en caliente | Reiniciar timer cuando cambie la configuración |
| **P4 - Baja** | `app.window.ts` | CSP con `'unsafe-eval'` en producción | Restringir `unsafe-eval` solo a modo desarrollo |
| **P4 - Baja** | `fetch-fpcalc.mjs` | Comillas en PowerShell con rutas de Windows | Escapar rutas en la invocación de PowerShell |
