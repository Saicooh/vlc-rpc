# Guía de Refactorización y Buenas Prácticas de i18n

Este documento recopila el plan de acción detallado para alinear el soporte multilingüe de **vlc-rpc** con las buenas prácticas de la industria y ordenar el árbol de trabajo actual.

---

## 1. Higiene del Árbol de Trabajo en Git

Actualmente conviven dos funcionalidades no relacionadas en los cambios sin commitear:
- **Traducción i18n:** [`src/renderer/src/i18n.tsx`](file:///c:/Users/Nijika/vlc-rpc/src/renderer/src/i18n.tsx) y textos de la interfaz.
- **Selector de fotogramas (Frame Picker):** [`cover.frame-handler.ts`](file:///c:/Users/Nijika/vlc-rpc/src/main/features/cover/cover.frame-handler.ts), [`episode-frame-picker.tsx`](file:///c:/Users/Nijika/vlc-rpc/src/renderer/src/features/media/components/episode-frame-picker.tsx) y extensiones IPC.

### Pasos recomendados:

1. **Aislar la función de fotogramas:**
   ```powershell
   git stash push -m "wip: episode frame picker" src/main/features/cover/cover.frame-handler.ts src/renderer/src/features/media/components/episode-frame-picker.tsx src/main/features/media/media.handler.ts src/preload/ src/shared/ipc/ src/shared/media/
   ```
2. **Trabajar y verificar i18n de manera aislada.**
3. **Corregir el linter (`biome`):**
   ```powershell
   bun run lint
   ```

---

## 2. Eliminar `translateNode` de los Componentes Base

> [!WARNING]
> **Riesgo de traducción no deseada:** Si un componente genérico como `Button` o `Badge` traduce automáticamente su contenido, títulos de películas o canciones como *"Home"*, *"Main"*, *"Unknown"* o *"Clear"* serán traducidos erróneamente a *"Inicio"*, *"Principal"*, etc.

### Archivos a restaurar:
- [`src/renderer/src/components/ui/button.tsx`](file:///c:/Users/Nijika/vlc-rpc/src/renderer/src/components/ui/button.tsx)
- [`src/renderer/src/components/ui/badge.tsx`](file:///c:/Users/Nijika/vlc-rpc/src/renderer/src/components/ui/badge.tsx)
- [`src/renderer/src/components/ui/panel.tsx`](file:///c:/Users/Nijika/vlc-rpc/src/renderer/src/components/ui/panel.tsx)
- [`src/renderer/src/components/ui/tabs.tsx`](file:///c:/Users/Nijika/vlc-rpc/src/renderer/src/components/ui/tabs.tsx)

### Cambio requerido:
Revertir el uso de `translateNode(children, t)` a `{children}` normal:

```diff
- <button ...>{translateNode(children, t)}</button>
+ <button ...>{children}</button>
```

Traducir siempre explícitamente en el componente que define el texto:
```tsx
<Button>{t("Save")}</Button>
```

---

## 3. Eliminar Regex (`VERSION_PATTERNS`) e Implementar Interpolación Limpia

> [!IMPORTANT]
> Nunca formatees un texto con variables para luego intentar desarmarlo con una expresión regular.

En [`src/renderer/src/shell/update-chip.tsx`](file:///c:/Users/Nijika/vlc-rpc/src/renderer/src/shell/update-chip.tsx):
- En lugar de generar strings como `"Get 5.1.0"` y esperar que el regex `/^Get ([\d.]+)$/` lo capture, pasa la clave con el parámetro de reemplazo directamente:

```tsx
// Antes (antipatrón):
label = `Get ${offer.version}` // y luego un regex en i18n.tsx intenta parsearlo

// Mejor (buena práctica):
label = t("Get {version}", { version: offer.version })
```

En [`src/renderer/src/i18n.tsx`](file:///c:/Users/Nijika/vlc-rpc/src/renderer/src/i18n.tsx):
- Eliminar `VERSION_PATTERNS` y `VERSION_TEMPLATES`.
- Mantener la función `translate` enfocada en el reemplazo simple de variables `{key}`:

```ts
export function translate(
  language: Language,
  key: string,
  values?: Record<string, string | number>
): string {
  let result = language === "es" ? (ES[key] ?? key) : key
  if (values) {
    for (const [k, v] of Object.entries(values)) {
      result = result.replaceAll(`{${k}}`, String(v))
    }
  }
  return result
}
```

---

## 4. Separación de Diccionarios a Archivos JSON

En lugar de tener un objeto TypeScript de cientos de líneas dentro del código ejecutable, separa las traducciones en archivos JSON dedicados:

- `src/renderer/src/locales/en.json` (o usar como claves los textos en inglés)
- `src/renderer/src/locales/es.json`

### Ejemplo de `es.json`:
```json
{
  "Settings": "Configuración",
  "Prefer Spanish episode titles": "Preferir títulos de episodios en español",
  "Get {version}": "Obtener {version}",
  "Season {season}, episode {episode}": "Temporada {season}, episodio {episode}"
}
```

Importar directamente en [`src/renderer/src/i18n.tsx`](file:///c:/Users/Nijika/vlc-rpc/src/renderer/src/i18n.tsx):
```ts
import esTranslations from "./locales/es.json"

const ES: Record<string, string> = esTranslations
```

> [!TIP]
> **Ventaja:** Cualquier colaborador o servicio de traducción automática puede editar `es.json` sin riesgo de romper imports, sintaxis TypeScript ni la lógica del componente.

---

## 5. Traducir el Menú de la Bandeja (Main Process Tray)

El proceso principal de Electron construye el menú del sistema de forma estática en inglés en [`src/main/features/app/app.tray.ts`](file:///c:/Users/Nijika/vlc-rpc/src/main/features/app/app.tray.ts).

Para que la traducción sea coherente en todo el sistema operativo:
1. En `app.tray.ts`, consultar `configService.get("interfaceLanguage")`.
2. Definir o importar las etiquetas traducidas para los ítems del menú:
   - *"Open VLC Discord RP"* -> *"Abrir VLC Discord RP"*
   - *"Minimize to Tray"* -> *"Minimizar a la bandeja"*
   - *"Start with System"* -> *"Iniciar con Windows"*
   - *"Disable for 15 minutes"* -> *"Desactivar durante 15 minutos"*
   - *"Exit"* -> *"Salir"*

---

## 6. Checklist de Verificación Final

- [ ] Las modificaciones de `frame-picker` están separadas del commit de i18n.
- [ ] Los componentes `Button`, `Panel`, `Badge` y `Tabs` no ejecutan `translateNode`.
- [ ] `i18n.tsx` no contiene expresiones regulares para revertir plantillas.
- [ ] Los diccionarios residen en archivos JSON ordenados.
- [ ] Pruebas unitarias ejecutadas con éxito: `bun run test`
- [ ] Comprobación de tipos limpia: `bun run typecheck`
- [ ] Linter y formateador sin advertencias: `bun run lint:check`
