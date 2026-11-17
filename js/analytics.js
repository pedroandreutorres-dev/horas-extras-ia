const MONTH_NAMES_ES = [
  'Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun',
  'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'
];

export const WEEKDAY_NAMES_ES = [
  'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'
];

const WEEKDAY_ALIAS_MAP = new Map([
  ['lunes', 0], ['lun', 0], ['0', 0],
  ['martes', 1], ['mar', 1], ['1', 1],
  ['miercoles', 2], ['miércoles', 2], ['mie', 2], ['mié', 2], ['2', 2],
  ['jueves', 3], ['jue', 3], ['3', 3],
  ['viernes', 4], ['vie', 4], ['4', 4],
  ['sabado', 5], ['sábado', 5], ['sab', 5], ['sáb', 5], ['5', 5],
  ['domingo', 6], ['dom', 6], ['6', 6]
]);

export const TYPE_LABELS = {
  normal: 'Normal',
  fin_de_semana: 'Fin de semana',
  festivo: 'Festivo',
  nocturna: 'Nocturna'
};

const TYPE_ALIAS_MAP = new Map([
  ['normal', 'normal'],
  ['fin_de_semana', 'fin_de_semana'],
  ['fin de semana', 'fin_de_semana'],
  ['findesemana', 'fin_de_semana'],
  ['festivo', 'festivo'],
  ['nocturna', 'nocturna'],
  ['nocturno', 'nocturna']
]);

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

function toLocalDateObj(refDate = new Date()) {
  if (typeof refDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(refDate)) {
    const [y, m, d] = refDate.split('-').map(Number);
    return new Date(y, m - 1, d);
  }
  const d = refDate instanceof Date ? refDate : new Date(refDate);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function formatLocalISO(dateObj) {
  const y = dateObj.getFullYear();
  const m = String(dateObj.getMonth() + 1).padStart(2, '0');
  const d = String(dateObj.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Devuelve índice de día de la semana: 0 (Lunes) .. 6 (Domingo).
 */
export function getWeekdayIndex(isoOrDate) {
  const dt = toLocalDateObj(isoOrDate);
  const jsDay = dt.getDay(); // 0 dom .. 6 sab
  return jsDay === 0 ? 6 : jsDay - 1;
}

export function getWeekdayName(isoOrDate) {
  return WEEKDAY_NAMES_ES[getWeekdayIndex(isoOrDate)] || '';
}

/**
 * Devuelve los límites locales (Lunes..Domingo) de la semana a la que pertenece refDate.
 */
export function getWeekBoundsLocal(refDate = new Date()) {
  const dt = toLocalDateObj(refDate);
  const offsetFromMonday = getWeekdayIndex(dt);
  const start = new Date(dt.getFullYear(), dt.getMonth(), dt.getDate() - offsetFromMonday);
  const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6);
  return {
    startDate: formatLocalISO(start),
    endDate: formatLocalISO(end)
  };
}

function getMonthBoundsLocal(refDate = new Date()) {
  const dt = toLocalDateObj(refDate);
  const start = new Date(dt.getFullYear(), dt.getMonth(), 1);
  const end = new Date(dt.getFullYear(), dt.getMonth() + 1, 0);
  const key = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`;
  return {
    key,
    label: formatMonthLabel(key),
    startDate: formatLocalISO(start),
    endDate: formatLocalISO(end)
  };
}

/**
 * Genera el contexto de calendario local completo (sin desfases UTC).
 */
export function getCalendarContext(refDate = new Date()) {
  const dt = toLocalDateObj(refDate);
  const prevWeekRef = new Date(dt.getFullYear(), dt.getMonth(), dt.getDate() - 7);
  const prevMonthRef = new Date(dt.getFullYear(), dt.getMonth() - 1, 1);

  return {
    today: formatLocalISO(dt),
    weekday: getWeekdayName(dt),
    currentWeek: getWeekBoundsLocal(dt),
    previousWeek: getWeekBoundsLocal(prevWeekRef),
    currentMonth: getMonthBoundsLocal(dt),
    previousMonth: getMonthBoundsLocal(prevMonthRef),
    currentYear: String(dt.getFullYear())
  };
}

function getCurrentMonthKey(refDate = new Date()) {
  const dt = toLocalDateObj(refDate);
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, '0');
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
 * Filtra registros por rango inclusivo de fechas YYYY-MM-DD.
 */
export function filterLogsByDateRange(logs, startDate = '', endDate = '') {
  if (!Array.isArray(logs) || logs.length === 0) return [];
  return logs.filter((l) => {
    if (!l?.date) return false;
    if (startDate && l.date < startDate) return false;
    if (endDate && l.date > endDate) return false;
    return true;
  });
}

/**
 * Filtra los registros según periodo: "week", "prevWeek", "month", "3months", "year", "all", o "YYYY-MM".
 */
export function filterLogsByPeriod(logs, period = 'all', customMonth = '', refDate = new Date()) {
  if (!Array.isArray(logs) || logs.length === 0) return [];
  if (period === 'all') return [...logs];

  const now = toLocalDateObj(refDate);
  const currentMonthKey = getCurrentMonthKey(now);

  if (customMonth && /^\d{4}-\d{2}$/.test(customMonth)) {
    return logs.filter((l) => l.date.startsWith(customMonth));
  }

  if (/^\d{4}-\d{2}$/.test(period)) {
    return logs.filter((l) => l.date.startsWith(period));
  }

  if (period === 'week') {
    const { startDate, endDate } = getWeekBoundsLocal(now);
    return filterLogsByDateRange(logs, startDate, endDate);
  }

  if (period === 'prevWeek') {
    const prevRef = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7);
    const { startDate, endDate } = getWeekBoundsLocal(prevRef);
    return filterLogsByDateRange(logs, startDate, endDate);
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
  const labels = [...WEEKDAY_NAMES_ES];
  const hours = Array(7).fill(0);
  const earnings = Array(7).fill(0);
  const counts = Array(7).fill(0);

  for (const log of logs) {
    if (!log.date) continue;
    const idx = getWeekdayIndex(log.date);

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

function normalizeTypeFilters(types) {
  if (!Array.isArray(types) || types.length === 0) return null;
  const set = new Set();
  for (const t of types) {
    const key = TYPE_ALIAS_MAP.get(String(t || '').trim().toLowerCase());
    if (key) set.add(key);
  }
  return set.size > 0 ? set : null;
}

function normalizeWeekdayFilters(weekdays) {
  if (!Array.isArray(weekdays) || weekdays.length === 0) return null;
  const set = new Set();
  for (const w of weekdays) {
    const idx = WEEKDAY_ALIAS_MAP.get(String(w ?? '').trim().toLowerCase());
    if (idx !== undefined) set.add(idx);
  }
  return set.size > 0 ? set : null;
}

function formatShortDayMonth(isoDate) {
  const [, m, d] = isoDate.split('-');
  return `${d}/${m}`;
}

function computeExtendedStats(logs) {
  const base = computeKPIs(logs);
  if (logs.length === 0) {
    return {
      ...base,
      avgHoursPerSession: 0,
      medianHours: 0,
      minHours: 0,
      maxHours: 0,
      maxSession: null,
      busiestDay: null
    };
  }

  const sortedHours = logs.map((l) => Number(l.hours) || 0).sort((a, b) => a - b);
  const mid = Math.floor(sortedHours.length / 2);
  const medianHours = sortedHours.length % 2 === 0
    ? (sortedHours[mid - 1] + sortedHours[mid]) / 2
    : sortedHours[mid];

  let maxSessionLog = logs[0];
  const dayTotals = new Map();

  for (const log of logs) {
    if ((Number(log.hours) || 0) > (Number(maxSessionLog.hours) || 0)) {
      maxSessionLog = log;
    }
    if (log.date) {
      const prev = dayTotals.get(log.date) || { date: log.date, totalHours: 0, sessions: 0 };
      prev.totalHours += Number(log.hours) || 0;
      prev.sessions += 1;
      dayTotals.set(log.date, prev);
    }
  }

  let busiestDay = null;
  for (const item of dayTotals.values()) {
    if (!busiestDay || item.totalHours > busiestDay.totalHours) {
      busiestDay = item;
    }
  }

  return {
    ...base,
    avgHoursPerSession: round2(base.totalHours / logs.length),
    medianHours: round2(medianHours),
    minHours: round2(sortedHours[0]),
    maxHours: round2(sortedHours[sortedHours.length - 1]),
    maxSession: {
      date: maxSessionLog.date,
      weekday: getWeekdayName(maxSessionLog.date),
      startTime: maxSessionLog.startTime || '',
      endTime: maxSessionLog.endTime || '',
      hours: Number(maxSessionLog.hours) || 0,
      type: TYPE_LABELS[maxSessionLog.type] || maxSessionLog.type,
      notes: maxSessionLog.notes || ''
    },
    busiestDay: busiestDay
      ? {
          date: busiestDay.date,
          weekday: getWeekdayName(busiestDay.date),
          totalHours: round2(busiestDay.totalHours),
          sessions: busiestDay.sessions
        }
      : null
  };
}

function getGroupDescriptor(log, groupBy, currency = '€') {
  switch (groupBy) {
    case 'day':
      return {
        key: log.date,
        label: `${formatShortDayMonth(log.date)} (${getWeekdayName(log.date).slice(0, 3)})`,
        sortKey: log.date
      };
    case 'week': {
      const { startDate, endDate } = getWeekBoundsLocal(log.date);
      return {
        key: `${startDate}..${endDate}`,
        label: `${formatShortDayMonth(startDate)}-${formatShortDayMonth(endDate)}`,
        sortKey: startDate,
        startDate,
        endDate
      };
    }
    case 'month': {
      const monthKey = (log.date || '').slice(0, 7);
      return {
        key: monthKey,
        label: formatMonthLabel(monthKey),
        sortKey: monthKey
      };
    }
    case 'weekday': {
      const idx = getWeekdayIndex(log.date);
      return {
        key: String(idx),
        label: WEEKDAY_NAMES_ES[idx],
        sortKey: String(idx)
      };
    }
    case 'type': {
      const typeKey = TYPE_LABELS[log.type] ? log.type : 'normal';
      return {
        key: typeKey,
        label: TYPE_LABELS[typeKey],
        sortKey: typeKey
      };
    }
    case 'rate': {
      const hasRate = log.hourlyRate !== null && log.hourlyRate !== undefined && Number(log.hourlyRate) > 0;
      const numRate = hasRate ? Number(log.hourlyRate) : 0;
      return {
        key: hasRate ? String(numRate) : 'unpaid',
        label: hasRate ? `${numRate} ${currency}/h` : 'Sin tarifa',
        sortKey: hasRate ? String(numRate).padStart(8, '0') : 'zzzzzzzz'
      };
    }
    default:
      return null;
  }
}

function groupLogsBy(logs, groupBy, currency = '€') {
  if (!groupBy || groupBy === 'none') return [];
  const buckets = new Map();

  for (const log of logs) {
    if (!log?.date) continue;
    const desc = getGroupDescriptor(log, groupBy, currency);
    if (!desc) continue;
    if (!buckets.has(desc.key)) {
      buckets.set(desc.key, { ...desc, items: [] });
    }
    buckets.get(desc.key).items.push(log);
  }

  return Array.from(buckets.values())
    .sort((a, b) => a.sortKey.localeCompare(b.sortKey))
    .map(({ key, label, startDate, endDate, items }) => {
      const kpis = computeKPIs(items);
      const row = { key, label, ...kpis };
      if (startDate) row.startDate = startDate;
      if (endDate) row.endDate = endDate;
      return row;
    });
}

/**
 * Motor de consultas determinista y generalista sobre toda la base de datos.
 * Permite a Gemini filtrar, agrupar y calcular estadísticos exactos sin sumar filas a mano.
 */
export function queryOvertimeLogs(logs, params = {}, settings = {}) {
  const currency = settings.currency || '€';
  const list = Array.isArray(logs) ? logs : [];

  const startDate = typeof params.startDate === 'string' ? params.startDate.trim() : '';
  const endDate = typeof params.endDate === 'string' ? params.endDate.trim() : '';
  const typeSet = normalizeTypeFilters(params.types);
  const weekdaySet = normalizeWeekdayFilters(params.weekdays);
  const paymentStatus = ['paid', 'unpaid'].includes(params.paymentStatus) ? params.paymentStatus : 'all';
  const minHours = Number.isFinite(Number(params.minHours)) && params.minHours !== '' && params.minHours !== null
    ? Number(params.minHours)
    : null;
  const maxHours = Number.isFinite(Number(params.maxHours)) && params.maxHours !== '' && params.maxHours !== null
    ? Number(params.maxHours)
    : null;
  const noteQuery = typeof params.noteContains === 'string' ? params.noteContains.trim().toLowerCase() : '';

  const filtered = list.filter((log) => {
    if (!log?.date) return false;
    if (startDate && log.date < startDate) return false;
    if (endDate && log.date > endDate) return false;
    if (typeSet && !typeSet.has(log.type || 'normal')) return false;
    if (weekdaySet && !weekdaySet.has(getWeekdayIndex(log.date))) return false;

    const rate = log.hourlyRate !== null && log.hourlyRate !== undefined ? Number(log.hourlyRate) : null;
    const isPaid = rate !== null && rate > 0;
    if (paymentStatus === 'paid' && !isPaid) return false;
    if (paymentStatus === 'unpaid' && isPaid) return false;

    const hours = Number(log.hours) || 0;
    if (minHours !== null && hours < minHours) return false;
    if (maxHours !== null && hours > maxHours) return false;

    if (noteQuery) {
      const notes = (log.notes || '').toLowerCase();
      if (!notes.includes(noteQuery)) return false;
    }

    return true;
  });

  const validGroupBys = new Set(['none', 'day', 'week', 'month', 'weekday', 'type', 'rate']);
  const groupBy = validGroupBys.has(params.groupBy) ? params.groupBy : 'none';
  const groups = groupLogsBy(filtered, groupBy, currency);
  const summary = computeExtendedStats(filtered);

  const includeRecords = Boolean(params.includeRecords);
  let records = [];
  if (includeRecords && filtered.length > 0) {
    const sortBy = params.sortBy || 'date_desc';
    const sorted = [...filtered].sort((a, b) => {
      if (sortBy === 'date_asc') return a.date.localeCompare(b.date);
      if (sortBy === 'hours_desc') return (Number(b.hours) || 0) - (Number(a.hours) || 0);
      if (sortBy === 'earnings_desc') {
        const ea = (Number(a.hours) || 0) * (Number(a.hourlyRate) || 0);
        const eb = (Number(b.hours) || 0) * (Number(b.hourlyRate) || 0);
        return eb - ea;
      }
      return b.date.localeCompare(a.date);
    });

    const limit = Math.min(Math.max(Number.parseInt(params.limit, 10) || 40, 1), 80);
    records = sorted.slice(0, limit).map((l) => {
      const hasRate = l.hourlyRate !== null && l.hourlyRate !== undefined && Number(l.hourlyRate) > 0;
      return {
        date: l.date,
        weekday: getWeekdayName(l.date),
        startTime: l.startTime || '',
        endTime: l.endTime || '',
        hours: Number(l.hours) || 0,
        hourlyRate: hasRate ? Number(l.hourlyRate) : null,
        totalAmount: hasRate ? round2(Number(l.hours) * Number(l.hourlyRate)) : null,
        type: TYPE_LABELS[l.type] || l.type,
        notes: l.notes || ''
      };
    });
  }

  return {
    currency,
    appliedFilters: {
      startDate: startDate || null,
      endDate: endDate || null,
      types: typeSet ? Array.from(typeSet) : null,
      weekdays: weekdaySet ? Array.from(weekdaySet).map((idx) => WEEKDAY_NAMES_ES[idx]) : null,
      paymentStatus,
      minHours,
      maxHours,
      noteContains: noteQuery || null
    },
    groupBy,
    totalMatchingRecords: filtered.length,
    summary,
    groups,
    ...(includeRecords ? { records, truncated: filtered.length > records.length } : {})
  };
}

/**
 * Construye el contexto compacto de calendario y cubo de resúmenes para Gemini.
 * Las consultas complejas o rangos arbitrarios se delegan a queryOvertimeLogs().
 */
export function buildLLMContext(logs, settings = {}, refDate = new Date()) {
  const currency = settings.currency || '€';
  const calendar = getCalendarContext(refDate);

  const currentWeekLogs = filterLogsByPeriod(logs, 'week', '', refDate);
  const previousWeekLogs = filterLogsByPeriod(logs, 'prevWeek', '', refDate);
  const currentMonthLogs = filterLogsByPeriod(logs, 'month', '', refDate);
  const previousMonthLogs = filterLogsByPeriod(logs, calendar.previousMonth.key, '', refDate);

  const byWeek = groupLogsBy(logs, 'week', currency).slice(-12);
  const byMonth = groupLogsBy(logs, 'month', currency);
  const byWeekday = groupLogsBy(logs, 'weekday', currency);
  const byType = groupLogsBy(logs, 'type', currency);

  return {
    referenceDate: calendar.today,
    calendar,
    currency,
    monthlyTargetHours: Number(settings.monthlyTargetHours) || 20,
    totalRecordsInDatabase: logs.length,
    summaries: {
      global: computeKPIs(logs),
      currentWeek: {
        ...calendar.currentWeek,
        ...computeKPIs(currentWeekLogs)
      },
      previousWeek: {
        ...calendar.previousWeek,
        ...computeKPIs(previousWeekLogs)
      },
      currentMonth: {
        month: calendar.currentMonth.key,
        ...computeKPIs(currentMonthLogs)
      },
      previousMonth: {
        month: calendar.previousMonth.key,
        ...computeKPIs(previousMonthLogs)
      }
    },
    aggregates: {
      byWeek,
      byMonth,
      byWeekday,
      byType
    }
  };
}
