**Español** · [Português (Brasil)](README.pt-BR.md) · [Português (Portugal)](README.pt-PT.md) · [English](README.md) · [Français](README.fr.md) · [Русский](README.ru.md)

# Capri

Capri, el constructo *Project Capricorn* de *Cyberpunk: Edgerunners*, vive en el escritorio y acompaña el trabajo de tus asistentes de programación: Claude Code, Codex y Antigravity. Se teletransporta, reacciona a las tareas, te avisa cuando necesita permiso y celebra al terminar.

![Capri anuncia que una tarea ha terminado](docs/done.png)

## Qué hace

- Sigue eventos de Claude Code, Codex, Antigravity y OpenCode mediante sus integraciones.
- Muestra actividad, solicitudes de permiso, errores y resúmenes en el escritorio.
- Permite conversar por texto o voz. La transcripción de voz usa Whisper localmente en el PC.
- Puede buscar en la Web, consultar notas de Obsidian y controlar una ventana dedicada de Brave.
- Incluye animaciones, sonidos y comentarios visuales de juego opcionales.

## Instalación rápida — Windows

1. Descarga el instalador más reciente desde [Releases](https://github.com/mochiiwuff/capri-desktop/releases).
2. Instala e inicia Capri.
3. Elige una integración en el menú del personaje y reinicia el asistente de programación para cargar los hooks.
4. Para conversar con Capri, elige un modelo en el menú **Modelo de IA**. Los proveedores en línea requieren una clave API; Ollama funciona localmente.

## Ejecutar desde el código

Se requiere Node.js 20 o posterior.

```bash
git clone https://github.com/mochiiwuff/capri-desktop.git
cd capri-desktop
npm install
npm run dev
```

Para crear el instalador de Windows, ejecuta `npm run dist`. Para probar la demostración sin conectar un asistente, ejecuta `npm run demo`.

## Voz, pantalla y privacidad

- La transcripción de voz se realiza en el PC con Whisper; el audio no se envía a un servicio de voz en línea.
- Enviar capturas de pantalla a un modelo en la nube requiere autorización independiente y está desactivado de forma predeterminada.
- Los comentarios de juego son opcionales y están desactivados de forma predeterminada.
- La integración de Brave usa una extensión local. El contenido de las páginas y los resultados de búsqueda se consideran datos no confiables.
- Consulta [Qué sale de tu equipo](README.md#what-leaves-your-machine) para ver qué datos envía cada integración.

## Pruebas y desarrollo

```bash
npm test
npm run test:voice
npm run test:browser
npm run test:evolution
```

El seguimiento de ventanas solo está disponible en Windows. En macOS y Linux, Capri sigue flotando y animándose en el escritorio.

## Documentación completa

Los README [en inglés](README.md) y [en francés](README.fr.md) incluyen más detalles sobre integraciones, opciones, sonidos, seguridad, preguntas frecuentes, arte y arquitectura.

## Créditos y derechos

Capri es un personaje de fans inspirado en *Cyberpunk: Edgerunners*. Este proyecto no es oficial ni está afiliado a CD PROJEKT RED. Consulta la sección de créditos y derechos del [README principal](README.md#credits-and-rights).
