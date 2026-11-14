import { isValidTimeStr, addHoursToTime } from './analytics.js';

const DB_NAME = 'HorasExtrasDB';
const DB_VERSION = 2;
const STORE_NAME = 'overtime_logs';
const VAULT_STORE_NAME = 'crypto_vault';
const MASTER_KEY_ID = 'master_aes_key';
const API_KEY_RECORD_ID = 'gemini_api_key';
const SETTINGS_KEY = 'horas_extras_settings';
const CHAT_MEMORY_KEY = 'horas_extras_chat_memory';
const MAX_CHAT_MEMORY_MESSAGES = 24; // 12 turnos (usuario + asistente)

const LEGACY_BLOCKED_MODELS = new Set([
  'gemini-2.5-flash',
  'gemini-2.5-flash-lite',
  'gemini-2.0-flash',
  'gemini-2.0-flash-lite',
  'gemini-1.5-flash',
  'gemini-1.5-pro'
]);

const DEMO_SCENARIO_NOTES = new Set([
  'Cierre de facturación mensual',
  'Preparación auditoría interna',
  'Compensable por días libres',
  'Entrega urgente de proyecto',
  'Inventario de sábado',
  'Guardia festivo local',
  'Despliegue y soporte nocturno',
  'Revisión de incidencias con cliente',
  'Banco de horas de descanso',
  'Actualización trimestral',
  'Soporte cierre semanal',
  'Ventana de mantenimiento',
  'Soporte de fin de semana',
  'Cierre de entregas semanales'
]);

/**
 * Indica si un registro pertenece al conjunto de datos de prueba (Demo).
 */
export function isDemoLog(log) {
  if (!log || typeof log !== 'object') return false;
  if (log.isDemo === true) return true;
  if (typeof log.id === 'string' && log.id.startsWith('demo-')) return true;
  if (typeof log.notes === 'string' && DEMO_SCENARIO_NOTES.has(log.notes.trim())) return true;
  return false;
}

export const DEFAULT_SETTINGS = {
  defaultHourlyRate: '',
  monthlyTargetHours: 20,
  currency: '€',
  hasEncryptedApiKey: false,
  apiKeyMask: '',
  geminiModel: 'gemini-3.5-flash-lite',
  theme: 'dark'
};

let dbPromise = null;
const memoryVaultFallback = new Map();

/**
 * Abre o inicializa la base de datos IndexedDB (incluyendo la bóveda cifrada).
 */
function openDB() {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('date', 'date', { unique: false });
        store.createIndex('type', 'type', { unique: false });
      }
      if (!db.objectStoreNames.contains(VAULT_STORE_NAME)) {
        db.createObjectStore(VAULT_STORE_NAME, { keyPath: 'id' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => {
      dbPromise = null;
      reject(request.error);
    };
  });

  return dbPromise;
}

/**
 * Solicita almacenamiento persistente al navegador/Android para evitar borrados automáticos.
 */
export async function requestPersistentStorage() {
  if (navigator.storage && typeof navigator.storage.persist === 'function') {
    try {
      return await navigator.storage.persist();
    } catch {
      return false;
    }
  }
  return false;
}

/**
 * Devuelve el estado de persistencia y cuota usada en el dispositivo.
 */
export async function getStorageStatus() {
  const status = {
    persisted: false,
    usageBytes: null,
    quotaBytes: null
  };
  if (!navigator.storage) return status;

  try {
    if (typeof navigator.storage.persisted === 'function') {
      status.persisted = await navigator.storage.persisted();
    }
    if (typeof navigator.storage.estimate === 'function') {
      const estimate = await navigator.storage.estimate();
      status.usageBytes = estimate.usage ?? null;
      status.quotaBytes = estimate.quota ?? null;
    }
  } catch {
    // Algunos navegadores privados restringen estimate()
  }
  return status;
}

function generateId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `ot-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Normaliza y valida un registro antes de persistirlo.
 */
export function normalizeEntry(entry, { allowAutoEndTime = false } = {}) {
  const hours = Number.parseFloat(entry.hours);
  if (!entry.date || !/^\d{4}-\d{2}-\d{2}$/.test(entry.date)) {
    throw new Error('La fecha debe tener formato AAAA-MM-DD.');
  }
  if (!Number.isFinite(hours) || hours <= 0 || hours > 24) {
    throw new Error('Hora de inicio, Hora de fin y Horas totales son obligatorios (horas > 0 y <= 24).');
  }

  const startTime = typeof entry.startTime === 'string' ? entry.startTime.trim() : '';
  if (!isValidTimeStr(startTime)) {
    throw new Error('Hora de inicio, Hora de fin y Horas totales son obligatorios.');
  }

  let endTime = typeof entry.endTime === 'string' ? entry.endTime.trim() : '';
  if (!isValidTimeStr(endTime)) {
    if (allowAutoEndTime) {
      endTime = addHoursToTime(startTime, hours);
    } else {
      throw new Error('Hora de inicio, Hora de fin y Horas totales son obligatorios.');
    }
  }

  let hourlyRate = null;
  if (entry.hourlyRate !== '' && entry.hourlyRate !== null && entry.hourlyRate !== undefined) {
    const parsedRate = Number.parseFloat(entry.hourlyRate);
    if (!Number.isFinite(parsedRate) || parsedRate < 0) {
      throw new Error('El precio por hora debe ser un número positivo o dejarse vacío.');
    }
    hourlyRate = Math.round(parsedRate * 100) / 100;
  }

  const validTypes = ['normal', 'fin_de_semana', 'festivo', 'nocturna'];
  const type = validTypes.includes(entry.type) ? entry.type : 'normal';
  const now = Date.now();
  const isDemo = Boolean(entry.isDemo || (typeof entry.id === 'string' && entry.id.startsWith('demo-')));

  const normalized = {
    id: entry.id || generateId(),
    date: entry.date,
    startTime,
    endTime,
    hours: Math.round(hours * 100) / 100,
    hourlyRate,
    type,
    notes: (entry.notes || '').trim(),
    createdAt: entry.createdAt || now,
    updatedAt: now
  };

  if (isDemo) {
    normalized.isDemo = true;
  }

  return normalized;
}

/**
 * Devuelve todos los registros ordenados del más reciente al más antiguo.
 */
export async function getAllLogs() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const request = store.getAll();

    request.onsuccess = () => {
      const logs = request.result || [];
      logs.sort((a, b) => {
        if (a.date !== b.date) return b.date.localeCompare(a.date);
        const timeA = a.startTime || '00:00';
        const timeB = b.startTime || '00:00';
        if (timeA !== timeB) return timeB.localeCompare(timeA);
        return (b.createdAt || 0) - (a.createdAt || 0);
      });
      resolve(logs);
    };
    request.onerror = () => reject(request.error);
  });
}

/**
 * Crea o actualiza un registro en IndexedDB.
 */
export async function saveLog(entry) {
  const normalized = normalizeEntry(entry);
  const db = await openDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const request = store.put(normalized);

    request.onsuccess = () => resolve(normalized);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Inserta varios registros en una sola transacción.
 */
export async function saveLogsBulk(entries, options = {}) {
  const normalizedList = entries.map((entry) => normalizeEntry(entry, options));
  const db = await openDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    for (const item of normalizedList) {
      store.put(item);
    }
    tx.oncomplete = () => resolve(normalizedList.length);
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Elimina un registro por ID.
 */
export async function deleteLog(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const request = store.delete(id);

    request.onsuccess = () => resolve(true);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Elimina únicamente los registros de prueba (Demo), manteniendo intactos los reales.
 * Devuelve el número de registros Demo eliminados.
 */
export async function clearDemoLogs() {
  const logs = await getAllLogs();
  const demoLogs = logs.filter((log) => isDemoLog(log));
  if (demoLogs.length === 0) return 0;

  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    for (const log of demoLogs) {
      store.delete(log.id);
    }
    tx.oncomplete = () => resolve(demoLogs.length);
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Vacía completamente la tabla de horas extras.
 */
export async function clearAllLogs() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const request = store.clear();

    request.onsuccess = () => resolve(true);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Lee los ajustes guardados en localStorage y migra modelos antiguos bloqueados.
 * Nunca expone claves API en texto plano.
 */
export function getSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const parsed = JSON.parse(raw);
    const merged = { ...DEFAULT_SETTINGS, ...parsed };

    // Si había clave antigua en texto plano pendiente de migrar, conservar señal hasta migrar en init()
    const hasLegacyPlainKey = Boolean((parsed.geminiApiKey || '').trim());
    if (hasLegacyPlainKey && !merged.hasEncryptedApiKey) {
      merged.hasEncryptedApiKey = true;
      merged.apiKeyMask = `...${parsed.geminiApiKey.trim().slice(-4)}`;
    }
    delete merged.geminiApiKey;

    if (!parsed.modelMigratedV2 && LEGACY_BLOCKED_MODELS.has(merged.geminiModel)) {
      merged.geminiModel = DEFAULT_SETTINGS.geminiModel;
      merged.modelMigratedV2 = true;
      try {
        const persistCopy = hasLegacyPlainKey
          ? { ...merged, geminiApiKey: parsed.geminiApiKey }
          : merged;
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(persistCopy));
      } catch {
        // Ignorar errores de escritura en almacenamiento restringido
      }
    }

    return merged;
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

/**
 * Guarda los ajustes en localStorage (eliminando siempre cualquier geminiApiKey en claro).
 */
export function saveSettings(partial) {
  const current = getSettings();
  const next = { ...current, ...partial, modelMigratedV2: true };
  delete next.geminiApiKey;
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
  return next;
}

// ==================== BÓVEDA CIFRADA PARA API KEY (Web Crypto AES-GCM) ====================

function hasWebCryptoAes() {
  return typeof globalThis.crypto !== 'undefined' && Boolean(globalThis.crypto.subtle);
}

async function vaultGet(id) {
  if (typeof indexedDB === 'undefined') {
    return memoryVaultFallback.get(id) ?? null;
  }
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(VAULT_STORE_NAME, 'readonly');
    const store = tx.objectStore(VAULT_STORE_NAME);
    const req = store.get(id);
    req.onsuccess = () => resolve(req.result ?? null);
    req.onerror = () => reject(req.error);
  });
}

async function vaultPut(record) {
  if (typeof indexedDB === 'undefined') {
    memoryVaultFallback.set(record.id, record);
    return record;
  }
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(VAULT_STORE_NAME, 'readwrite');
    const store = tx.objectStore(VAULT_STORE_NAME);
    const req = store.put(record);
    req.onsuccess = () => resolve(record);
    req.onerror = () => reject(req.error);
  });
}

async function vaultDelete(id) {
  if (typeof indexedDB === 'undefined') {
    memoryVaultFallback.delete(id);
    return true;
  }
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(VAULT_STORE_NAME, 'readwrite');
    const store = tx.objectStore(VAULT_STORE_NAME);
    const req = store.delete(id);
    req.onsuccess = () => resolve(true);
    req.onerror = () => reject(req.error);
  });
}

async function getOrCreateMasterKey() {
  const existing = await vaultGet(MASTER_KEY_ID);
  if (existing && existing.key) {
    return existing.key;
  }

  const key = await globalThis.crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    false, // No exportable: los scripts no pueden leer los bytes de la clave maestra
    ['encrypt', 'decrypt']
  );

  await vaultPut({
    id: MASTER_KEY_ID,
    key,
    createdAt: Date.now()
  });

  return key;
}

function stripLegacyPlainApiKeyFromLocalStorage() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return '';
    const parsed = JSON.parse(raw);
    const legacyKey = typeof parsed?.geminiApiKey === 'string' ? parsed.geminiApiKey.trim() : '';
    if ('geminiApiKey' in parsed) {
      delete parsed.geminiApiKey;
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(parsed));
    }
    return legacyKey;
  } catch {
    return '';
  }
}

/**
 * Cifra la API Key con AES-GCM de 256 bits y la guarda en IndexedDB (crypto_vault).
 * Borra cualquier copia en texto plano de localStorage.
 */
export async function saveEncryptedApiKey(plainKey) {
  const cleanKey = (plainKey || '').trim();
  if (!cleanKey) {
    return clearEncryptedApiKey();
  }

  const mask = cleanKey.length >= 4 ? `...${cleanKey.slice(-4)}` : '****';

  if (hasWebCryptoAes()) {
    const masterKey = await getOrCreateMasterKey();
    const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
    const encoded = new TextEncoder().encode(cleanKey);
    const cipherBuffer = await globalThis.crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      masterKey,
      encoded
    );

    await vaultPut({
      id: API_KEY_RECORD_ID,
      mode: 'aes-gcm',
      iv: Array.from(iv),
      ciphertext: Array.from(new Uint8Array(cipherBuffer)),
      updatedAt: Date.now()
    });
  } else {
    // Fallback solo si el contexto no es seguro (ej. IP LAN sin HTTPS donde subtle no existe)
    const bytes = Array.from(new TextEncoder().encode(cleanKey)).map((b, i) => b ^ ((i * 31 + 97) & 0xff));
    await vaultPut({
      id: API_KEY_RECORD_ID,
      mode: 'obfuscated',
      ciphertext: bytes,
      updatedAt: Date.now()
    });
  }

  stripLegacyPlainApiKeyFromLocalStorage();
  saveSettings({
    hasEncryptedApiKey: true,
    apiKeyMask: mask
  });

  return { hasEncryptedApiKey: true, apiKeyMask: mask, aesEnabled: hasWebCryptoAes() };
}

/**
 * Desencripta la API Key en memoria justo al ir a usarla.
 * Migra automáticamente cualquier clave antigua guardada en texto plano en localStorage.
 */
export async function getDecryptedApiKey() {
  const legacyKey = stripLegacyPlainApiKeyFromLocalStorage();
  if (legacyKey) {
    await saveEncryptedApiKey(legacyKey);
    return legacyKey;
  }

  const record = await vaultGet(API_KEY_RECORD_ID);
  if (!record || !Array.isArray(record.ciphertext)) {
    return '';
  }

  if (record.mode === 'aes-gcm') {
    if (!hasWebCryptoAes()) return '';
    const masterKey = await getOrCreateMasterKey();
    const iv = new Uint8Array(record.iv || []);
    const data = new Uint8Array(record.ciphertext);
    const plainBuffer = await globalThis.crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      masterKey,
      data
    );
    return new TextDecoder().decode(plainBuffer);
  }

  if (record.mode === 'obfuscated') {
    const bytes = new Uint8Array(record.ciphertext.map((b, i) => b ^ ((i * 31 + 97) & 0xff)));
    return new TextDecoder().decode(bytes);
  }

  return '';
}

/**
 * Elimina por completo la API Key cifrada de la bóveda y de los ajustes.
 */
export async function clearEncryptedApiKey() {
  await vaultDelete(API_KEY_RECORD_ID);
  stripLegacyPlainApiKeyFromLocalStorage();
  saveSettings({
    hasEncryptedApiKey: false,
    apiKeyMask: ''
  });
  return true;
}

/**
 * Indica si existe una API Key configurada (cifrada o pendiente de migrar).
 */
export function hasConfiguredApiKey() {
  const settings = getSettings();
  return Boolean(settings.hasEncryptedApiKey);
}

/**
 * Lee la memoria conversacional del asistente IA guardada en localStorage (máx. 12 turnos).
 */
export function getChatMemory() {
  try {
    const raw = localStorage.getItem(CHAT_MEMORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((m) => m && (m.role === 'user' || m.role === 'model') && typeof m.text === 'string')
      .slice(-MAX_CHAT_MEMORY_MESSAGES);
  } catch {
    return [];
  }
}

/**
 * Persiste los turnos de conversación del chat IA en localStorage (máx. 12 turnos / 24 mensajes).
 */
export function saveChatMemory(turns) {
  if (!Array.isArray(turns)) return [];
  const trimmed = turns
    .filter((m) => m && (m.role === 'user' || m.role === 'model') && typeof m.text === 'string')
    .slice(-MAX_CHAT_MEMORY_MESSAGES);
  try {
    localStorage.setItem(CHAT_MEMORY_KEY, JSON.stringify(trimmed));
  } catch {
    // Si la cuota estuviera llena, recorta a la mitad
    try {
      localStorage.setItem(CHAT_MEMORY_KEY, JSON.stringify(trimmed.slice(-10)));
    } catch {
      // Ignorar
    }
  }
  return trimmed;
}

/**
 * Limpia por completo la memoria conversacional del asistente IA.
 */
export function clearChatMemory() {
  try {
    localStorage.removeItem(CHAT_MEMORY_KEY);
  } catch {
    // Ignorar
  }
}

function formatDateLocal(dateObj) {
  const y = dateObj.getFullYear();
  const m = String(dateObj.getMonth() + 1).padStart(2, '0');
  const d = String(dateObj.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Genera ~36 registros realistas repartidos en los últimos 6 meses (Modo Demo).
 */
export async function seedDemoData() {
  const today = new Date();
  const scenarios = [
    { type: 'normal', start: '18:00', hours: 1.5, rate: 18, note: 'Cierre de facturación mensual' },
    { type: 'normal', start: '18:30', hours: 2.0, rate: 18, note: 'Preparación auditoría interna' },
    { type: 'normal', start: '17:30', hours: 1.0, rate: null, note: 'Compensable por días libres' },
    { type: 'normal', start: '18:00', hours: 2.5, rate: 18, note: 'Entrega urgente de proyecto' },
    { type: 'fin_de_semana', start: '09:30', hours: 4.0, rate: 24, note: 'Inventario de sábado' },
    { type: 'festivo', start: '10:00', hours: 3.5, rate: 28, note: 'Guardia festivo local' },
    { type: 'nocturna', start: '21:30', hours: 2.0, rate: 25, note: 'Despliegue y soporte nocturno' },
    { type: 'normal', start: '18:00', hours: 1.5, rate: 19, note: 'Revisión de incidencias con cliente' },
    { type: 'normal', start: '18:15', hours: 2.0, rate: null, note: 'Banco de horas de descanso' },
    { type: 'fin_de_semana', start: '10:00', hours: 3.0, rate: 24, note: 'Actualización trimestral' },
    { type: 'normal', start: '17:45', hours: 1.25, rate: 18, note: 'Soporte cierre semanal' },
    { type: 'nocturna', start: '22:00', hours: 2.5, rate: 26, note: 'Ventana de mantenimiento' }
  ];

  // 36 días distribuidos en los últimos ~175 días sin repetir fecha
  const usedDates = new Set();
  const entries = [];
  const baseOffsets = [
    1, 3, 6, 10, 14, 19,
    24, 28, 33, 38, 42, 47,
    53, 58, 62, 67, 72, 77,
    83, 88, 93, 98, 104, 109,
    115, 120, 126, 131, 137, 143,
    149, 154, 160, 165, 170, 174
  ];

  baseOffsets.forEach((daysAgo, idx) => {
    const d = new Date(today);
    d.setDate(today.getDate() - daysAgo);
    const scenario = scenarios[idx % scenarios.length];

    // Ajustar coherencia día de semana si es fin_de_semana o normal
    const dayOfWeek = d.getDay(); // 0 dom, 6 sab
    let chosen = { ...scenario };
    if (dayOfWeek === 0 || dayOfWeek === 6) {
      if (chosen.type === 'normal') {
        chosen = { type: 'fin_de_semana', start: '10:00', hours: 3.0, rate: 24, note: 'Soporte de fin de semana' };
      }
    } else if (chosen.type === 'fin_de_semana') {
      chosen = { type: 'normal', start: '18:00', hours: 2.0, rate: 18.5, note: 'Cierre de entregas semanales' };
    }

    const dateStr = formatDateLocal(d);
    if (usedDates.has(dateStr)) return;
    usedDates.add(dateStr);

    entries.push({
      id: `demo-${dateStr}`,
      isDemo: true,
      date: dateStr,
      startTime: chosen.start,
      endTime: addHoursToTime(chosen.start, chosen.hours),
      hours: chosen.hours,
      hourlyRate: chosen.rate,
      type: chosen.type,
      notes: chosen.note
    });
  });

  return saveLogsBulk(entries);
}

/**
 * Escapa un valor para CSV con separador punto y coma (estándar Excel ES).
 */
function csvEscape(value) {
  const str = String(value ?? '');
  if (/[;"\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Genera el contenido CSV con BOM UTF-8 para abrir directamente en Excel.
 */
export function exportToCSV(logs, currency = '€') {
  const headers = [
    'Fecha',
    'Hora Inicio',
    'Hora Fin',
    'Horas Totales',
    `Precio/Hora (${currency})`,
    `Importe Total (${currency})`,
    'Tipo',
    'Notas'
  ];

  const typeLabels = {
    normal: 'Normal',
    fin_de_semana: 'Fin de semana',
    festivo: 'Festivo',
    nocturna: 'Nocturna'
  };

  const rows = logs.map((log) => {
    const hasRate = log.hourlyRate !== null && log.hourlyRate !== undefined;
    const total = hasRate ? (log.hours * log.hourlyRate).toFixed(2) : '';
    return [
      log.date,
      log.startTime || '',
      log.endTime || '',
      Number(log.hours).toFixed(2),
      hasRate ? Number(log.hourlyRate).toFixed(2) : '',
      total,
      typeLabels[log.type] || log.type,
      log.notes || ''
    ]
      .map(csvEscape)
      .join(';');
  });

  return '\uFEFF' + [headers.map(csvEscape).join(';'), ...rows].join('\r\n');
}

/**
 * Crea un backup completo en JSON (nunca incluye claves API ni metadatos de bóveda).
 */
export function exportBackupJSON(logs, settings) {
  const safeSettings = { ...settings };
  delete safeSettings.geminiApiKey;
  delete safeSettings.hasEncryptedApiKey;
  delete safeSettings.apiKeyMask;

  return JSON.stringify(
    {
      app: 'HorasExtrasPWA',
      version: 2,
      exportedAt: new Date().toISOString(),
      settings: safeSettings,
      logs
    },
    null,
    2
  );
}

/**
 * Valida e importa un archivo JSON de copia de seguridad.
 */
export async function importBackupJSON(jsonString, { replaceExisting = false } = {}) {
  let payload;
  try {
    payload = JSON.parse(jsonString);
  } catch {
    throw new Error('El archivo seleccionado no es un JSON válido.');
  }

  const incomingLogs = Array.isArray(payload) ? payload : payload?.logs;
  if (!Array.isArray(incomingLogs)) {
    throw new Error('El archivo de copia no contiene una lista válida de registros.');
  }

  if (replaceExisting) {
    await clearAllLogs();
  }

  const count = await saveLogsBulk(incomingLogs, { allowAutoEndTime: true });

  if (payload?.settings && typeof payload.settings === 'object') {
    const current = getSettings();
    const incomingSettings = { ...payload.settings };
    delete incomingSettings.geminiApiKey;
    delete incomingSettings.hasEncryptedApiKey;
    delete incomingSettings.apiKeyMask;

    saveSettings({
      ...current,
      ...incomingSettings
    });
  }

  return count;
}
