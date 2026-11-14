# ⏱️ Mis Horas Extras & IA

Aplicación web progresiva (**PWA Android-First**) con arquitectura **Local-First** para el control diario de horas extras, análisis visual interactivo y consultas con **Google Gemini IA** sobre tu propia base de datos local.

![PWA](https://img.shields.io/badge/PWA-Android%20Installable-38bdf8?style=flat-square)
![Vanilla JS](https://img.shields.io/badge/JavaScript-ES6%20Modules-f7df1e?style=flat-square)
![IndexedDB](https://img.shields.io/badge/Database-IndexedDB%20Persistent-34d399?style=flat-square)
![Web Crypto](https://img.shields.io/badge/Security-Web%20Crypto%20AES--GCM-818cf8?style=flat-square)
![Chart.js](https://img.shields.io/badge/Charts-Chart.js%204.4-fb7185?style=flat-square)
![Gemini](https://img.shields.io/badge/AI-Google%20Gemini%203.x%20Free%20Tier-0ea5e9?style=flat-square)

---

## ✨ Características principales

### 1. ⏱️ Registro rápido e historial editable
* **Campos horarios obligatorios con cálculo tridireccional:** Rellena **Inicio + Fin**, **Inicio + Horas** o **Fin + Horas** y el tercer campo se calcula automáticamente (incluyendo cruces de medianoche). El botón de guardar se habilita únicamente cuando fecha, inicio, fin y horas están completos.
* **Botones de toque rápido:** Atajos (`0.5 h`, `1 h`, `1.5 h`, `2 h`, `3 h` y `+0.5 h`) pensados para apuntar desde el móvil en segundos.
* **Precio por hora opcional:** Soporta tanto horas remuneradas (con precio por defecto configurable y vista previa del importe) como horas sin tarifa asignada (por ejemplo, horas compensables por descanso).
* **Categorías y notas:** Clasificación en *Normal*, *Fin de semana*, *Festivo* o *Nocturna*, con filtros por mes y buscador de texto.

### 2. 📊 Dashboard visual (4 gráficas interactivas)
* Filtrado por **Este mes**, **Últimos 3 meses**, **Este año** o **Todo el historial**.
* **4 tarjetas KPI:** Total de horas (desglose con/sin tarifa), total ganado, media ponderada real por hora y días/sesiones registradas.
* **Gráficas con Chart.js:**
  1. Evolución mensual mixta (barras de horas + línea de ingresos).
  2. Patrón por día de la semana (lunes a domingo).
  3. Desglose por tipo de hora extra (anillo).
  4. Curva acumulada de horas e ingresos.

### 3. 🤖 Asistente analítico con Google Gemini IA
* **Cálculo determinista previo (sin alucinaciones matemáticas):** Antes de consultar a Gemini, `analytics.js` calcula con exactitud matemática todos los KPIs y agregaciones por mes, día y tipo para que el LLM interprete cifras reales.
* **Gráficas dinámicas bajo demanda:** Puedes pedirle resúmenes en texto/tablas o nuevas gráficas interactivas incrustadas dentro del chat.
* **Memoria conversacional persistente:** Recuerda hasta 12 turnos previos (incluyendo las gráficas mostradas anteriormente) para responder preguntas de seguimiento (*"cámbiala a barras"*, *"¿y el mes pasado?"*).
* **Doble capa de guardarraíles:** Filtro previo en cliente + validación semántica por esquema (`is_allowed_topic`) para restringir las respuestas exclusivamente al control y análisis de tus horas extras.
* **Modelos gratuitos actuales:** Configurado con `gemini-3.5-flash-lite` por defecto, detección real de modelos activos de tu API Key (`GET /v1beta/models` + prueba de generación) y *fallback* automático (`gemini-3.8-flash`, `gemini-3.6-flash`).

### 4. 🔒 Privacidad, persistencia y seguridad
* **100% Local-First:** Los registros se guardan en `IndexedDB` solicitando almacenamiento persistente al dispositivo (`navigator.storage.persist()`). No requiere servidor ni base de datos externa.
* **Bóveda cifrada para tu API Key:** Tu clave de Gemini se cifra con **Web Crypto API (`AES-GCM` de 256 bits)** usando una clave maestra `extractable: false` en `IndexedDB`, se elimina en texto plano de `localStorage`, nunca se vuelve a mostrar en el DOM tras guardarla, viaja exclusivamente en cabecera HTTP privada (`x-goog-api-key`) y se sanitiza en mensajes de error.
* **Portabilidad total:** Exportación a **Excel (CSV con BOM UTF-8)**, copias de seguridad completas en **JSON** (siempre sin claves API) y **Modo Demo** con ~36 registros de prueba de los últimos 6 meses.

---

## 📁 Estructura del proyecto

```text
├── index.html             # Estructura PWA y vistas principales
├── manifest.json          # Manifiesto WebAPK instalable en Android
├── sw.js                  # Service Worker (caché offline del App Shell)
├── css/
│   └── styles.css         # Estilos Mobile-First (tema oscuro y claro)
├── js/
│   ├── app.js             # Controlador UI, formularios y navegación
│   ├── db.js              # IndexedDB, bóveda AES-GCM, CSV y backup JSON
│   ├── analytics.js       # Cálculos exactos, KPIs, series y contexto LLM
│   ├── charts.js          # Gráficas del Dashboard y gráficas del chat IA
│   └── llm.js             # Cliente Gemini API, guardarraíles y memoria
└── assets/
    ├── icon.svg           # Icono vectorial
    ├── icon-192.png       # Icono PNG 192x192 para Android
    └── icon-512.png       # Icono PNG 512x512 (any + maskable)
```

---

## 🚀 Ejecución en local (Cero dependencias)

No requiere Node modules ni entornos virtuales. Solo un servidor HTTP estático local:

```powershell
python -m http.server 8080
```

Abre `http://localhost:8080` en tu navegador.

---

## 📱 Instalación en Android (PWA)

Al servir la aplicación bajo **HTTPS** (por ejemplo mediante *GitHub Pages*, *Netlify* o *Cloudflare Pages*):
1. Abre la URL en **Google Chrome** en Android.
2. Pulsa el botón **`📲 Instalar`** en la cabecera de la app *(o Menú `⋮` → Instalar aplicación)*.
3. Se instalará en el escritorio del teléfono a pantalla completa y con soporte offline.

---

## 📄 Licencia

**Todos los derechos reservados.**  
El código se publica con fines de visualización y demostración técnica; no se autoriza su copia, redistribución ni uso comercial sin permiso expreso del autor.
