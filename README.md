# ⏱️ Mis Horas Extras & IA

PWA (**Android-First**, arquitectura **Local-First**) para apuntar horas extras, analizar estadísticas y consultar tus registros con **Google Gemini** sin depender de servidores propios.

![PWA](https://img.shields.io/badge/PWA-Android%20Installable-38bdf8?style=flat-square)
![Vanilla JS](https://img.shields.io/badge/JavaScript-ES6%20Modules-f7df1e?style=flat-square)
![IndexedDB](https://img.shields.io/badge/Database-IndexedDB%20Persistent-34d399?style=flat-square)
![Web Crypto](https://img.shields.io/badge/Security-Web%20Crypto%20AES--GCM-818cf8?style=flat-square)
![Chart.js](https://img.shields.io/badge/Charts-Chart.js%204.4-fb7185?style=flat-square)
![Gemini](https://img.shields.io/badge/AI-Gemini%20Free%20Tier-0ea5e9?style=flat-square)

---

## ✨ Qué hace

* **⏱️ Registro e historial:** Fecha, inicio, fin y horas totales obligatorios con **cálculo automático tridireccional** (incluye cruces de medianoche) y chips rápidos (`0.5 h`–`3 h`). Precio/hora opcional (soporta horas remuneradas y compensables), categorías (*Normal*, *Fin de semana*, *Festivo*, *Nocturna*), buscador y filtro mensual.
* **📊 Gráficas (4 paneles):** Filtros por **Esta semana**, **Este mes**, **Últimos 3 meses**, **Este año** y **Todo el historial**, con 4 KPIs y 4 gráficas interactivas (*evolución mensual*, *día de la semana*, *tipo de hora* y *curva acumulada*).
* **🖼️ Exportación de gráficas:** Todas las gráficas (Dashboard y chat IA) permiten **descargar en PNG** con fondo sólido acorde al tema actual y, en móviles compatibles, **compartir directamente** (`Web Share API`).
* **🤖 Asistente IA con cálculo real:**
  * **Arquitectura híbrida (sin parches ni sumas inventadas):** Combina un cubo de calendario/resúmenes locales con un motor de consultas determinista (`query_overtime_logs` por *Function Calling*) que filtra y agrupa en JavaScript sobre toda la base de datos.
  * **Gráficas y memoria:** Genera gráficas dinámicas en el chat y recuerda hasta **12 turnos** de conversación.
  * **Guardarraíl estricto:** Doble bloqueo (reglas locales + validación semántica `is_allowed_topic`) para responder únicamente sobre tus horas extras o la app.
  * **Modelos gratuitos y rotación automática:** Lista curada (`gemini-3.5-flash-lite`, `gemini-3.8-flash`, `gemini-3.6-flash`, `gemini-4-hydrogen`) con verificación real por API Key y cambio automático a otro modelo si falla por cuota (`429`), saturación (`5xx`) o indisponibilidad, mostrando aviso en el chat.
* **💾 Copias y Modo Demo seguro:** Exportación a **Excel (CSV)**, copias restaurables en **JSON** (sin claves), carga de ~36 registros de prueba y botón **`🧹 Quitar solo datos Demo`** que elimina únicamente los de prueba conservando intactos los reales.

---

## 🔒 Privacidad y seguridad

* **Datos 100% locales:** Todo vive en `IndexedDB` con solicitud de almacenamiento persistente (`navigator.storage.persist()`).
* **API Key cifrada:** Se cifra con **Web Crypto (`AES-GCM` 256-bit)** usando una clave maestra no exportable (`extractable: false`) en `IndexedDB`, no se guarda en `localStorage`, no se reexpone en el DOM, viaja solo en la cabecera `x-goog-api-key` y se oculta en mensajes de error.

---

## 📁 Estructura

```text
├── index.html          # Shell PWA y las 4 pestañas (Registro, Gráficas, Asistente, Ajustes)
├── manifest.json       # Manifiesto WebAPK instalable en Android
├── sw.js               # Service Worker para caché offline del App Shell
├── css/styles.css      # Estilos Mobile-First (tema oscuro y claro)
├── js/
│   ├── app.js          # Controlador UI, formularios, historial y exportación PNG
│   ├── db.js           # IndexedDB, bóveda AES-GCM, CSV, backup JSON y control Demo
│   ├── analytics.js    # Calendario local, KPIs, series y motor queryOvertimeLogs
│   ├── charts.js       # Gráficas Chart.js y renderizado/exportación PNG
│   └── llm.js          # Cliente Gemini (Function Calling, guardarraíles y rotación)
└── assets/             # Iconos SVG y PNG (192px / 512px)
```

---

## 🚀 Uso en local e instalación en Android

No requiere `npm` ni entornos virtuales. Para probarlo en local:

```powershell
python -m http.server 8080
```

Para instalarlo en Android, ábrelo en **Chrome** desde una URL **HTTPS** (por ejemplo *GitHub Pages*) y pulsa **`📲 Instalar`** en la cabecera (o `⋮` → *Instalar aplicación*).

---

## 📄 Licencia

**Todos los derechos reservados.**  
El código se publica con fines de visualización y demostración técnica; no se autoriza su copia, redistribución ni uso comercial sin permiso expreso del autor.
