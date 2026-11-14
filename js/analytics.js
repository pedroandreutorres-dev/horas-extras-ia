const MONTH_NAMES_ES = [
  'Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun',
  'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'
];

export const TYPE_LABELS = {
  normal: 'Normal',
  fin_de_semana: 'Fin de semana',
  festivo: 'Festivo',
  nocturna: 'Nocturna'
};

function round2(num) {
  return Math.round((num + Number.EPSILON) * 100) / 100;
}

const TIME_RX = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function isValidTimeStr(timeStr) {
  return typeof timeStr === 'string' && TIME_RX.test(timeStr.trim());
}

function timeToMinutes(timeStr) {
  const [hh, mm] = timeStr.trim().split(':').map(Number);
  return hh * 60 + mm;
}

function minutesToTime(totalMinutes) {
  const day = 24 * 60;
  const normalized = ((Math.round(totalMinutes) % day) + day) % day;
  const hh = String(Math.floor(normalized / 60)).padStart(2, '0');
  const mm = String(normalized % 60).padStart(2, '0');
  return `${hh}:${mm}`;
}

/**
 * Calcula las horas entre hora de inicio y fin (soporta cruce de medianoche).
 */
export function computeHoursBetween(startTime, endTime) {
  if (!isValidTimeStr(startTime) || !isValidTimeStr(endTime)) return null;
  let diffMin = timeToMinutes(endTime) - timeToMinutes(startTime);
  if (diffMin <= 0) {
    diffMin += 24 * 60;
  }
  const hours = round2(diffMin / 60);
  return hours > 0 && hours <= 24 ? hours : null;
}

/**
 * Suma horas a una hora de inicio (HH:MM) y devuelve la hora de fin (HH:MM).
 */
export function addHoursToTime(startTime, hours) {
  const h = Number.parseFloat(hours);
  if (!isValidTimeStr(startTime) || !Number.isFinite(h) || h <= 0 || h > 24) return '';
  return minutesToTime(timeToMinutes(startTime) + h * 60);
}

/**
 * Resta horas a una hora de fin (HH:MM) y devuelve la hora de inicio (HH:MM).
 */
export function subtractHoursFromTime(endTime, hours) {
  const h = Number.parseFloat(hours);
  if (!isValidTimeStr(endTime) || !Number.isFinite(h) || h <= 0 || h > 24) return '';
  return minutesToTime(timeToMinutes(endTime) - h * 60);
}

function getCurrentMonthKey() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

export function formatMonthLabel(monthKey) {
  if (!monthKey || !/^\d{4}-\d{2}$/.test(monthKey)) return monthKey;
  const [year, month] = monthKey.split('-');
  const idx = Number.parseInt(month, 10) - 1;
  return `${MONTH_NAMES_ES[idx] || month} ${year.slice(2)}`;
}

/**
 * Devuelve la lista de meses únicos YYYY-MM presentes en los registros (más reciente primero).
 */
export function getAvailableMonths(logs) {
  const set = new Set();
  for (const log of logs) {
    if (log.date && log.date.length >= 7) {
      set.add(log.date.slice(0, 7));
    }
  }
  return Array.from(set).sort((a, b) => b.localeCompare(a));
}

/**
 * Filtra los registros según periodo: "month", "3months", "year", "all", o "YYYY-MM".
 */
export function filterLogsByPeriod(logs, period = 'all', customMonth = '') {
  if (!Array.isArray(logs) || logs.length === 0) return [];
  if (period === 'all') return [...logs];

  const now = new Date();
  const currentMonthKey = getCurrentMonthKey();

  if (customMonth && /^\d{4}-\d{2}$/.test(customMonth)) {
    return logs.filter((l) => l.date.startsWith(customMonth));
  }

  if (/^\d{4}-\d{2}$/.test(period)) {
    return logs.filter((l) => l.date.startsWith(period));
  }

  if (period === 'month') {
    return logs.filter((l) => l.date.startsWith(currentMonthKey));
  }

  if (period === '3months') {
    const start = new Date(now.getFullYear(), now.getMonth() - 2, 1);
    const startStr = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}-01`;
    return logs.filter((l) => l.date >= startStr);
  }

  if (period === 'year') {
    const yearPrefix = `${now.getFullYear()}-`;
    return logs.filter((l) => l.date.startsWith(yearPrefix));
  }

  return [...logs];
}

/**
 * Calcula los KPIs exactos sobre un conjunto de registros.
 */
export function computeKPIs(logs) {
  let totalHours = 0;
  let totalEarnings = 0;
  let paidHours = 0;
  let unpaidHours = 0;
  const uniqueDays = new Set();

  for (const log of logs) {
    const hours = Number(log.hours) || 0;
    totalHours += hours;
    if (log.date) uniqueDays.add(log.date);

    const rate = log.hourlyRate !== null && log.hourlyRate !== undefined ? Number(log.hourlyRate) : null;
    if (rate !== null && rate > 0) {
      paidHours += hours;
      totalEarnings += hours * rate;
    } else {
      unpaidHours += hours;
    }
  }

  const avgHourlyRate = paidHours > 0 ? totalEarnings / paidHours : 0;

  return {
    totalHours: round2(totalHours),
    totalEarnings: round2(totalEarnings),
    paidHours: round2(paidHours),
    unpaidHours: round2(unpaidHours),
    avgHourlyRate: round2(avgHourlyRate),
    totalDays: uniqueDays.size,
    totalSessions: logs.length
  };
}

/**
 * Agrupa horas, importe y sesiones por mes (orden cronológico ascendente).
 */
export function computeMonthlySeries(logs) {
  const buckets = new Map();

  for (const log of logs) {
    const key = (log.date || '').slice(0, 7);
    if (!key) continue;

    if (!buckets.has(key)) {
      buckets.set(key, { hours: 0, earnings: 0, paidHours: 0, count: 0 });
    }
    const bucket = buckets.get(key);
    const hours = Number(log.hours) || 0;
    const rate = log.hourlyRate !== null && log.hourlyRate !== undefined ? Number(log.hourlyRate) : null;

    bucket.hours += hours;
    bucket.count += 1;
    if (rate !== null && rate > 0) {
      bucket.paidHours += hours;
      bucket.earnings += hours * rate;
    }
  }

  const sortedKeys = Array.from(buckets.keys()).sort((a, b) => a.localeCompare(b));

  return {
    keys: sortedKeys,
    labels: sortedKeys.map(formatMonthLabel),
    hours: sortedKeys.map((k) => round2(buckets.get(k).hours)),
    earnings: sortedKeys.map((k) => round2(buckets.get(k).earnings)),
    counts: sortedKeys.map((k) => buckets.get(k).count),
    avgRates: sortedKeys.map((k) => {
      const b = buckets.get(k);
      return b.paidHours > 0 ? round2(b.earnings / b.paidHours) : 0;
    })
  };
}

/**
 * Agrupa de Lunes (índice 0) a Domingo (índice 6).
 */
export function computeWeekdaySeries(logs) {
  const labels = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
  const hours = Array(7).fill(0);
  const earnings = Array(7).fill(0);
  const counts = Array(7).fill(0);

  for (const log of logs) {
    if (!log.date) continue;
    const [y, m, d] = log.date.split('-').map(Number);
    const jsDay = new Date(y, m - 1, d).getDay(); // 0 dom .. 6 sab
    const idx = jsDay === 0 ? 6 : jsDay - 1; // 0 lun .. 6 dom

    const h = Number(log.hours) || 0;
    const rate = log.hourlyRate !== null && log.hourlyRate !== undefined ? Number(log.hourlyRate) : null;
    hours[idx] += h;
    counts[idx] += 1;
    if (rate !== null && rate > 0) {
      earnings[idx] += h * rate;
    }
  }

  return {
    labels,
    hours: hours.map(round2),
    earnings: earnings.map(round2),
    counts
  };
}

/**
 * Agrupa por tipo de hora extra.
 */
export function computeTypeSeries(logs) {
  const keys = ['normal', 'fin_de_semana', 'festivo', 'nocturna'];
  const map = new Map(keys.map((k) => [k, { hours: 0, earnings: 0, count: 0 }]));

  for (const log of logs) {
    const key = map.has(log.type) ? log.type : 'normal';
    const bucket = map.get(key);
    const h = Number(log.hours) || 0;
    const rate = log.hourlyRate !== null && log.hourlyRate !== undefined ? Number(log.hourlyRate) : null;

    bucket.hours += h;
    bucket.count += 1;
    if (rate !== null && rate > 0) {
      bucket.earnings += h * rate;
    }
  }

  return {
    keys,
    labels: keys.map((k) => TYPE_LABELS[k]),
    hours: keys.map((k) => round2(map.get(k).hours)),
    earnings: keys.map((k) => round2(map.get(k).earnings)),
    counts: keys.map((k) => map.get(k).count)
  };
}

/**
 * Serie acumulada cronológica para ver la progresión total de horas e ingresos.
 */
export function computeCumulativeSeries(logs) {
  const sorted = [...logs].sort((a, b) => a.date.localeCompare(b.date));
  const dailyMap = new Map();

  for (const log of sorted) {
    if (!log.date) continue;
    if (!dailyMap.has(log.date)) {
      dailyMap.set(log.date, { hours: 0, earnings: 0 });
    }
    const item = dailyMap.get(log.date);
    const h = Number(log.hours) || 0;
    const rate = log.hourlyRate !== null && log.hourlyRate !== undefined ? Number(log.hourlyRate) : null;
    item.hours += h;
    if (rate !== null && rate > 0) {
      item.earnings += h * rate;
    }
  }

  const dates = Array.from(dailyMap.keys()).sort((a, b) => a.localeCompare(b));
  let accHours = 0;
  let accEarnings = 0;

  const labels = [];
  const cumulativeHours = [];
  const cumulativeEarnings = [];

  for (const d of dates) {
    const item = dailyMap.get(d);
    accHours += item.hours;
    accEarnings += item.earnings;
    const [, m, day] = d.split('-');
    labels.push(`${day}/${m}`);
    cumulativeHours.push(round2(accHours));
    cumulativeEarnings.push(round2(accEarnings));
  }

  return {
    dates,
    labels,
    cumulativeHours,
    cumulativeEarnings
  };
}

/**
 * Construye el contexto estadístico exacto y los registros recientes para Gemini.
 * Evita que el LLM tenga que sumar filas a mano.
 */
export function buildLLMContext(logs, settings = {}) {
  const currency = settings.currency || '€';
  const currentMonthKey = getCurrentMonthKey();
  const currentMonthLogs = filterLogsByPeriod(logs, 'month');

  const globalKPIs = computeKPIs(logs);
  const currentMonthKPIs = computeKPIs(currentMonthLogs);
  const monthly = computeMonthlySeries(logs);
  const weekday = computeWeekdaySeries(logs);
  const byType = computeTypeSeries(logs);

  const monthlyTable = monthly.keys.map((key, idx) => ({
    month: key,
    label: monthly.labels[idx],
    sessions: monthly.counts[idx],
    totalHours: monthly.hours[idx],
    totalEarnings: monthly.earnings[idx],
    avgRate: monthly.avgRates[idx]
  }));

  const weekdayTable = weekday.labels.map((day, idx) => ({
    day,
    sessions: weekday.counts[idx],
    totalHours: weekday.hours[idx],
    totalEarnings: weekday.earnings[idx]
  }));

  const typeTable = byType.keys.map((key, idx) => ({
    type: byType.labels[idx],
    sessions: byType.counts[idx],
    totalHours: byType.hours[idx],
    totalEarnings: byType.earnings[idx]
  }));

  // Registros detallados (máx 120 más recientes para mantener contexto ligero y rápido)
  const recentRecords = logs.slice(0, 120).map((l) => {
    const hasRate = l.hourlyRate !== null && l.hourlyRate !== undefined;
    return {
      date: l.date,
      startTime: l.startTime || '',
      endTime: l.endTime || '',
      hours: l.hours,
      hourlyRate: hasRate ? l.hourlyRate : null,
      totalAmount: hasRate ? round2(l.hours * l.hourlyRate) : null,
      type: TYPE_LABELS[l.type] || l.type,
      notes: l.notes || ''
    };
  });

  return {
    referenceDate: new Date().toISOString().slice(0, 10),
    currentMonth: currentMonthKey,
    currency,
    monthlyTargetHours: Number(settings.monthlyTargetHours) || 20,
    totalRecordsInDatabase: logs.length,
    globalKPIs,
    currentMonthKPIs,
    aggregates: {
      byMonth: monthlyTable,
      byWeekday: weekdayTable,
      byType: typeTable
    },
    recentRecordsIncluded: recentRecords.length,
    records: recentRecords
  };
}
