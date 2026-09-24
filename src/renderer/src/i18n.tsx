import { useStore } from "@nanostores/react"
import { configStore } from "@renderer/stores/config.store"

export type Language = "en" | "es"

/** English is the source language and the fallback for every missing entry. */
const ES: Record<string, string> = {
	Home: "Inicio",
	Layout: "Diseño",
	Settings: "Configuración",
	Main: "Principal",
	Starting: "Iniciando",
	"Not found": "Página no encontrada",
	"That page does not exist.": "Esa página no existe.",
	App: "Aplicación",
	Experimental: "Experimental",
	About: "Acerca de",
	Version: "Versión",
	"Installed as": "Tipo de instalación",
	Updates: "Actualizaciones",
	Loading: "Cargando",
	"Not available": "No disponible",
	Portable: "Portable",
	Installer: "Instalador",
	"Could not determine; updates are manual":
		"No se pudo determinar; las actualizaciones son manuales",
	"The app looks for a release on its own every few hours.":
		"La aplicación busca actualizaciones cada pocas horas.",
	"Checking for updates.": "Buscando actualizaciones.",
	"Version {version} is waiting on the button in the title bar.":
		"La versión {version} está disponible en la barra superior.",
	"You are up to date.": "Tienes la versión más reciente.",
	"A check is already running.": "Ya se está buscando una actualización.",
	"The check could not reach GitHub. Check your connection, then try again.":
		"No se pudo contactar con GitHub. Revisa tu conexión e inténtalo de nuevo.",
	"Check for updates": "Buscar actualizaciones",
	"Loading your settings": "Cargando configuración",
	"Hide Discord activity while paused": "Ocultar la actividad de Discord al pausar",
	"Clear your activity when you pause VLC; show it again when playback resumes.":
		"Oculta la actividad al pausar VLC y vuelve a mostrarla al reanudar.",
	"Keep running in the tray when you minimize": "Seguir en la bandeja al minimizar",
	"Closing or minimizing keeps the app in the tray.":
		"Al cerrar o minimizar, la aplicación sigue en la bandeja.",
	"Start in the tray": "Iniciar en la bandeja",
	"Keep the window hidden on launch, including when you open the app yourself.":
		"Mantiene la ventana oculta al iniciar, incluso si abres la aplicación manualmente.",
	"Start when Windows starts": "Iniciar con Windows",
	"Launch at sign-in; the window stays hidden if the tray option is on.":
		"Se inicia al entrar en Windows; la ventana permanece oculta si activaste la bandeja.",
	"Could not change the Windows startup setting. Try again.":
		"No se pudo cambiar el inicio con Windows. Inténtalo de nuevo.",
	"Custom Discord Button": "Botón personalizado de Discord",
	"Add a custom button (e.g., My Profile) to anime Rich Presence":
		"Añade un botón personalizado a la actividad de anime en Discord.",
	"Button Label": "Texto del botón",
	"Button URL": "Enlace del botón",
	"My Profile": "Mi perfil",
	"Uploaded cover art": "Portadas subidas",
	"When a file carries its own artwork, the app uploads it so Discord can fetch it, and remembers the link. Clearing that makes it upload again.":
		"La aplicación sube las portadas integradas para que Discord pueda mostrarlas y guarda el enlace. Al borrar esta caché, volverá a subirlas.",
	"Cleared. The next file with its own artwork gets uploaded again.":
		"Caché borrada. La próxima portada integrada se volverá a subir.",
	"Could not clear the saved links. Try again.":
		"No se pudieron borrar los enlaces guardados. Inténtalo de nuevo.",
	Clear: "Borrar",
	"Interface language": "Idioma de la interfaz",
	"Choose the language used in this window. Episode title language is a separate setting.":
		"Elige el idioma de esta ventana. El idioma de los títulos de episodios se configura aparte.",
	English: "Inglés",
	Spanish: "Español",
	"Prefer Spanish episode titles": "Preferir títulos de episodios en español",
	"Use a Spanish episode title when available; fall back to English automatically.":
		"Usa el título en español si existe; en caso contrario, usa el inglés.",
	"Show episode thumbnails": "Mostrar miniaturas de episodios",
	"Use an episode image when available. Otherwise, upload a frame from the local video to an image host for Discord.":
		"Usa una imagen del episodio si existe. Si no, sube un fotograma del vídeo local para mostrarlo en Discord.",
	Port: "Puerto",
	"VLC listens on this port. 9080 unless you changed it.":
		"VLC escucha en este puerto. Usa 9080 si no lo cambiaste.",
	Password: "Contraseña",
	"The app sends this to read VLC. Leave it empty to have one generated.":
		"La aplicación usa esta contraseña para leer VLC. Déjala vacía para generar una.",
	"Not set": "Sin configurar",
	"Hide the password": "Ocultar contraseña",
	"Show the password": "Mostrar contraseña",
	"Let this app read VLC over HTTP": "Permitir que la aplicación lea VLC por HTTP",
	"Discord Rich Presence needs this on.": "La actividad de Discord necesita esta opción activada.",
	"Saved to VLC's settings file. Open VLC to apply it.":
		"Guardado en la configuración de VLC. Abre VLC para aplicarlo.",
	"Could not write VLC's settings file. Try again.":
		"No se pudo escribir la configuración de VLC. Inténtalo de nuevo.",
	"VLC is open. Close it, then save again. Open VLC after saving.":
		"VLC está abierto. Ciérralo, guarda de nuevo y luego ábrelo.",
	"Could not check whether VLC is open. Check that it is closed, then save again.":
		"No se pudo comprobar si VLC está abierto. Ciérralo y vuelve a guardar.",
	Save: "Guardar",
	Corrections: "Correcciones",
	"Loading your corrections": "Cargando correcciones",
	"Could not read your corrections.": "No se pudieron leer tus correcciones.",
	"Try again": "Intentar de nuevo",
	"Could not remove that correction. Try again.":
		"No se pudo eliminar la corrección. Inténtalo de nuevo.",
	"You have not corrected anything yet.": "Todavía no has hecho correcciones.",
	"When the app reads the wrong title or shows the wrong cover art, correct it on Home while the file is playing. What you correct is listed here, so you can see it and take it back.":
		"Si el título o la portada son incorrectos, corrígelos en Inicio mientras se reproduce el archivo. Aquí podrás revisar y deshacer tus correcciones.",
	"Most corrections are matched on what the app reads from the file, so another release of the same title reads differently and needs one of its own. Music that carries no tags is held against the file itself, and ends if that file moves.":
		"La mayoría de las correcciones se asocian a los datos del archivo. Otra versión puede necesitar su propia corrección. La música sin etiquetas se asocia al archivo y pierde la corrección si se mueve.",
	"Open Home": "Abrir Inicio",
	"Saved from ": "Guardado desde ",
	"Remove the correction for {headline}": "Eliminar la corrección de {headline}",
	Remove: "Eliminar",
	Video: "Vídeo",
	Music: "Música",
	"No activity yet": "Aún no hay actividad",
	"Waiting for the first update": "Esperando la primera actualización",
	"No activity": "Sin actividad",
	"Nothing is playing": "No se está reproduciendo nada",
	"Rich Presence is turned off": "La actividad de Discord está desactivada",
	"VLC is not reachable": "No se puede conectar con VLC",
	"VLC has nothing playing": "VLC no está reproduciendo nada",
	"Activity is hidden while VLC is paused": "La actividad está oculta mientras VLC está pausado",
	"Presence updates are stopped": "Las actualizaciones de actividad están detenidas",
	"What VLC reports": "Datos de VLC",
	"VLC is not connected": "VLC no está conectado",
	File: "Archivo",
	Title: "Título",
	Artist: "Artista",
	Album: "Álbum",
	Episode: "Episodio",
	"Season {season}, episode {episode}": "Temporada {season}, episodio {episode}",
	"Season {season}": "Temporada {season}",
	"Episode {episode}": "Episodio {episode}",
	Year: "Año",
	Duration: "Duración",
	"Media type": "Tipo de contenido",
	"Audio match": "Coincidencia de audio",
	"Matched from the audio": "Reconocido por el audio",
	"Use what the file says": "Usar datos del archivo",
	"Turned off for this file": "Desactivado para este archivo",
	"Use the match again": "Volver a usar la coincidencia",
	"TV show": "Serie",
	Movie: "Película",
	Anime: "Anime",
	Audio: "Audio",
	"Music video": "Vídeo musical",
	Documentary: "Documental",
	Unknown: "Desconocido",
	"Looking the file up again": "Buscando de nuevo el archivo",
	"Going back to what the app worked out": "Restaurando la detección automática",
	"Not set, held against this file": "Sin configurar, asociado a este archivo",
	"Saved against this file": "Guardado para este archivo",
	"Saved for this file": "Guardado para este archivo",
	Correction: "Corrección",
	"Edit correction": "Editar corrección",
	"Correct this file": "Corregir este archivo",
	"Lookup details": "Detalles de la búsqueda",
	"Title source": "Origen del título",
	"Episode title": "Título del episodio",
	"Image source": "Origen de la imagen",
	"Found on {source}": "Encontrado en {source}",
	"A catalog request failed. Try again.": "Falló una consulta al catálogo. Inténtalo de nuevo.",
	"No matching episode title found": "No se encontró un título para este episodio",
	"Could not retry the lookup.": "No se pudo repetir la búsqueda.",
	"Retry lookup": "Reintentar búsqueda",
	Filename: "Nombre del archivo",
	Catalog: "Catálogo",
	"Local artwork": "Imagen local",
	"Chosen video frame": "Fotograma elegido",
	"Song title": "Título de la canción",
	"What the song is called": "Nombre de la canción",
	"What this should be called": "Nombre correcto",
	"Who recorded it": "Quién la grabó",
	"Cover image address, if the search misses it":
		"Enlace de la portada, si la búsqueda no la encuentra",
	"Cover image address": "Enlace de la portada",
	"Paste the address of an image": "Pega el enlace de una imagen",
	"Leave this empty and the search fills it in. Paste an address only for a record no catalog holds.":
		"Déjalo vacío para que la búsqueda encuentre la portada. Pega un enlace solo si ningún catálogo tiene ese disco.",
	"Open the image on its own first, then copy its address. The address of the page it sits on will not load.":
		"Abre la imagen directamente y copia su enlace. El enlace de la página que la contiene no funcionará.",
	"Media kind": "Tipo de contenido",
	"Keep what the app worked out": "Mantener la detección automática",
	"Keep what the app worked out, movie": "Mantener la detección automática: película",
	"Keep what the app worked out, tv show": "Mantener la detección automática: serie",
	"Save correction": "Guardar corrección",
	Cancel: "Cancelar",
	"Remove correction": "Eliminar corrección",
	"Kept against this file, at ": "Asociado a este archivo, en ",
	"Filed under ": "Guardado bajo ",
	". Moving or renaming it ends the correction.":
		". Si lo mueves o renombras, la corrección deja de aplicarse.",
	"This file carries no tags, so the app has only its name to go on. Name the song and the artist and the usual search finds the cover on its own.":
		"El archivo no tiene etiquetas, así que la aplicación solo conoce su nombre. Indica canción y artista para buscar la portada automáticamente.",
	"Audio text is built from the file's own tags, so only the cover can be corrected.":
		"El texto del audio proviene de sus etiquetas; aquí solo se puede corregir la portada.",
	"These start with what the app worked out. Clearing the title falls back to the file name, and clearing the cover leaves no cover.":
		"Estos campos parten de la detección automática. Si borras el título, se usará el nombre del archivo; si borras la portada, no se mostrará ninguna.",
	"That is not a web address. Paste a link that starts with http or https.":
		"No es un enlace web. Pega uno que comience con http o https.",
	"The cover address did not answer. Check the link, or try again if the site is down.":
		"El enlace de la portada no respondió. Revísalo o inténtalo más tarde.",
	"The cover address answered {status}. The image has moved or been taken down.":
		"El enlace de la portada respondió {status}. La imagen se movió o fue eliminada.",
	"That address does not return an image. Open the image itself and copy its address.":
		"Ese enlace no devuelve una imagen. Abre la imagen directamente y copia su enlace.",
	"That address returns {type}, not an image. Open the image itself and copy its address.":
		"Ese enlace devuelve {type}, no una imagen. Abre la imagen directamente y copia su enlace.",
	"Saving was refused for this file. Nothing was written, and that is a fault in the app rather than in what you typed.":
		"La aplicación rechazó el guardado para este archivo. No se guardó nada; es un fallo de la aplicación.",
	"Saving did not go through. The app could not reach its own store.":
		"No se pudo guardar la corrección. La aplicación no pudo acceder a sus datos.",
	"Removing did not go through. The app could not reach its own store.":
		"No se pudo eliminar la corrección. La aplicación no pudo acceder a sus datos.",
	None: "Ninguno",
	"This is not a file on disk, so there is nothing to file a correction against.":
		"No es un archivo local, así que no se puede guardar una corrección.",
	"This file name carries no title, so there is nothing to file a correction under.":
		"El nombre del archivo no contiene un título para asociar una corrección.",
	"Episode thumbnail": "Miniatura del episodio",
	"Pick a frame for this episode. Previews stay on your PC; the chosen image is uploaded for Discord.":
		"Elige un fotograma de este episodio. Las vistas previas quedan en tu PC; la imagen elegida se sube para Discord.",
	"Preview frames": "Ver fotogramas",
	"Capture again": "Capturar de nuevo",
	"Use automatic image": "Usar imagen automática",
	"Could not capture frames from this file.": "No se pudieron capturar fotogramas de este archivo.",
	"Could not apply the frame. Check that this episode is still playing.":
		"No se pudo aplicar el fotograma. Comprueba que el episodio siga reproduciéndose.",
	Selected: "Elegido",
	"Use frame at {percent} percent": "Usar el fotograma del {percent} %",
	"Set up Rich Presence": "Configurar la actividad de Discord",
	"Two steps, and Discord shows what you play in VLC.":
		"En dos pasos, Discord mostrará lo que reproduces en VLC.",
	"The app reads VLC's HTTP interface to see what is playing. The next step turns that interface on.":
		"La aplicación usa la interfaz HTTP de VLC para saber qué reproduces. El siguiente paso la activa.",
	"If a file has embedded cover art, the app uploads that image to public hosts so Discord can display it. Anyone with the link can view it while the host keeps it.":
		"Si un archivo tiene una portada integrada, la aplicación sube esa imagen a servidores públicos para mostrarla en Discord. Cualquiera que tenga el enlace puede verla mientras el servidor la conserve.",
	"The window could not load": "No se pudo cargar la ventana",
	"An interface error stopped this view. Reload the window to try again.":
		"Un error de interfaz detuvo esta vista. Vuelve a cargar la ventana para intentarlo de nuevo.",
	"Reload window": "Volver a cargar la ventana",
	"Get started": "Comenzar",
	"Configure VLC": "Configurar VLC",
	"The app reads what you play from VLC's HTTP interface.":
		"La aplicación lee lo que reproduces mediante la interfaz HTTP de VLC.",
	"HTTP port": "Puerto HTTP",
	"Leave 9080 unless another app already uses that port.":
		"Deja 9080 salvo que otra aplicación ya use ese puerto.",
	"HTTP password": "Contraseña HTTP",
	"Generated if you leave this empty": "Se genera si lo dejas vacío",
	"This protects VLC's HTTP interface, which the app turns on for you.":
		"Protege la interfaz HTTP de VLC, que la aplicación activará por ti.",
	Back: "Atrás",
	"VLC is configured": "VLC está configurado",
	"The HTTP interface is on": "La interfaz HTTP está activada",
	"Play a file in VLC to check that Discord picks it up.":
		"Reproduce un archivo en VLC para comprobar que aparece en Discord.",
	"Restart VLC if it was already running.": "Reinicia VLC si ya estaba abierto.",
	"Finish setup": "Terminar configuración",
	"Step {current} of {total}": "Paso {current} de {total}",
	"VLC is open. Close it, then select Try again. Open VLC after setup.":
		"VLC está abierto. Ciérralo, pulsa Intentar de nuevo y ábrelo después de configurar.",
	"Could not configure VLC. Check that VLC is installed and try again.":
		"No se pudo configurar VLC. Comprueba que esté instalado e inténtalo de nuevo.",
	"Something went wrong while configuring VLC.": "Ocurrió un error al configurar VLC.",
	"Could not save your setup.": "No se pudo guardar la configuración.",
	"Drag a piece onto a line of the card to build what Discord shows. Press a piece instead to put it on the line you picked. The card here is the card your profile draws, not a drawing of one. Music and video are arranged separately.":
		"Arrastra una pieza a una línea para construir lo que muestra Discord. También puedes pulsarla para añadirla a la línea elegida. La tarjeta muestra cómo se verá tu perfil. Música y vídeo se configuran por separado.",
	Pieces: "Piezas",
	"Your own words": "Tus palabras",
	"type anything": "escribe lo que quieras",
	"Add to": "Añadir a",
	Header: "Encabezado",
	"Bold line": "Línea destacada",
	"Second line": "Segunda línea",
	"Third line": "Tercera línea",
	"The same pieces for {sample}": "Las mismas piezas para {sample}",
	"What is playing": "Lo que se reproduce",
	"An example track": "Canción de ejemplo",
	"what is playing": "lo que se reproduce",
	"the example track": "la canción de ejemplo",
	"A file with no tags": "Archivo sin etiquetas",
	"a file with no tags": "un archivo sin etiquetas",
	"A radio stream": "Emisión de radio",
	"a radio stream": "una emisión de radio",
	"A TV show": "Serie de televisión",
	"a TV show": "una serie de televisión",
	"A film": "Película",
	"a film": "una película",
	"A Blu-Ray disc": "Disco Blu-ray",
	"a Blu-Ray disc": "un disco Blu-ray",
	"Now playing on radio": "Sonando en la radio",
	"Season number": "Número de temporada",
	"Episode number": "Número de episodio",
	"Blu-Ray title number": "Número de título Blu-ray",
	"Blu-Ray chapter": "Capítulo Blu-ray",
	"empty, so Discord writes the app's name here":
		"vacío; Discord pondrá aquí el nombre de la aplicación",
	header: "encabezado",
	"bold line": "línea destacada",
	"second line": "segunda línea",
	"third line": "tercera línea",
	"{label}, empty": "{label}, vacía",
	here: "aquí",
	"nothing here": "sin datos",
	"Add {label}": "Añadir {label}",
	"Reset to the default": "Restablecer diseño predeterminado",
	"Discard changes": "Descartar cambios",
	"Could not save. Try again.": "No se pudo guardar. Inténtalo de nuevo.",
	"Take the stray mark off, then save.": "Elimina el texto suelto y luego guarda.",
	"You have unsaved changes.": "Hay cambios sin guardar.",
	"Saved. Discord catches up within a few seconds.":
		"Guardado. Discord se actualizará en unos segundos.",
	'"{text}" would be drawn with nothing to separate, so it would sit on your profile as a stray mark.':
		'"{text}" aparecería aislado en tu perfil. Añade algo que lo acompañe o elimínalo.',
	"{line} draws nothing in either example, so Discord would leave it off.":
		"{line} no muestra nada en ningún ejemplo, así que Discord la omitirá.",
	and: "y",
	" for {samples}": " para {samples}",
	"{where} show the same thing{when}. Discord draws both.":
		"{where} muestran lo mismo{when}. Discord mostrará ambas.",
	"The {noun} shows on {where}{when}.": "{noun} aparece en {where}{when}.",
	"song title": "título de la canción",
	artist: "artista",
	album: "álbum",
	"radio track": "canción de radio",
	title: "título",
	"episode, which a film has none of": "episodio, que no existe en una película",
	"release year": "año de estreno",
	"season number": "número de temporada",
	"episode number": "número de episodio",
	"{label} added to the {slot}.": "{label} añadido a {slot}.",
	"{label} moved to the {slot}.": "{label} movido a {slot}.",
	"{label} taken off the {slot}.": "{label} quitado de {slot}.",
	"Moved to the {slot}.": "Movido a {slot}.",
	"{label}, {drawn}, on the {slot}. Press to take it off, or use the arrow keys to move it.":
		"{label}, {drawn}, en {slot}. Pulsa para quitarlo o usa las flechas para moverlo.",
	"nothing to show": "sin contenido",
	"Your own words on the {slot}": "Tus palabras en {slot}",
	"Take your own words off the {slot}": "Quitar tus palabras de {slot}",
	words: "palabras",
	Minimize: "Minimizar",
	Close: "Cerrar",
	Playing: "Reproduciendo",
	Paused: "Pausado",
	connecting: "conectando",
	checking: "comprobando",
	connected: "conectado",
	"not connected": "sin conexión",
	"cannot connect": "no se puede conectar",
	"not set up": "sin configurar",
	"not open": "cerrado",
	"wrong password": "contraseña incorrecta",
	"wrong port": "puerto incorrecto",
	"unexpected reply": "respuesta inesperada",
	"no answer yet": "sin respuesta",
	"Connecting to VLC": "Conectando con VLC",
	"Looking for VLC": "Buscando VLC",
	"This takes a moment.": "Esto puede tardar un momento.",
	"VLC is connected": "VLC está conectado",
	"Your Discord status follows whatever VLC plays.":
		"Tu estado en Discord sigue lo que reproduces en VLC.",
	"VLC is not set up yet": "VLC aún no está configurado",
	"The app reads what is playing through VLC's web interface, and it is switched off. Turn it on here, then restart VLC.":
		"La interfaz web de VLC está desactivada. Actívala aquí y reinicia VLC.",
	"Turn on VLC's web interface": "Activar interfaz web de VLC",
	"VLC is not open": "VLC está cerrado",
	"Open VLC and play something. The app connects on its own.":
		"Abre VLC y reproduce algo. La aplicación se conectará sola.",
	"VLC did not accept the password": "VLC rechazó la contraseña",
	"The password saved here is not the one VLC expects. Make them match in settings, then restart VLC.":
		"La contraseña guardada no coincide con la de VLC. Corrígela en Configuración y reinicia VLC.",
	"Open VLC settings": "Abrir configuración de VLC",
	"Something answered, but it was not VLC": "Respondió otro programa, no VLC",
	"Another program may have taken the port VLC uses. Check the port in settings, then restart VLC.":
		"Otro programa podría estar usando el puerto de VLC. Comprueba el puerto y reinicia VLC.",
	"VLC gave an answer the app cannot read": "VLC dio una respuesta que la aplicación no entiende",
	"Restart VLC and check again. If it keeps happening, restart the app too.":
		"Reinicia VLC y comprueba de nuevo. Si continúa, reinicia también la aplicación.",
	"VLC did not answer in time": "VLC tardó demasiado en responder",
	"VLC may be busy or still starting. This usually clears on its own.":
		"VLC podría estar ocupado o iniciándose. Suele resolverse solo.",
	"The app cannot reach VLC": "La aplicación no puede conectar con VLC",
	"Check that VLC is open and that its web interface is on, then restart VLC.":
		"Comprueba que VLC esté abierto y su interfaz web activada; luego reinícialo.",
	"Discord is connected": "Discord está conectado",
	"Your status updates while VLC plays.": "Tu estado se actualiza mientras VLC reproduce.",
	"Connecting to Discord": "Conectando con Discord",
	"Discord is not connected": "Discord no está conectado",
	"Open Discord on this computer. The app reconnects on its own.":
		"Abre Discord en este equipo. La aplicación intentará reconectarse sola.",
	"The app cannot reach Discord": "La aplicación no puede conectar con Discord",
	"Close Discord, open it again, then check again.":
		"Cierra Discord, ábrelo otra vez y vuelve a comprobar.",
	"Turned on VLC's web interface": "Interfaz web de VLC activada",
	"Open VLC to apply the change.": "Abre VLC para aplicar el cambio.",
	"VLC is open": "VLC está abierto",
	"Close VLC, then select Turn on HTTP again. Open VLC afterward.":
		"Cierra VLC, vuelve a activar HTTP y luego abre VLC.",
	"Could not check VLC": "No se pudo comprobar VLC",
	"Check that VLC is closed, then try again.":
		"Comprueba que VLC esté cerrado e inténtalo de nuevo.",
	"Could not turn it on": "No se pudo activar",
	"Turn the web interface on in VLC, then restart it.":
		"Activa la interfaz web en VLC y reinícialo.",
	"Check again": "Comprobar de nuevo",
	Restore: "Restaurar",
	Maximize: "Maximizar",
	"Version {version}": "Versión {version}",
	"Get {version}": "Obtener {version}",
	"Update to {version}": "Actualizar a {version}",
	"Retry update to {version}": "Reintentar actualización a {version}",
	"Updating to {version}": "Actualizando a {version}",
	"Opens the release page. This copy is portable, so it cannot replace itself: download {version} there and swap the file.":
		"Abre la página de versiones. Esta copia portable no puede actualizarse sola: descarga {version} y reemplaza el archivo.",
	"Opens the release page. The app could not tell how this copy was installed, so download {version} manually.":
		"Abre la página de versiones. No se pudo determinar la instalación; descarga {version} manualmente.",
	"Downloads {version}, installs it and restarts the app. VLC is not touched.":
		"Descarga {version}, lo instala y reinicia la aplicación. VLC no se modifica.",
	"The download of {version} did not finish. Pressing again starts it over, then the app restarts to install it.":
		"La descarga de {version} no terminó. Reinténtala para instalarla y reiniciar la aplicación.",
	"Downloading {version}. The app restarts on its own to finish.":
		"Descargando {version}. La aplicación se reiniciará para terminar.",
	"Restarting to install {version}.": "Reiniciando para instalar {version}.",
}

export function translate(
	language: Language,
	english: string,
	values?: Record<string, string | number>,
): string {
	let result = language === "es" ? (ES[english] ?? english) : english
	if (values)
		for (const [key, value] of Object.entries(values))
			result = result.replaceAll(`{${key}}`, String(value))
	return result
}

export function useT(): (english: string, values?: Record<string, string | number>) => string {
	const config = useStore(configStore)
	return (english, values) =>
		translate(config?.interfaceLanguage === "es" ? "es" : "en", english, values)
}
