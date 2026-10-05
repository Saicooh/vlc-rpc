# Guía de Optimizaciones de Rendimiento y Recursos (vlc-rpc)

Este documento detalla las principales oportunidades para optimizar el consumo de **CPU, memoria RAM, batería y ancho de banda** en **vlc-rpc**, ordenadas por impacto real en la experiencia de usuario.

---

## 1. Eliminar el Doble Sondeo y Pausar en Segundo Plano (Impacto Alto en CPU y Batería)

### 🔍 Diagnóstico
Actualmente existen **dos bucles de sondeo independientes** corriendo en paralelo:
1. **En el proceso Main:** [`discord.handler.ts` (L121)](file:///c:/Users/Nijika/vlc-rpc/src/main/features/discord/discord.handler.ts#L121) sondea el estado de VLC cada **1500 ms** para actualizar la presencia en Discord.
2. **En el proceso Renderer:** [`vlc.actions.ts` (L86)](file:///c:/Users/Nijika/vlc-rpc/src/renderer/src/features/vlc/vlc.actions.ts#L86) tiene su propio `setInterval` que sondea VLC cada **2000 ms** (`window.api.vlc.getStatus(true)`) y acto seguido dispara `window.api.media.getMediaInfo()`.

> [!WARNING]
> **Consumo innecesario en la bandeja:** Cuando la ventana se minimiza o se oculta en la bandeja del sistema (`tray`), el sondeo del Renderer **sigue activo al mismo ritmo**, consumiendo ciclos de CPU y haciendo peticiones HTTP y de IPC constantes mientras el usuario no está viendo la aplicación.

### 🚀 Optimización recomendada
1. **Pausar el sondeo cuando la ventana esté oculta:**
   Detectar `visibilitychange` o el evento `mainWindow.on('hide')` para detener el `statusPollingInterval` en el Renderer y reanudarlo solo al mostrarse la ventana.
2. **Arquitectura Push (Event-driven):**
   Dado que el proceso `main` ya monitorea VLC continuamente, no tiene sentido que el `renderer` haga peticiones HTTP redundantes. `main` puede emitir un evento IPC `vlc:status-changed` únicamente cuando cambie la reproducción, actualizando la interfaz sin necesidad de ningún sondeo periódico en el frontend.

---

## 2. Reemplazar Base64 en IPC por Protocolo Nativo de Electron (Impacto Alto en RAM y GC)

### 🔍 Diagnóstico
En [`media.image-proxy.ts` (L57)](file:///c:/Users/Nijika/vlc-rpc/src/main/features/media/media.image-proxy.ts#L57), las carátulas locales y remotas se convierten a cadenas Base64 (`data:${contentType};base64,...`) para enviarse al Renderer por IPC.

### Inconvenientes de Base64 en Electron:
- **Sobrecarga del 33% en tamaño:** Una carátula de 2 MB se convierte en una cadena de 2.7 MB.
- **Doble asignación de memoria:** El string se crea en el heap de V8 de Node.js, se serializa a través de IPC y se vuelve a crear en el heap de Chromium, provocando pausas de *Garbage Collection* (recolección de basura).
- **Decodificación síncrona:** Chromium tiene que decodificar el string base64 en el hilo principal de renderizado.

### 🚀 Optimización recomendada
Registrar un esquema de protocolo privilegiado en Electron (por ejemplo `media-art://`):
```ts
// En main (app.ts)
protocol.handle('media-art', async (request) => {
  const url = new URL(request.url)
  const target = url.searchParams.get('url')
  return net.fetch(target) // o fs.createReadStream para archivos locales
})
```
- El Renderer simplemente usa `<img src="media-art://image?url=..." />`.
- Cero conversiones a Base64, transferencia en streaming binario nativo, hardware decoding por la GPU y aprovechamiento de la caché de disco nativa de Chromium.

---

## 3. Eliminar `createHash("md5")` en Cada Tick de Sondeo (Impacto Medio en CPU)

### 🔍 Diagnóstico
En [`vlc.client.ts` (L152)](file:///c:/Users/Nijika/vlc-rpc/src/main/features/vlc/vlc.client.ts#L152):
```ts
const contentHash = createHash("md5").update(content).digest("hex")
```
Cada 1.5 segundos se instancia un objeto criptográfico en OpenSSL (`crypto.createHash`) para calcular el hash MD5 de la respuesta JSON completa de VLC y comprobar si hubo cambios.

### 🚀 Optimización recomendada
Comparar la cadena directamente contra la anterior:
```ts
if (content === this.lastRawContent && !forceUpdate && this.lastStatus && !uriUnresolved) {
  return this.lastStatus
}
this.lastRawContent = content
```
- En el motor V8 de JavaScript, la comparación de strings (`===`) primero compara la longitud y referencias de memoria en **O(1)** y luego hace una comparación de memoria (*memcmp*) altamente vectorizada.
- Es órdenes de magnitud más rápido que invocar algoritmos criptográficos y produce **cero asignaciones de objetos** 40 veces por minuto.

---

## 4. Reutilización de Buffers en `Cover.Uploader` (Impacto Menor en RAM)

### 🔍 Diagnóstico
En [`cover.uploader.ts` (L163-165)](file:///c:/Users/Nijika/vlc-rpc/src/main/features/cover/cover.uploader.ts#L163-L165):
```ts
private toBlob(imageBuffer: Buffer, filename: string): Blob {
  return new Blob([new Uint8Array(imageBuffer)], { type: this.getMimeType(filename) })
}
```
En la carrera de subidas a 5 servicios, cada servicio invoca `toBlob()`, creando copias intermedias `new Uint8Array(...)` y nuevos objetos `Blob` por cada participante.

### 🚀 Optimización recomendada
1. En Node.js 18+, `new Blob([imageBuffer])` acepta el `Buffer` directamente sin envolverlo en `new Uint8Array`.
2. Crear el `Blob` una única vez antes de iniciar la carrera y reutilizar la misma instancia en las 5 peticiones.

---

## 5. Modernización de `phosphor-react` y Tree-Shaking (Impacto en Bundle Size)

### 🔍 Diagnóstico
En [`package.json` (L79)](file:///c:/Users/Nijika/vlc-rpc/package.json#L79) se utiliza la librería desactualizada `phosphor-react` (v1.4.1).
- La versión 1.x utiliza empaquetado CommonJS híbrido que puede dificultar el *tree-shaking* óptimo de Rollup/Vite, incluyendo código de iconos no utilizados.

### 🚀 Optimización recomendada
Migrar al paquete oficial moderno [`@phosphor-icons/react`](https://github.com/phosphor-icons/react) (v2.x):
- Soporte ESM nativo puro.
- Mejor tipado de TypeScript.
- Menor tamaño de bundle y empaquetado más rápido.

---

## 6. Minificación de Producción para el Proceso Main

### 🔍 Diagnóstico
En [`electron.vite.config.ts` (L11)](file:///c:/Users/Nijika/vlc-rpc/electron.vite.config.ts#L11):
```ts
main: {
  build: {
    minify: false,
    ...
```
El bundle de Node.js para el proceso principal (`out/main/main.js`) no se minifica en ningún entorno.

### 🚀 Optimización recomendada
Activar minificación en builds de producción:
```ts
minify: process.env.NODE_ENV === "production",
```
Esto reduce el tamaño del archivo empaquetado dentro del contenedor `.asar` y reduce ligeramente el tiempo de lectura de disco al arrancar la aplicación.

---

## Tabla Comparativa de Rendimiento

| Área | Estado Actual | Estado Optimizado | Beneficio Directo |
| :--- | :--- | :--- | :--- |
| **Sondeo en Segundo Plano** | Main (1.5s) + Renderer (2s) activos siempre | Renderer se pausa en tray / eventos push | Ahorro considerable de CPU y batería |
| **Carga de Imágenes (IPC)** | Conversión a Base64 en memoria | Protocolo nativo `media-art://` en streaming | -33% uso de RAM, menos pausas de GC |
| **Diff de Estado VLC** | Cálculo de hash MD5 cada 1.5s | Comparación directa de strings `===` | Cero allocations de OpenSSL en segundo plano |
| **Subida de Portadas** | Multiples copias Uint8Array y Blobs | Instancia única de Blob compartida | Menos churn de memoria por subida |
| **Iconografía** | `phosphor-react` v1 (CJS) | `@phosphor-icons/react` v2 (ESM) | Reducción de bundle y mejor tree-shaking |
