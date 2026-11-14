import {
  computeMonthlySeries,
  computeWeekdaySeries,
  computeTypeSeries,
  computeCumulativeSeries
} from './analytics.js';

const dashboardInstances = new Map();

const PALETTE = [
  '#38bdf8', // Sky
  '#818cf8', // Indigo
  '#34d399', // Emerald
  '#fbbf24', // Amber
  '#f472b6', // Pink
  '#fb7185', // Rose
  '#a78bfa'  // Violet
];

function getThemeColors(theme = 'dark') {
  const isLight = theme === 'light';
  return {
    text: isLight ? '#1e293b' : '#e2e8f0',
    muted: isLight ? '#64748b' : '#94a3b8',
    grid: isLight ? 'rgba(15, 23, 42, 0.08)' : 'rgba(148, 163, 184, 0.14)',
    tooltipBg: isLight ? '#ffffff' : '#0f172a',
    tooltipBorder: isLight ? '#cbd5e1' : '#334155',
    surface: isLight ? '#ffffff' : '#1e293b'
  };
}

function destroyChart(id) {
  if (dashboardInstances.has(id)) {
    dashboardInstances.get(id).destroy();
    dashboardInstances.delete(id);
  }
}

function getChartLib() {
  if (typeof window === 'undefined' || typeof window.Chart === 'undefined') {
    return null;
  }
  return window.Chart;
}

/**
 * Renderiza o actualiza las 4 gráficas del Dashboard.
 */
export function updateDashboardCharts(logs, theme = 'dark', currency = '€') {
  const Chart = getChartLib();
  if (!Chart) return;

  const colors = getThemeColors(theme);
  const commonTooltip = {
    backgroundColor: colors.tooltipBg,
    titleColor: colors.text,
    bodyColor: colors.text,
    borderColor: colors.tooltipBorder,
    borderWidth: 1,
    padding: 10,
    cornerRadius: 10
  };

  // 1. Gráfica Mensual Mixta (Barras Horas + Línea Ingresos)
  const monthlyCanvas = document.getElementById('chart-monthly');
  if (monthlyCanvas) {
    destroyChart('chart-monthly');
    const monthly = computeMonthlySeries(logs);
    const hasEarnings = monthly.earnings.some((v) => v > 0);

    const datasets = [
      {
        type: 'bar',
        label: 'Horas',
        data: monthly.hours,
        backgroundColor: 'rgba(56, 189, 248, 0.78)',
        borderColor: '#38bdf8',
        borderWidth: 1,
        borderRadius: 6,
        yAxisID: 'y'
      }
    ];

    if (hasEarnings) {
      datasets.push({
        type: 'line',
        label: `Importe (${currency})`,
        data: monthly.earnings,
        borderColor: '#34d399',
        backgroundColor: 'rgba(52, 211, 153, 0.18)',
        borderWidth: 2.5,
        pointRadius: 4,
        pointBackgroundColor: '#34d399',
        tension: 0.3,
        yAxisID: 'y1'
      });
    }

    const scales = {
      x: {
        ticks: { color: colors.muted, font: { size: 11 } },
        grid: { display: false }
      },
      y: {
        position: 'left',
        beginAtZero: true,
        title: { display: true, text: 'Horas', color: colors.muted, font: { size: 11 } },
        ticks: { color: colors.muted, font: { size: 11 } },
        grid: { color: colors.grid }
      }
    };

    if (hasEarnings) {
      scales.y1 = {
        position: 'right',
        beginAtZero: true,
        title: { display: true, text: currency, color: '#34d399', font: { size: 11 } },
        ticks: { color: '#34d399', font: { size: 11 } },
        grid: { drawOnChartArea: false }
      };
    }

    dashboardInstances.set(
      'chart-monthly',
      new Chart(monthlyCanvas, {
        type: 'bar',
        data: { labels: monthly.labels, datasets },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          interaction: { mode: 'index', intersect: false },
          plugins: {
            legend: { labels: { color: colors.text, boxWidth: 12 } },
            tooltip: commonTooltip
          },
          scales
        }
      })
    );
  }

  // 2. Patrón por Día de la Semana
  const weekdayCanvas = document.getElementById('chart-weekday');
  if (weekdayCanvas) {
    destroyChart('chart-weekday');
    const weekday = computeWeekdaySeries(logs);

    dashboardInstances.set(
      'chart-weekday',
      new Chart(weekdayCanvas, {
        type: 'bar',
        data: {
          labels: weekday.labels.map((d) => d.slice(0, 3)),
          datasets: [
            {
              label: 'Horas',
              data: weekday.hours,
              backgroundColor: [
                'rgba(56, 189, 248, 0.78)',
                'rgba(96, 165, 250, 0.78)',
                'rgba(129, 140, 248, 0.78)',
                'rgba(167, 139, 250, 0.78)',
                'rgba(52, 211, 153, 0.78)',
                'rgba(251, 191, 36, 0.85)',
                'rgba(251, 113, 133, 0.85)'
              ],
              borderRadius: 6
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: {
              ...commonTooltip,
              callbacks: {
                title: (items) => weekday.labels[items[0].dataIndex],
                afterLabel: (ctx) => {
                  const idx = ctx.dataIndex;
                  const earned = weekday.earnings[idx];
                  const sessions = weekday.counts[idx];
                  const lines = [`Sesiones: ${sessions}`];
                  if (earned > 0) lines.push(`Importe: ${earned.toFixed(2)} ${currency}`);
                  return lines;
                }
              }
            }
          },
          scales: {
            x: { ticks: { color: colors.muted }, grid: { display: false } },
            y: { beginAtZero: true, ticks: { color: colors.muted }, grid: { color: colors.grid } }
          }
        }
      })
    );
  }

  // 3. Desglose por Tipo de Hora (Doughnut)
  const typeCanvas = document.getElementById('chart-type');
  if (typeCanvas) {
    destroyChart('chart-type');
    const byType = computeTypeSeries(logs);
    const nonZeroIndexes = byType.hours
      .map((h, i) => (h > 0 ? i : -1))
      .filter((i) => i !== -1);

    const labels = nonZeroIndexes.length
      ? nonZeroIndexes.map((i) => byType.labels[i])
      : ['Sin datos'];
    const data = nonZeroIndexes.length
      ? nonZeroIndexes.map((i) => byType.hours[i])
      : [1];
    const bgColors = nonZeroIndexes.length
      ? nonZeroIndexes.map((i) => PALETTE[i % PALETTE.length])
      : ['rgba(148, 163, 184, 0.25)'];

    dashboardInstances.set(
      'chart-type',
      new Chart(typeCanvas, {
        type: 'doughnut',
        data: {
          labels,
          datasets: [
            {
              data,
              backgroundColor: bgColors,
              borderColor: colors.surface,
              borderWidth: 2
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          cutout: '62%',
          plugins: {
            legend: {
              position: 'bottom',
              labels: { color: colors.text, boxWidth: 12, padding: 12 }
            },
            tooltip: {
              ...commonTooltip,
              enabled: nonZeroIndexes.length > 0,
              callbacks: {
                label: (ctx) => {
                  const origIdx = nonZeroIndexes[ctx.dataIndex];
                  const h = byType.hours[origIdx];
                  const eur = byType.earnings[origIdx];
                  return eur > 0
                    ? ` ${h} h (${eur.toFixed(2)} ${currency})`
                    : ` ${h} h`;
                }
              }
            }
          }
        }
      })
    );
  }

  // 4. Curva Acumulada
  const cumCanvas = document.getElementById('chart-cumulative');
  if (cumCanvas) {
    destroyChart('chart-cumulative');
    const cumulative = computeCumulativeSeries(logs);
    const hasEarnings = cumulative.cumulativeEarnings.some((v) => v > 0);

    const datasets = [
      {
        label: 'Horas acumuladas',
        data: cumulative.cumulativeHours,
        borderColor: '#818cf8',
        backgroundColor: 'rgba(129, 140, 248, 0.18)',
        fill: true,
        tension: 0.28,
        pointRadius: cumulative.labels.length > 25 ? 1.5 : 3.5,
        yAxisID: 'y'
      }
    ];

    const scales = {
      x: {
        ticks: { color: colors.muted, maxTicksLimit: 8, font: { size: 11 } },
        grid: { display: false }
      },
      y: {
        position: 'left',
        beginAtZero: true,
        ticks: { color: colors.muted, font: { size: 11 } },
        grid: { color: colors.grid }
      }
    };

    if (hasEarnings) {
      datasets.push({
        label: `Acumulado (${currency})`,
        data: cumulative.cumulativeEarnings,
        borderColor: '#34d399',
        backgroundColor: 'rgba(52, 211, 153, 0.08)',
        fill: false,
        tension: 0.28,
        pointRadius: cumulative.labels.length > 25 ? 1.5 : 3.5,
        yAxisID: 'y1'
      });
      scales.y1 = {
        position: 'right',
        beginAtZero: true,
        ticks: { color: '#34d399', font: { size: 11 } },
        grid: { drawOnChartArea: false }
      };
    }

    dashboardInstances.set(
      'chart-cumulative',
      new Chart(cumCanvas, {
        type: 'line',
        data: { labels: cumulative.labels, datasets },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          interaction: { mode: 'index', intersect: false },
          plugins: {
            legend: { labels: { color: colors.text, boxWidth: 12 } },
            tooltip: commonTooltip
          },
          scales
        }
      })
    );
  }
}

/**
 * Renderiza de forma segura una gráfica generada dinámicamente por Gemini en el chat IA.
 */
export function renderChatChart(canvas, chartConfig, theme = 'dark') {
  const Chart = getChartLib();
  if (!Chart || !canvas || !chartConfig) return null;

  const colors = getThemeColors(theme);
  const allowedTypes = ['bar', 'line', 'doughnut', 'pie'];
  const chartType = allowedTypes.includes(chartConfig.type) ? chartConfig.type : 'bar';
  const isCircular = chartType === 'doughnut' || chartType === 'pie';

  const labels = Array.isArray(chartConfig.labels) ? chartConfig.labels.map(String) : [];
  const rawDatasets = Array.isArray(chartConfig.datasets) ? chartConfig.datasets : [];

  const datasets = rawDatasets.map((ds, idx) => {
    const color = PALETTE[idx % PALETTE.length];
    const data = Array.isArray(ds.data) ? ds.data.map((n) => Number(n) || 0) : [];

    if (isCircular) {
      return {
        label: ds.label || 'Valor',
        data,
        backgroundColor: data.map((_, i) => PALETTE[i % PALETTE.length]),
        borderColor: colors.surface,
        borderWidth: 2
      };
    }

    return {
      label: ds.label || `Serie ${idx + 1}`,
      data,
      backgroundColor: chartType === 'line' ? 'rgba(56, 189, 248, 0.16)' : `${color}cc`,
      borderColor: color,
      borderWidth: 2,
      borderRadius: chartType === 'bar' ? 6 : 0,
      fill: chartType === 'line' && rawDatasets.length === 1,
      tension: 0.28
    };
  });

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      title: {
        display: Boolean(chartConfig.title),
        text: chartConfig.title || '',
        color: colors.text,
        font: { size: 13, weight: '600' },
        padding: { bottom: 10 }
      },
      legend: {
        display: isCircular || datasets.length > 1,
        position: isCircular ? 'bottom' : 'top',
        labels: { color: colors.text, boxWidth: 12 }
      },
      tooltip: {
        backgroundColor: colors.tooltipBg,
        titleColor: colors.text,
        bodyColor: colors.text,
        borderColor: colors.tooltipBorder,
        borderWidth: 1
      }
    }
  };

  if (!isCircular) {
    options.scales = {
      x: { ticks: { color: colors.muted, font: { size: 11 } }, grid: { display: false } },
      y: { beginAtZero: true, ticks: { color: colors.muted, font: { size: 11 } }, grid: { color: colors.grid } }
    };
  }

  return new Chart(canvas, {
    type: chartType,
    data: { labels, datasets },
    options
  });
}
