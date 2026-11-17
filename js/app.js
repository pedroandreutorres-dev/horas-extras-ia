import {
  requestPersistentStorage,
  getAllLogs,
  saveLog,
  deleteLog,
  clearDemoLogs,
  clearAllLogs,
  isDemoLog,
  getSettings,
  saveSettings,
  saveEncryptedApiKey,
  getDecryptedApiKey,
  clearEncryptedApiKey,
  hasConfiguredApiKey,
  getChatMemory,
  saveChatMemory,
  clearChatMemory,
  seedDemoData,
  exportToCSV,
  exportBackupJSON,
  importBackupJSON
} from './db.js';

import {
  TYPE_LABELS,
  formatMonthLabel,
  getAvailableMonths,
  filterLogsByPeriod,
  computeKPIs,
  isValidTimeStr,
  computeHoursBetween,
  addHoursToTime,
  subtractHoursFromTime
} from './analytics.js';

import { updateDashboardCharts, renderChatChart, canShareImageFiles, exportOrShareChart } from './charts.js';

import {
  DEFAULT_GEMINI_MODEL,
  PRESET_GEMINI_MODELS,
  SUPPORTED_GEMINI_MODEL_IDS,
  detectAvailableModels,
  askGeminiAboutOvertime,
  sanitizeErrorMessage
} from './llm.js';

const state = {
  logs: [],
  settings: getSettings(),
  activeView: 'view-register',
  dashboardPeriod: 'month',
  editingId: null,
  lastTimeFieldEdited: null,
  startManuallyEdited: false,
  chatHistory: getChatMemory(),
  deferredInstallPrompt: null,
  detectedModels: []
};

// ==================== UTILIDADES UI ====================

function $(id) {
  return document.getElementById(id);
}

function getTodayISO() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function formatNumber(val, decimals = 2) {
  return Number(val || 0).toLocaleString('es-ES', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  });
}

function formatHours(val) {
  const n = Number(val || 0);
  return Number.isInteger(n) ? `${n}` : formatNumber(n, 2);
}

function formatReadableDate(isoDate) {
  if (!isoDate) return '';
  const [y, m, d] = isoDate.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.toLocaleDateString('es-ES', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  });
}

let toastTimer = null;
function showToast(message) {
  const el = $('toast');
  if (!el) return;
  el.textContent = message;
  el.classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    el.classList.remove('visible');
  }, 2800);
}

function downloadTextFile(filename, content, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function escapeHTML(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatInlineMarkdown(escapedLine) {
  return escapedLine
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`]+)`/g, '<code>$1</code>');
}

/**
 * Convierte Markdown básico (tablas, listas, negritas y párrafos) a HTML seguro.
 */
function renderSafeMarkdown(rawText) {
  const safe = escapeHTML(rawText || '');
  const lines = safe.split(/\r?\n/);
  const html = [];
  let inList = false;
  let inTable = false;
  let tableHeaderDone = false;

  const closeList = () => {
    if (inList) {
      html.push('</ul>');
      inList = false;
    }
  };

  const closeTable = () => {
    if (inTable) {
      html.push('</tbody></table>');
      inTable = false;
      tableHeaderDone = false;
    }
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();

    if (!line) {
      closeList();
      closeTable();
      continue;
    }

    // Fila de tabla Markdown
    if (line.startsWith('|') && line.endsWith('|')) {
      closeList();
      const cells = line
        .slice(1, -1)
        .split('|')
        .map((c) => c.trim());

      // Línea separadora | --- | --- |
      if (cells.every((c) => /^:?-{2,}:?$/.test(c))) {
        tableHeaderDone = true;
        continue;
      }

      if (!inTable) {
        inTable = true;
        tableHeaderDone = false;
        html.push('<table><thead><tr>');
        for (const cell of cells) {
          html.push(`<th>${formatInlineMarkdown(cell)}</th>`);
        }
        html.push('</tr></thead><tbody>');
      } else {
        const tag = !tableHeaderDone ? 'th' : 'td';
        html.push('<tr>');
        for (const cell of cells) {
          html.push(`<${tag}>${formatInlineMarkdown(cell)}</${tag}>`);
        }
        html.push('</tr>');
      }
      continue;
    } else {
      closeTable();
    }

    // Elemento de lista (- , * , o 1. )
    const listMatch = line.match(/^(?:[-*•]|\d+\.)\s+(.+)$/);
    if (listMatch) {
      if (!inList) {
        html.push('<ul>');
        inList = true;
      }
      html.push(`<li>${formatInlineMarkdown(listMatch[1])}</li>`);
      continue;
    }

    closeList();

    // Encabezados sencillos
    const headingMatch = line.match(/^#{1,3}\s+(.+)$/);
    if (headingMatch) {
      html.push(`<p><strong>${formatInlineMarkdown(headingMatch[1])}</strong></p>`);
    } else {
      html.push(`<p>${formatInlineMarkdown(line)}</p>`);
    }
  }

  closeList();
  closeTable();
  return html.join('');
}

// ==================== TEMA Y NAVEGACIÓN ====================

function applyTheme(theme) {
  const isLight = theme === 'light';
  document.body.classList.toggle('light-theme', isLight);
  const toggleBtn = $('btn-toggle-theme');
  if (toggleBtn) {
    toggleBtn.textContent = isLight ? '🌙' : '☀️';
  }
  const metaTheme = document.querySelector('meta[name="theme-color"]');
  if (metaTheme) {
    metaTheme.setAttribute('content', isLight ? '#f1f5f9' : '#0b1120');
  }
}

function updateCurrencySymbols() {
  const sym = state.settings.currency || '€';
  document.querySelectorAll('.currency-symbol').forEach((el) => {
    el.textContent = sym;
  });
}

function switchView(targetId) {
  state.activeView = targetId;

  document.querySelectorAll('.view').forEach((v) => {
    v.classList.toggle('active', v.id === targetId);
  });

  document.querySelectorAll('.nav-item').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.target === targetId);
  });

  if (targetId === 'view-dashboard') {
    renderDashboard();
  } else if (targetId === 'view-ai') {
    refreshAIStatusBanner();
  } else if (targetId === 'view-settings') {
    refreshSettingsView();
  }
}

// ==================== VISTA 1: REGISTRO E HISTORIAL ====================

function updateLivePreview() {
  const hours = Number.parseFloat($('entry-hours').value);
  const rateRaw = $('entry-rate').value.trim();
  const rate = rateRaw === '' ? null : Number.parseFloat(rateRaw);
  const preview = $('live-total-preview');
  const clearRateBtn = $('btn-clear-rate');
  const currency = state.settings.currency || '€';

  if (clearRateBtn) {
    clearRateBtn.classList.toggle('hidden', rateRaw === '');
  }

  if (Number.isFinite(hours) && hours > 0 && rate !== null && Number.isFinite(rate) && rate > 0) {
    preview.textContent = `${formatNumber(hours * rate, 2)} ${currency}`;
    preview.style.color = 'var(--green)';
  } else {
    preview.textContent = '—';
    preview.style.color = 'var(--text-muted)';
  }
}

function syncQuickHourHighlight() {
  const val = Number.parseFloat($('entry-hours').value);
  document.querySelectorAll('.quick-hour-btn').forEach((btn) => {
    const btnVal = Number.parseFloat(btn.dataset.hours);
    btn.classList.toggle('active', Number.isFinite(val) && val === btnVal);
  });
}

function updateFormValidity() {
  const dateVal = $('entry-date').value;
  const startVal = $('entry-start').value;
  const endVal = $('entry-end').value;
  const hoursVal = Number.parseFloat($('entry-hours').value);

  const isValid =
    /^\d{4}-\d{2}-\d{2}$/.test(dateVal) &&
    isValidTimeStr(startVal) &&
    isValidTimeStr(endVal) &&
    Number.isFinite(hoursVal) &&
    hoursVal > 0 &&
    hoursVal <= 24;

  $('btn-submit-entry').disabled = !isValid;
  return isValid;
}

function handleStartTimeChange() {
  const start = $('entry-start').value;
  const end = $('entry-end').value;
  const hours = Number.parseFloat($('entry-hours').value);
  const validHours = Number.isFinite(hours) && hours > 0 && hours <= 24;

  state.startManuallyEdited = isValidTimeStr(start);

  if (isValidTimeStr(start)) {
    if ((state.lastTimeFieldEdited === 'hours' && validHours) || (!isValidTimeStr(end) && validHours)) {
      const computedEnd = addHoursToTime(start, hours);
      if (computedEnd) $('entry-end').value = computedEnd;
    } else if (isValidTimeStr(end)) {
      const computedHours = computeHoursBetween(start, end);
      if (computedHours !== null) $('entry-hours').value = computedHours;
    }
    state.lastTimeFieldEdited = 'start';
  }

  syncQuickHourHighlight();
  updateLivePreview();
  updateFormValidity();
}

function handleEndTimeChange() {
  const start = $('entry-start').value;
  const end = $('entry-end').value;
  const hours = Number.parseFloat($('entry-hours').value);
  const validHours = Number.isFinite(hours) && hours > 0 && hours <= 24;

  if (isValidTimeStr(end)) {
    if (
      (state.lastTimeFieldEdited === 'hours' && validHours && (!isValidTimeStr(start) || !state.startManuallyEdited)) ||
      (!isValidTimeStr(start) && validHours)
    ) {
      const computedStart = subtractHoursFromTime(end, hours);
      if (computedStart) $('entry-start').value = computedStart;
    } else if (isValidTimeStr(start)) {
      const computedHours = computeHoursBetween(start, end);
      if (computedHours !== null) $('entry-hours').value = computedHours;
    }
    state.lastTimeFieldEdited = 'end';
  }

  syncQuickHourHighlight();
  updateLivePreview();
  updateFormValidity();
}

function handleHoursChange() {
  const start = $('entry-start').value;
  const end = $('entry-end').value;
  const hours = Number.parseFloat($('entry-hours').value);

  if (Number.isFinite(hours) && hours > 0 && hours <= 24) {
    if (
      (state.lastTimeFieldEdited === 'end' && !state.startManuallyEdited && isValidTimeStr(end)) ||
      (!isValidTimeStr(start) && isValidTimeStr(end))
    ) {
      const computedStart = subtractHoursFromTime(end, hours);
      if (computedStart) $('entry-start').value = computedStart;
    } else if (isValidTimeStr(start)) {
      const computedEnd = addHoursToTime(start, hours);
      if (computedEnd) $('entry-end').value = computedEnd;
    }
    state.lastTimeFieldEdited = 'hours';
  }

  syncQuickHourHighlight();
  updateLivePreview();
  updateFormValidity();
}

function setSelectedType(type) {
  $('entry-type').value = type;
  document.querySelectorAll('#type-selector .type-pill').forEach((pill) => {
    pill.classList.toggle('active', pill.dataset.type === type);
  });
}

function resetEntryForm() {
  state.editingId = null;
  state.lastTimeFieldEdited = null;
  state.startManuallyEdited = false;

  $('entry-id').value = '';
  $('entry-date').value = getTodayISO();
  $('entry-start').value = '18:00';
  $('entry-end').value = '';
  $('entry-hours').value = '';
  $('entry-rate').value = state.settings.defaultHourlyRate !== '' ? state.settings.defaultHourlyRate : '';
  $('entry-notes').value = '';
  setSelectedType('normal');

  $('edit-banner').classList.add('hidden');
  $('form-title').textContent = 'Apuntar horas extras';
  $('btn-submit-entry').textContent = '💾 Guardar horas extras';
  syncQuickHourHighlight();
  updateLivePreview();
  updateFormValidity();
}

function startEditLog(id) {
  const log = state.logs.find((l) => l.id === id);
  if (!log) return;

  state.editingId = log.id;
  state.lastTimeFieldEdited = null;
  state.startManuallyEdited = true;

  const start = log.startTime || '18:00';
  const end = isValidTimeStr(log.endTime) ? log.endTime : addHoursToTime(start, log.hours);

  $('entry-id').value = log.id;
  $('entry-date').value = log.date;
  $('entry-start').value = start;
  $('entry-end').value = end;
  $('entry-hours').value = log.hours;
  $('entry-rate').value = log.hourlyRate !== null && log.hourlyRate !== undefined ? log.hourlyRate : '';
  $('entry-notes').value = log.notes || '';
  setSelectedType(log.type || 'normal');

  $('edit-banner').classList.remove('hidden');
  $('form-title').textContent = 'Editar registro';
  $('btn-submit-entry').textContent = '✅ Actualizar registro';
  syncQuickHourHighlight();
  updateLivePreview();
  updateFormValidity();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function renderRegisterSummary() {
  const currency = state.settings.currency || '€';
  const target = Number(state.settings.monthlyTargetHours) || 20;
  const monthLogs = filterLogsByPeriod(state.logs, 'month');
  const kpis = computeKPIs(monthLogs);

  $('mini-month-hours').textContent = `${formatHours(kpis.totalHours)} h`;
  $('mini-month-goal').textContent = `Objetivo: ${formatHours(target)} h`;
  const pct = Math.min(100, Math.round((kpis.totalHours / target) * 100));
  $('mini-month-progress').style.width = `${pct}%`;

  $('mini-month-earnings').textContent = `${formatNumber(kpis.totalEarnings, 2)} ${currency}`;
  $('mini-month-sessions').textContent = `${kpis.totalSessions} ${kpis.totalSessions === 1 ? 'registro' : 'registros'} este mes`;
}

function populateMonthFilter() {
  const select = $('filter-month');
  const currentVal = select.value;
  const months = getAvailableMonths(state.logs);

  select.innerHTML = '<option value="all">Todos los meses</option>';
  for (const m of months) {
    const opt = document.createElement('option');
    opt.value = m;
    opt.textContent = formatMonthLabel(m);
    select.appendChild(opt);
  }

  if (months.includes(currentVal)) {
    select.value = currentVal;
  } else {
    select.value = 'all';
  }
}

function renderLogsList() {
  const container = $('logs-list');
  const monthFilter = $('filter-month').value;
  const search = $('filter-search').value.trim().toLowerCase();
  const currency = state.settings.currency || '€';

  let filtered = filterLogsByPeriod(state.logs, monthFilter);
  if (search) {
    filtered = filtered.filter((log) => {
      const note = (log.notes || '').toLowerCase();
      const typeLabel = (TYPE_LABELS[log.type] || log.type || '').toLowerCase();
      const dateStr = (log.date || '').toLowerCase();
      return note.includes(search) || typeLabel.includes(search) || dateStr.includes(search);
    });
  }

  $('history-count-label').textContent = `${filtered.length} ${filtered.length === 1 ? 'registro mostrado' : 'registros mostrados'}`;

  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        ${state.logs.length === 0
          ? 'Aún no hay horas extras guardadas. Apunta la primera arriba o carga datos Demo desde Ajustes.'
          : 'No hay registros que coincidan con este filtro.'}
      </div>`;
    return;
  }

  container.innerHTML = filtered
    .map((log) => {
      const hasRate = log.hourlyRate !== null && log.hourlyRate !== undefined && log.hourlyRate > 0;
      const total = hasRate ? log.hours * log.hourlyRate : 0;
      const timeRange = log.endTime ? `${log.startTime} - ${log.endTime}` : `Inicio: ${log.startTime || '--:--'}`;
      const typeLabel = TYPE_LABELS[log.type] || 'Normal';
      const safeNote = escapeHTML(log.notes || 'Sin nota');
      const demoBadge = isDemoLog(log)
        ? '<span class="badge" style="background:rgba(148,163,184,0.18);color:var(--text-muted);">🧪 Demo</span>'
        : '';

      return `
        <article class="log-item" data-id="${escapeHTML(log.id)}">
          <div class="log-top">
            <div>
              <div class="log-date">${escapeHTML(formatReadableDate(log.date))}</div>
              <div class="log-time">🕒 ${escapeHTML(timeRange)}</div>
            </div>
            <div class="log-metrics">
              <div class="log-hours">${formatHours(log.hours)} h</div>
              ${hasRate
                ? `<div class="log-money">${formatNumber(total, 2)} ${escapeHTML(currency)} · ${formatNumber(log.hourlyRate, 2)}${escapeHTML(currency)}/h</div>`
                : `<div class="log-money no-rate">Sin precio asignado</div>`}
            </div>
          </div>
          <div class="log-bottom">
            <div class="log-note-wrap">
              <span class="badge badge-${escapeHTML(log.type || 'normal')}">${escapeHTML(typeLabel)}</span>
              ${demoBadge}
              <span class="log-note" title="${safeNote}">${safeNote}</span>
            </div>
            <div class="log-actions">
              <button type="button" class="btn btn-secondary btn-sm btn-edit-log" data-id="${escapeHTML(log.id)}" aria-label="Editar">✏️</button>
              <button type="button" class="btn btn-danger btn-sm btn-delete-log" data-id="${escapeHTML(log.id)}" aria-label="Borrar">🗑️</button>
            </div>
          </div>
        </article>`;
    })
    .join('');
}

// ==================== VISTA 2: DASHBOARD ====================

function renderDashboard() {
  const currency = state.settings.currency || '€';
  const filtered = filterLogsByPeriod(state.logs, state.dashboardPeriod);

  const emptyEl = $('dashboard-empty');
  const contentEl = $('dashboard-content');

  if (filtered.length === 0) {
    emptyEl.classList.remove('hidden');
    contentEl.classList.add('hidden');
    return;
  }

  emptyEl.classList.add('hidden');
  contentEl.classList.remove('hidden');

  const kpis = computeKPIs(filtered);

  $('kpi-total-hours').textContent = `${formatHours(kpis.totalHours)} h`;
  $('kpi-hours-split').textContent =
    kpis.unpaidHours > 0
      ? `${formatHours(kpis.paidHours)} h con tarifa · ${formatHours(kpis.unpaidHours)} h sin precio`
      : `${formatHours(kpis.paidHours)} h con tarifa`;

  $('kpi-total-earnings').textContent = `${formatNumber(kpis.totalEarnings, 2)} ${currency}`;
  $('kpi-earnings-sub').textContent =
    kpis.paidHours > 0 ? `Sobre ${formatHours(kpis.paidHours)} h remuneradas` : 'Sin tarifas registradas';

  $('kpi-avg-rate').textContent =
    kpis.avgHourlyRate > 0 ? `${formatNumber(kpis.avgHourlyRate, 2)} ${currency}` : '—';

  $('kpi-total-days').textContent = `${kpis.totalDays}`;
  $('kpi-total-sessions').textContent = `${kpis.totalSessions} ${kpis.totalSessions === 1 ? 'registro' : 'registros'}`;

  updateDashboardCharts(filtered, state.settings.theme, currency);
}

// ==================== VISTA 3: ASISTENTE IA ====================

function refreshAIStatusBanner() {
  const hasKey = hasConfiguredApiKey();
  $('ai-key-banner').classList.toggle('hidden', hasKey);
  const activeModel = SUPPORTED_GEMINI_MODEL_IDS.has(state.settings.geminiModel)
    ? state.settings.geminiModel
    : DEFAULT_GEMINI_MODEL;
  $('ai-active-model').textContent = `🤖 ${activeModel}`;
  const completedTurns = Math.floor(state.chatHistory.length / 2);
  $('ai-memory-count').textContent = String(completedTurns);
}

function getWelcomeChatHTML() {
  return `
    <div class="chat-bubble assistant">
      <div class="chat-markdown">
        <p>👋 ¡Hola! Soy tu asistente analítico conectado a <strong>Google Gemini</strong>.</p>
        <p>Solo respondo consultas sobre tus <strong>horas extras, tarifas, ingresos y gráficas</strong>, con memoria de la conversación. Prueba los botones rápidos o pregúntame directamente.</p>
      </div>
    </div>`;
}

function restoreChatHistoryUI() {
  const container = $('chat-messages');
  container.innerHTML = getWelcomeChatHTML();
  if (!state.chatHistory || state.chatHistory.length === 0) return;

  for (const msg of state.chatHistory) {
    appendChatBubble({
      role: msg.role === 'user' ? 'user' : 'assistant',
      text: msg.text,
      highlights: msg.highlights || [],
      chart: msg.chart || null,
      fallbackInfo: msg.fallbackInfo || null
    });
  }
}

function slugifyFilename(text) {
  return String(text || 'grafica')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 42) || 'grafica';
}

const PERIOD_LABELS = {
  week: 'Esta semana',
  month: 'Este mes',
  '3months': 'Últimos 3 meses',
  year: 'Este año',
  all: 'Todo el historial'
};

async function handleChartExportOrShare({ canvas, title, subtitle = '', mode = 'download' }) {
  try {
    const filename = `grafica-${slugifyFilename(title)}-${getTodayISO()}.png`;
    const result = await exportOrShareChart(canvas, {
      filename,
      title,
      subtitle,
      theme: state.settings.theme,
      mode
    });
    if (result === 'downloaded') {
      showToast('🖼️ Gráfica descargada en PNG');
    }
  } catch (err) {
    if (err?.name === 'AbortError') return;
    showToast(`⚠️ ${err?.message || 'No se pudo exportar la gráfica'}`);
  }
}

function appendChatBubble({
  role,
  text,
  highlights = [],
  chart = null,
  fallbackInfo = null,
  isLoading = false,
  isBlocked = false
}) {
  const container = $('chat-messages');
  const bubble = document.createElement('div');
  bubble.className = `chat-bubble ${role}${isBlocked ? ' blocked' : ''}`;

  if (isLoading) {
    const activeModel = SUPPORTED_GEMINI_MODEL_IDS.has(state.settings.geminiModel)
      ? state.settings.geminiModel
      : DEFAULT_GEMINI_MODEL;
    bubble.innerHTML = `<div class="chat-markdown"><p>⏳ Consultando a <strong>${escapeHTML(activeModel)}</strong>...</p></div>`;
    container.appendChild(bubble);
    container.scrollTop = container.scrollHeight;
    return bubble;
  }

  if (role === 'user') {
    bubble.textContent = text;
    container.appendChild(bubble);
    container.scrollTop = container.scrollHeight;
    return bubble;
  }

  // Burbuja del asistente
  if (fallbackInfo && fallbackInfo.to) {
    const fbBadge = document.createElement('div');
    fbBadge.className = 'fallback-pill';
    const reasonText = fallbackInfo.reason ? ` (${fallbackInfo.from} falló por ${fallbackInfo.reason})` : '';
    fbBadge.textContent = `⚡ Respaldo automático: ${fallbackInfo.to}${reasonText}`;
    bubble.appendChild(fbBadge);
  }

  if (isBlocked) {
    const guardBadge = document.createElement('div');
    guardBadge.className = 'chat-highlights';
    guardBadge.innerHTML = '<span class="highlight-pill">🛡️ Guardarraíl de contexto activado</span>';
    bubble.appendChild(guardBadge);
  } else if (Array.isArray(highlights) && highlights.length > 0) {
    const hlWrap = document.createElement('div');
    hlWrap.className = 'chat-highlights';
    for (const h of highlights.slice(0, 4)) {
      const pill = document.createElement('span');
      pill.className = 'highlight-pill';
      pill.textContent = h;
      hlWrap.appendChild(pill);
    }
    bubble.appendChild(hlWrap);
  }

  const mdDiv = document.createElement('div');
  mdDiv.className = 'chat-markdown';
  mdDiv.innerHTML = renderSafeMarkdown(text);
  bubble.appendChild(mdDiv);

  if (!isBlocked && chart && chart.should_render && Array.isArray(chart.labels) && chart.labels.length > 0 && Array.isArray(chart.datasets) && chart.datasets.length > 0) {
    const chartBox = document.createElement('div');
    chartBox.className = 'chat-chart-box';

    const canvasWrap = document.createElement('div');
    canvasWrap.className = 'chat-chart-canvas-wrap';
    const canvas = document.createElement('canvas');
    canvasWrap.appendChild(canvas);
    chartBox.appendChild(canvasWrap);

    const actionsRow = document.createElement('div');
    actionsRow.className = 'chat-chart-actions';
    const chartTitle = chart.title || 'Análisis de horas extras';

    const dlBtn = document.createElement('button');
    dlBtn.type = 'button';
    dlBtn.className = 'chart-icon-btn';
    dlBtn.title = 'Descargar PNG';
    dlBtn.innerHTML = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v12"/><path d="M7 10l5 5 5-5"/><path d="M5 21h14"/></svg><span>Descargar</span>';
    dlBtn.addEventListener('click', () => {
      handleChartExportOrShare({
        canvas,
        title: chartTitle,
        subtitle: `Generada el ${getTodayISO()}`,
        mode: 'download'
      });
    });
    actionsRow.appendChild(dlBtn);

    if (canShareImageFiles()) {
      const shareBtn = document.createElement('button');
      shareBtn.type = 'button';
      shareBtn.className = 'chart-icon-btn';
      shareBtn.title = 'Compartir imagen';
      shareBtn.innerHTML = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="M8.59 13.51l6.83 3.98"/><path d="M15.41 6.51l-6.82 3.98"/></svg><span>Compartir</span>';
      shareBtn.addEventListener('click', () => {
        handleChartExportOrShare({
          canvas,
          title: chartTitle,
          subtitle: `Generada el ${getTodayISO()}`,
          mode: 'share'
        });
      });
      actionsRow.appendChild(shareBtn);
    }

    chartBox.appendChild(actionsRow);
    bubble.appendChild(chartBox);
    // Renderizar cuando el canvas ya está en el DOM
    requestAnimationFrame(() => {
      renderChatChart(canvas, chart, state.settings.theme);
    });
  }

  container.appendChild(bubble);
  container.scrollTop = container.scrollHeight;
  return bubble;
}

async function handleSendAIChat(questionText) {
  const question = (questionText || '').trim();
  if (!question) return;

  const input = $('ai-prompt-input');
  const sendBtn = $('btn-send-ai');

  input.value = '';
  input.style.height = 'auto';
  sendBtn.disabled = true;

  appendChatBubble({ role: 'user', text: question });
  const loadingBubble = appendChatBubble({ role: 'assistant', isLoading: true });

  try {
    const apiKey = await getDecryptedApiKey();
    const response = await askGeminiAboutOvertime({
      question,
      logs: state.logs,
      settings: state.settings,
      apiKey,
      chatHistory: state.chatHistory
    });

    loadingBubble.remove();

    const isBlocked = response.is_allowed_topic === false || response.blockedByGuardrail;
    const fallbackInfo = response.fallbackUsed
      ? {
          from: response.requestedModel,
          to: response.usedModel,
          reason: response.fallbackReason
        }
      : null;

    appendChatBubble({
      role: 'assistant',
      text: response.answer_markdown,
      highlights: response.highlights,
      chart: response.chart,
      fallbackInfo,
      isBlocked
    });

    // Solo guardamos en la memoria las conversaciones válidas del dominio
    if (!isBlocked) {
      state.chatHistory.push({ role: 'user', text: question });
      state.chatHistory.push({
        role: 'model',
        text: response.answer_markdown,
        highlights: response.highlights || [],
        chart: response.chart || null,
        ...(fallbackInfo ? { fallbackInfo } : {})
      });
      state.chatHistory = saveChatMemory(state.chatHistory);
    }

    if (response.shouldPersistFallbackModel && response.usedModel && response.usedModel !== state.settings.geminiModel) {
      state.settings = saveSettings({ geminiModel: response.usedModel });
      if (state.activeView === 'view-settings') {
        populateModelSelect(state.detectedModels);
      }
      showToast(`Modelo actualizado a ${response.usedModel} (anterior no disponible)`);
    } else if (fallbackInfo) {
      showToast(`⚡ Respondido con respaldo: ${response.usedModel}`);
    }
    refreshAIStatusBanner();
  } catch (err) {
    loadingBubble.remove();
    appendChatBubble({
      role: 'assistant',
      text: `⚠️ **No se pudo completar la consulta:** ${sanitizeErrorMessage(err.message)}`
    });
  } finally {
    sendBtn.disabled = false;
  }
}

// ==================== VISTA 4: AJUSTES ====================

function populateModelSelect(customModels = []) {
  const select = $('set-gemini-model');
  const rawCurrent = state.settings.geminiModel || DEFAULT_GEMINI_MODEL;

  const baseList = customModels.length > 0
    ? customModels.filter((m) => SUPPORTED_GEMINI_MODEL_IDS.has(m.id))
    : PRESET_GEMINI_MODELS;

  const list = baseList.length > 0 ? baseList : PRESET_GEMINI_MODELS;
  const current = list.some((m) => m.id === rawCurrent) ? rawCurrent : list[0].id;

  const seen = new Set();
  select.innerHTML = '';

  for (const m of list) {
    if (seen.has(m.id)) continue;
    seen.add(m.id);

    const isSelected = m.id === current;
    const desc = m.description || PRESET_GEMINI_MODELS.find((p) => p.id === m.id)?.description || '';
    const opt = document.createElement('option');
    opt.value = m.id;
    opt.textContent = `${isSelected ? '✅ ' : ''}${m.id}${desc ? ` · ${desc}` : ''}`;
    select.appendChild(opt);
  }

  select.value = current;

  const hintEl = $('set-model-active-hint');
  if (hintEl) {
    hintEl.textContent = `✅ Seleccionado para consultas: ${current}`;
  }
}

async function refreshSettingsView() {
  $('set-default-rate').value = state.settings.defaultHourlyRate !== '' ? state.settings.defaultHourlyRate : '';
  $('set-currency').value = state.settings.currency || '€';
  $('set-monthly-goal').value = state.settings.monthlyTargetHours || 20;

  // Nunca volver a exponer la clave desencriptada en el input del DOM
  const keyInput = $('set-gemini-key');
  keyInput.value = '';
  keyInput.type = 'password';

  const hasKey = hasConfiguredApiKey();
  const vaultStatusEl = $('api-key-vault-status');
  const vaultTextEl = $('api-key-vault-text');

  if (hasKey) {
    const mask = state.settings.apiKeyMask || '****';
    keyInput.placeholder = '🔒 Clave cifrada guardada (escribe otra para reemplazarla)';
    vaultTextEl.textContent = `🔒 Clave cifrada con AES-GCM activa (termina en ${mask})`;
    vaultStatusEl.classList.remove('hidden');
  } else {
    keyInput.placeholder = 'AIza...';
    vaultStatusEl.classList.add('hidden');
  }

  populateModelSelect(state.detectedModels);

  const demoCount = state.logs.filter((l) => isDemoLog(l)).length;
  $('db-total-count').textContent = demoCount > 0
    ? `${state.logs.length} registros (${demoCount} Demo)`
    : `${state.logs.length} registros`;

  const clearDemoBtn = $('btn-clear-demo');
  if (demoCount > 0) {
    clearDemoBtn.textContent = `🧹 Quitar solo datos Demo (${demoCount})`;
    clearDemoBtn.classList.remove('hidden');
  } else {
    clearDemoBtn.classList.add('hidden');
  }
}

// ==================== REFRESCO GLOBAL ====================

async function reloadDataAndUI() {
  state.logs = await getAllLogs();
  renderRegisterSummary();
  populateMonthFilter();
  renderLogsList();
  if (state.activeView === 'view-dashboard') {
    renderDashboard();
  }
  if (state.activeView === 'view-settings') {
    refreshSettingsView();
  }
}

// ==================== INICIALIZACIÓN Y EVENTOS ====================

function bindEvents() {
  // Navegación inferior
  document.querySelectorAll('.nav-item').forEach((btn) => {
    btn.addEventListener('click', () => switchView(btn.dataset.target));
  });

  // Cambio de tema
  $('btn-toggle-theme').addEventListener('click', () => {
    const next = state.settings.theme === 'light' ? 'dark' : 'light';
    state.settings = saveSettings({ theme: next });
    applyTheme(next);
    if (state.activeView === 'view-dashboard') {
      renderDashboard();
    }
  });

  // Botón instalar PWA
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    state.deferredInstallPrompt = e;
    $('btn-install-pwa').classList.remove('hidden');
  });

  $('btn-install-pwa').addEventListener('click', async () => {
    if (!state.deferredInstallPrompt) return;
    state.deferredInstallPrompt.prompt();
    const { outcome } = await state.deferredInstallPrompt.userChoice;
    if (outcome === 'accepted') {
      $('btn-install-pwa').classList.add('hidden');
      showToast('App instalada en tu dispositivo');
    }
    state.deferredInstallPrompt = null;
  });

  // Formulario de horas extras
  $('entry-date').addEventListener('input', updateFormValidity);
  $('entry-date').addEventListener('change', updateFormValidity);

  $('entry-start').addEventListener('input', handleStartTimeChange);
  $('entry-start').addEventListener('change', handleStartTimeChange);

  $('entry-end').addEventListener('input', handleEndTimeChange);
  $('entry-end').addEventListener('change', handleEndTimeChange);

  $('entry-hours').addEventListener('input', handleHoursChange);
  $('entry-hours').addEventListener('change', handleHoursChange);

  $('entry-rate').addEventListener('input', updateLivePreview);

  document.querySelectorAll('.quick-hour-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      $('entry-hours').value = btn.dataset.hours;
      handleHoursChange();
    });
  });

  $('btn-clear-rate').addEventListener('click', () => {
    $('entry-rate').value = '';
    updateLivePreview();
  });

  document.querySelectorAll('#type-selector .type-pill').forEach((pill) => {
    pill.addEventListener('click', () => setSelectedType(pill.dataset.type));
  });

  $('btn-cancel-edit').addEventListener('click', () => {
    resetEntryForm();
    showToast('Edición cancelada');
  });

  $('overtime-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!updateFormValidity()) {
      showToast('⚠️ Completa Fecha, Hora de inicio, Hora de fin y Horas totales.');
      return;
    }
    try {
      const existing = state.editingId ? state.logs.find((l) => l.id === state.editingId) : null;
      await saveLog({
        id: state.editingId || undefined,
        createdAt: existing?.createdAt,
        date: $('entry-date').value,
        startTime: $('entry-start').value,
        endTime: $('entry-end').value,
        hours: $('entry-hours').value,
        hourlyRate: $('entry-rate').value.trim(),
        type: $('entry-type').value,
        notes: $('entry-notes').value
      });

      const wasEditing = Boolean(state.editingId);
      resetEntryForm();
      await reloadDataAndUI();
      showToast(wasEditing ? '✅ Registro actualizado' : '✅ Horas extras guardadas');
    } catch (err) {
      showToast(`⚠️ ${err.message}`);
    }
  });

  // Filtros e historial (delegación de eventos para Editar / Borrar)
  $('filter-month').addEventListener('change', renderLogsList);
  $('filter-search').addEventListener('input', renderLogsList);

  $('logs-list').addEventListener('click', async (e) => {
    const editBtn = e.target.closest('.btn-edit-log');
    if (editBtn) {
      startEditLog(editBtn.dataset.id);
      return;
    }

    const delBtn = e.target.closest('.btn-delete-log');
    if (delBtn) {
      const id = delBtn.dataset.id;
      if (confirm('¿Seguro que quieres eliminar este registro?')) {
        await deleteLog(id);
        if (state.editingId === id) resetEntryForm();
        await reloadDataAndUI();
        showToast('🗑️ Registro eliminado');
      }
    }
  });

  // Dashboard periodos y exportación de gráficas
  document.querySelectorAll('#dashboard-periods .period-pill').forEach((pill) => {
    pill.addEventListener('click', () => {
      state.dashboardPeriod = pill.dataset.period;
      document.querySelectorAll('#dashboard-periods .period-pill').forEach((p) => {
        p.classList.toggle('active', p === pill);
      });
      renderDashboard();
    });
  });

  $('dashboard-content').addEventListener('click', (e) => {
    const dlBtn = e.target.closest('.btn-chart-download');
    const shareBtn = e.target.closest('.btn-chart-share');
    const btn = dlBtn || shareBtn;
    if (!btn) return;

    const canvas = $(btn.dataset.chartId);
    const title = btn.dataset.chartTitle || 'Gráfica';
    const periodText = PERIOD_LABELS[state.dashboardPeriod] || '';
    const subtitle = periodText ? `${periodText} · ${getTodayISO()}` : getTodayISO();

    handleChartExportOrShare({
      canvas,
      title,
      subtitle,
      mode: shareBtn ? 'share' : 'download'
    });
  });

  // Asistente IA
  $('btn-ai-go-settings').addEventListener('click', () => switchView('view-settings'));

  $('btn-clear-chat').addEventListener('click', () => {
    clearChatMemory();
    state.chatHistory = [];
    restoreChatHistoryUI();
    refreshAIStatusBanner();
    showToast('🧹 Chat y memoria reiniciados');
  });

  document.querySelectorAll('#ai-quick-prompts .prompt-chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      handleSendAIChat(chip.dataset.prompt);
    });
  });

  const aiTextarea = $('ai-prompt-input');
  aiTextarea.addEventListener('input', () => {
    aiTextarea.style.height = 'auto';
    aiTextarea.style.height = `${Math.min(aiTextarea.scrollHeight, 110)}px`;
  });

  aiTextarea.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      $('ai-chat-form').requestSubmit();
    }
  });

  $('ai-chat-form').addEventListener('submit', (e) => {
    e.preventDefault();
    handleSendAIChat(aiTextarea.value);
  });

  // Ajustes: preferencias
  $('settings-prefs-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const rateVal = $('set-default-rate').value.trim();
    const goalVal = Number.parseFloat($('set-monthly-goal').value) || 20;
    const currency = $('set-currency').value || '€';

    state.settings = saveSettings({
      defaultHourlyRate: rateVal === '' ? '' : Number.parseFloat(rateVal),
      monthlyTargetHours: goalVal,
      currency
    });

    updateCurrencySymbols();
    if (!state.editingId && $('entry-rate').value.trim() === '') {
      $('entry-rate').value = state.settings.defaultHourlyRate;
      updateLivePreview();
    }
    renderRegisterSummary();
    renderLogsList();
    showToast('✅ Preferencias guardadas');
  });

  // Ajustes: Gemini IA (con cifrado AES-GCM en bóveda)
  $('btn-toggle-key-vis').addEventListener('click', () => {
    const input = $('set-gemini-key');
    input.type = input.type === 'password' ? 'text' : 'password';
  });

  $('set-gemini-model').addEventListener('change', () => {
    const chosenModel = $('set-gemini-model').value;
    state.settings = saveSettings({ geminiModel: chosenModel });
    populateModelSelect(state.detectedModels);
    refreshAIStatusBanner();
    showToast(`🤖 Modelo cambiado a ${chosenModel}`);
  });

  $('settings-ai-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = $('btn-save-verify-ai');
    const statusBox = $('ai-detect-status');
    const typedKey = $('set-gemini-key').value.trim();
    const selectedBefore = $('set-gemini-model').value;

    btn.disabled = true;
    btn.textContent = '⏳ Guardando y comprobando...';
    statusBox.className = 'status-box';
    statusBox.classList.remove('hidden');
    statusBox.textContent = 'Verificando API Key y modelos compatibles...';

    try {
      let activeKey = typedKey;
      if (activeKey) {
        await saveEncryptedApiKey(activeKey);
        $('set-gemini-key').value = '';
      } else {
        activeKey = await getDecryptedApiKey();
      }

      const models = await detectAvailableModels(activeKey);
      state.detectedModels = models;

      // Respetar el modelo elegido por el usuario si sigue disponible con su clave
      const chosenModel = models.some((m) => m.id === selectedBefore)
        ? selectedBefore
        : (models.find((m) => m.verified) || models[0]).id;

      state.settings = saveSettings({
        geminiModel: chosenModel
      });

      await refreshSettingsView();
      refreshAIStatusBanner();

      const verifiedCount = models.filter((m) => m.verified).length;
      statusBox.className = 'status-box ok';
      statusBox.textContent = `✅ API Key cifrada y verificada. Modelo activo: ${chosenModel} (${verifiedCount}/${models.length} compatibles confirmados).`;
      showToast('🔒 Configuración IA guardada y verificada');
    } catch (err) {
      state.settings = getSettings();
      await refreshSettingsView();
      refreshAIStatusBanner();
      statusBox.className = 'status-box err';
      statusBox.textContent = `❌ ${sanitizeErrorMessage(err.message, typedKey)}`;
    } finally {
      btn.disabled = false;
      btn.textContent = '💾 Guardar y comprobar API Key';
    }
  });

  $('btn-clear-api-key').addEventListener('click', async () => {
    if (!confirm('¿Seguro que quieres borrar tu API Key cifrada de este dispositivo?')) return;
    await clearEncryptedApiKey();
    state.settings = getSettings();
    $('ai-detect-status').classList.add('hidden');
    await refreshSettingsView();
    refreshAIStatusBanner();
    showToast('🗑️ API Key eliminada de la bóveda');
  });

  // Ajustes: Exportar / Importar / Demo / Limpiar
  $('btn-export-csv').addEventListener('click', () => {
    if (state.logs.length === 0) {
      showToast('No hay registros para exportar');
      return;
    }
    const csv = exportToCSV(state.logs, state.settings.currency || '€');
    downloadTextFile(`horas-extras-${getTodayISO()}.csv`, csv, 'text/csv;charset=utf-8;');
    showToast('📥 Excel (CSV) descargado');
  });

  $('btn-export-json').addEventListener('click', () => {
    const json = exportBackupJSON(state.logs, state.settings);
    downloadTextFile(`backup-horas-extras-${getTodayISO()}.json`, json, 'application/json');
    showToast('💾 Copia de seguridad descargada');
  });

  $('btn-import-json').addEventListener('click', () => {
    $('input-import-file').click();
  });

  $('input-import-file').addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const replaceExisting = state.logs.length > 0
        ? confirm('¿Quieres REEMPLAZAR los registros actuales por la copia?\n\nPulsa Aceptar para reemplazar, o Cancelar para combinarlos.')
        : true;
      const count = await importBackupJSON(text, { replaceExisting });
      state.settings = getSettings();
      applyTheme(state.settings.theme);
      updateCurrencySymbols();
      await reloadDataAndUI();
      showToast(`📤 ${count} registros restaurados`);
    } catch (err) {
      showToast(`⚠️ ${err.message}`);
    } finally {
      e.target.value = '';
    }
  });

  $('btn-seed-demo').addEventListener('click', async () => {
    if (state.logs.length > 0 && !confirm('Ya tienes registros guardados. ¿Quieres añadir ~36 registros de prueba para probar gráficas y el chat IA?')) {
      return;
    }
    const count = await seedDemoData();
    await reloadDataAndUI();
    showToast(`🧪 ${count} registros Demo añadidos`);
  });

  $('btn-clear-demo').addEventListener('click', async () => {
    const demoCount = state.logs.filter((l) => isDemoLog(l)).length;
    if (demoCount === 0) {
      showToast('No hay datos Demo que quitar');
      return;
    }
    const realCount = state.logs.length - demoCount;
    if (!confirm(`Se quitarán los ${demoCount} registros de prueba (Demo) y se conservarán intactos tus ${realCount} registros reales. ¿Continuar?`)) {
      return;
    }
    const removed = await clearDemoLogs();
    if (state.editingId && !state.logs.some((l) => l.id === state.editingId && !isDemoLog(l))) {
      resetEntryForm();
    }
    await reloadDataAndUI();
    showToast(`🧹 ${removed} registros Demo eliminados`);
  });

  $('btn-clear-db').addEventListener('click', async () => {
    if (state.logs.length === 0) {
      showToast('La base de datos ya está vacía');
      return;
    }
    if (!confirm('⚠️ Se borrarán TODOS los registros de horas extras de este dispositivo. ¿Continuar?')) {
      return;
    }
    if (!confirm('Última confirmación: esta acción no se puede deshacer si no descargaste copia JSON. ¿Borrar todo?')) {
      return;
    }
    await clearAllLogs();
    resetEntryForm();
    await reloadDataAndUI();
    showToast('🗑️ Todos los registros han sido borrados');
  });
}

async function init() {
  applyTheme(state.settings.theme);
  updateCurrencySymbols();
  resetEntryForm();
  bindEvents();

  if (canShareImageFiles()) {
    document.querySelectorAll('.btn-chart-share').forEach((btn) => {
      btn.classList.remove('hidden');
    });
  }

  // Migrar automáticamente cualquier clave antigua en localStorage hacia la bóveda AES-GCM
  try {
    await getDecryptedApiKey();
    state.settings = getSettings();
  } catch {
    // No bloquear arranque si el navegador restringe crypto_vault
  }

  // Solicitar almacenamiento persistente para proteger los datos en Android
  await requestPersistentStorage();

  // Registrar Service Worker para funcionamiento offline e instalación PWA
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }

  await reloadDataAndUI();
  restoreChatHistoryUI();
  refreshAIStatusBanner();
}

init();
