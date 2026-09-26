// Render halaman Dashboard dari snapshot metrics.js.
// Dimuat sebelum app.js, tapi semua fungsi di sini baru dipanggil dari
// app.js, jadi helper element() milik app.js sudah tersedia saat dipakai.

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];

function pad2(value) {
  return String(value).padStart(2, "0");
}

function formatDateTime(date) {
  return `${date.getDate()} ${MONTHS[date.getMonth()]} ${date.getFullYear()} · ${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

function formatClock(date) {
  return `${pad2(date.getHours())}:${pad2(date.getMinutes())}:${pad2(date.getSeconds())}`;
}

function num(value, decimals = 0) {
  return value.toLocaleString("id-ID", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

/* Sel tabel */

function detailHref(device) {
  return `#device/${encodeURIComponent(device.name)}`;
}

function deviceLink(device, className) {
  const link = element("a", className, device.name);
  link.href = detailHref(device);
  return link;
}

function deviceCell(reading) {
  const wrap = element("div", "cell-device");
  wrap.append(deviceLink(reading.device, "cell-name"), element("span", "cell-ip", reading.device.ip));
  return wrap;
}

function statusCell(reading) {
  const states = DEVICE_STATES[reading.categoryId] || DEVICE_STATES.ups;
  const severity = states[reading.state].severity;
  return element("span", `chip sev-${severity}`, reading.stateLabel);
}

function valueCell(text, severity = "ok") {
  return element("span", `cell-value sev-${severity}`, text);
}

function meterCell(percent, severity) {
  const wrap = element("div", "meter-cell");
  const meter = element("div", `meter sev-${severity}`);
  const fill = element("span");
  fill.style.width = `${clamp(percent, 0, 100)}%`;
  meter.append(fill);
  wrap.append(element("span", `meter-value sev-${severity}`, `${num(percent)}%`), meter);
  return wrap;
}

const TABLE_COLUMNS = {
  ups: [
    { label: "Perangkat", always: true, cell: deviceCell },
    { label: "Status", always: true, cell: statusCell },
    { label: "Beban", cell: (r) => meterCell(r.metrics.loadPercent, severityAbove(r.metrics.loadPercent, THRESHOLDS.upsLoad)) },
    { label: "Baterai", cell: (r) => meterCell(r.metrics.batteryPercent, severityBelow(r.metrics.batteryPercent, THRESHOLDS.upsBattery)) },
    {
      label: "Cadangan",
      align: "right",
      cell: (r) => valueCell(`${num(r.metrics.runtimeMinutes)} mnt`, severityBelow(r.metrics.runtimeMinutes, THRESHOLDS.upsRuntime)),
    },
    { label: "Daya", align: "right", cell: (r) => valueCell(`${num(r.metrics.outputKw, 1)} kW`) },
    {
      label: "Suhu",
      align: "right",
      cell: (r) => valueCell(`${num(r.metrics.temperatureC, 1)} °C`, severityAbove(r.metrics.temperatureC, THRESHOLDS.upsTemperature)),
    },
  ],
  genset: [
    { label: "Perangkat", always: true, cell: deviceCell },
    { label: "Status", always: true, cell: statusCell },
    { label: "Bahan bakar", cell: (r) => meterCell(r.metrics.fuelPercent, severityBelow(r.metrics.fuelPercent, THRESHOLDS.gensetFuel)) },
    { label: "Jam operasi", align: "right", cell: (r) => valueCell(`${num(r.metrics.engineHours)} jam`) },
    {
      label: "Suhu mesin",
      align: "right",
      cell: (r) => valueCell(
        `${num(r.metrics.coolantC, 1)} °C`,
        r.state === "running" ? severityAbove(r.metrics.coolantC, THRESHOLDS.gensetCoolant) : "ok"
      ),
    },
    {
      label: "Aki",
      align: "right",
      cell: (r) => valueCell(`${num(r.metrics.batteryVdc, 1)} V`, severityBelow(r.metrics.batteryVdc, THRESHOLDS.gensetBattery)),
    },
    { label: "Daya", align: "right", cell: (r) => valueCell(`${num(r.metrics.outputKw, 1)} kW`) },
  ],
};

function renderTable(columns, readings) {
  const headRow = element("tr");
  for (const column of columns) {
    headRow.append(element("th", column.align === "right" ? "align-right" : "", column.label));
  }
  const head = element("thead");
  head.append(headRow);

  const body = element("tbody");
  for (const reading of readings) {
    const row = element("tr");
    for (const column of columns) {
      const cell = element("td", column.align === "right" ? "align-right" : "");
      // Perangkat tidak terjangkau tidak punya pembacaan sama sekali.
      if (!reading.metrics && !column.always) cell.append(element("span", "cell-empty", "—"));
      else cell.append(column.cell(reading));
      row.append(cell);
    }
    body.append(row);
  }

  const table = element("table", "table");
  table.append(head, body);

  const scroller = element("div", "table-scroll");
  scroller.append(table);
  return scroller;
}

/* Panel */

function panel(title, meta, ...content) {
  const section = element("section", "panel");
  const header = element("div", "panel-head");
  header.append(element("h2", "panel-title", title));
  if (meta) header.append(meta);
  section.append(header, ...content);
  return section;
}

function summarize(readings) {
  const counts = { ok: 0, warn: 0, crit: 0 };
  for (const reading of readings) counts[reading.severity] += 1;

  const upsLoads = readings.filter((r) => r.categoryId === "ups" && r.metrics).map((r) => r.metrics.loadPercent);
  const fuels = readings.filter((r) => r.categoryId === "genset" && r.metrics).map((r) => r.metrics.fuelPercent);
  const average = (values) => Math.round(values.reduce((total, value) => total + value, 0) / values.length);

  return {
    total: readings.length,
    ok: counts.ok,
    warn: counts.warn,
    crit: counts.crit,
    offline: readings.filter((r) => r.state === "offline").length,
    avgUpsLoad: upsLoads.length ? average(upsLoads) : null,
    minFuel: fuels.length ? Math.min(...fuels) : null,
    gensetRunning: readings.filter((r) => r.state === "running").length,
  };
}

function tile(label, value, hint, severity = "ok") {
  const item = element("div", `tile sev-${severity}`);
  item.append(element("div", "tile-label", label), element("div", "tile-value", value));
  if (hint) item.append(element("div", "tile-hint", hint));
  return item;
}

function renderSummary(summary) {
  const grid = element("div", "tiles");
  grid.append(
    tile("Perangkat dipantau", String(summary.total), summary.offline ? `${summary.offline} tidak terjangkau` : "Semua terjangkau"),
    tile("Normal", String(summary.ok), "Tidak ada temuan", "ok"),
    tile("Peringatan", String(summary.warn), "Perlu dicek", summary.warn ? "warn" : "ok"),
    tile("Kritis", String(summary.crit), "Perlu tindakan", summary.crit ? "crit" : "ok"),
    tile("Rata-rata beban UPS", summary.avgUpsLoad === null ? "—" : `${num(summary.avgUpsLoad)}%`, "Seluruh UPS terjangkau"),
    tile(
      "Bahan bakar terendah",
      summary.minFuel === null ? "—" : `${num(summary.minFuel)}%`,
      summary.gensetRunning ? `${summary.gensetRunning} genset beroperasi` : "Semua genset siaga",
      summary.minFuel === null ? "ok" : severityBelow(summary.minFuel, THRESHOLDS.gensetFuel)
    )
  );
  return grid;
}

function renderAlerts(readings) {
  const rows = [];
  for (const reading of readings) {
    for (const alert of reading.alerts) rows.push({ reading, alert });
  }
  rows.sort((a, b) => {
    const bySeverity = SEVERITY_RANK[b.alert.severity] - SEVERITY_RANK[a.alert.severity];
    return bySeverity !== 0 ? bySeverity : a.reading.device.name.localeCompare(b.reading.device.name);
  });

  const meta = element("span", "panel-meta", rows.length ? `${rows.length} temuan` : "Semua aman");
  if (!rows.length) {
    return panel("Peringatan aktif", meta, element("p", "panel-empty", "Tidak ada peringatan aktif."));
  }

  const list = element("ul", "alerts");
  for (const { reading, alert } of rows) {
    const item = element("li", "alert-row");
    const main = element("div", "alert-main");
    main.append(
      deviceLink(reading.device, "alert-device"),
      element("span", "alert-meta", `${categoryLabel(reading.categoryId)} · ${reading.device.ip}`)
    );
    item.append(element("span", `chip sev-${alert.severity}`, SEVERITY_LABEL[alert.severity]), main, element("span", "alert-message", alert.message));
    list.append(item);
  }
  return panel("Peringatan aktif", meta, list);
}

function categoryLabel(categoryId) {
  const category = CATEGORIES.find((item) => item.id === categoryId);
  return category ? category.label : categoryId;
}

function renderCategoryPanel(category, readings) {
  const rows = readings.filter((reading) => reading.categoryId === category.id);
  if (!rows.length) return null;

  const meta = element("span", "panel-meta");
  meta.append(element("span", "", `${rows.length} perangkat`));
  const link = element("a", "panel-link", "Buka daftar ›");
  link.href = `#${category.id}`;
  meta.append(link);

  const title = category.brand ? `${category.label} · ${category.brand}` : category.label;
  const columns = TABLE_COLUMNS[category.id] || TABLE_COLUMNS.ups;
  return panel(title, meta, renderTable(columns, rows));
}

function renderDashboard(root, snapshot) {
  if (!snapshot) {
    root.replaceChildren(element("p", "panel-empty", "Memuat data perangkat…"));
    return;
  }

  const panels = [
    renderSummary(summarize(snapshot.readings)),
    renderAlerts(snapshot.readings),
    ...CATEGORIES.map((category) => renderCategoryPanel(category, snapshot.readings)),
  ];
  root.replaceChildren(...panels.filter(Boolean));
}

/* Halaman detail perangkat */

// Semua metrik yang dihasilkan metrics.js, lengkap dengan label dan satuannya.
// `runningOnly` = ambang batasnya cuma berlaku saat genset beroperasi.
const METRIC_FIELDS = {
  ups: [
    { key: "loadPercent", label: "Beban", unit: "%", decimals: 0, threshold: THRESHOLDS.upsLoad, direction: "above", minSpan: 10 },
    { key: "batteryPercent", label: "Kapasitas baterai", unit: "%", decimals: 0, threshold: THRESHOLDS.upsBattery, direction: "below", minSpan: 6 },
    { key: "runtimeMinutes", label: "Waktu cadangan", unit: "menit", decimals: 0, threshold: THRESHOLDS.upsRuntime, direction: "below" },
    { key: "outputKw", label: "Daya keluar", unit: "kW", decimals: 1, minSpan: 6 },
    { key: "capacityKva", label: "Kapasitas", unit: "kVA", decimals: 0 },
    { key: "inputVoltage", label: "Tegangan input", unit: "V", decimals: 0, minSpan: 8 },
    { key: "outputVoltage", label: "Tegangan output", unit: "V", decimals: 0 },
    { key: "frequency", label: "Frekuensi", unit: "Hz", decimals: 2 },
    { key: "temperatureC", label: "Suhu", unit: "°C", decimals: 1, threshold: THRESHOLDS.upsTemperature, direction: "above", minSpan: 3 },
  ],
  genset: [
    { key: "fuelPercent", label: "Bahan bakar", unit: "%", decimals: 0, threshold: THRESHOLDS.gensetFuel, direction: "below", minSpan: 6 },
    { key: "outputKw", label: "Daya keluar", unit: "kW", decimals: 1, minSpan: 10 },
    { key: "loadPercent", label: "Beban", unit: "%", decimals: 0 },
    { key: "capacityKva", label: "Kapasitas", unit: "kVA", decimals: 0 },
    { key: "rpm", label: "Putaran mesin", unit: "rpm", decimals: 0 },
    { key: "coolantC", label: "Suhu air pendingin", unit: "°C", decimals: 1, threshold: THRESHOLDS.gensetCoolant, direction: "above", runningOnly: true, minSpan: 4 },
    { key: "oilBar", label: "Tekanan oli", unit: "bar", decimals: 1, threshold: THRESHOLDS.gensetOil, direction: "below", runningOnly: true },
    { key: "batteryVdc", label: "Tegangan aki", unit: "V", decimals: 1, threshold: THRESHOLDS.gensetBattery, direction: "below", minSpan: 1 },
    { key: "frequency", label: "Frekuensi", unit: "Hz", decimals: 2 },
    { key: "engineHours", label: "Jam operasi", unit: "jam", decimals: 0 },
    { key: "hoursSinceService", label: "Sejak servis terakhir", unit: "jam", decimals: 0, threshold: THRESHOLDS.gensetService, direction: "above" },
  ],
};

// Rentang grafik yang sedang dipilih, dipakai ulang antar perangkat.
let detailHours = 6;
// Penanda permintaan riwayat terakhir, supaya hasil yang datang telat dibuang.
let detailToken = 0;

function metricFields(categoryId) {
  return METRIC_FIELDS[categoryId] || METRIC_FIELDS.ups;
}

function fieldByKey(categoryId, key) {
  return metricFields(categoryId).find((field) => field.key === key);
}

function fieldSeverity(field, value, reading) {
  if (!field.threshold || value === null || value === undefined) return "ok";
  if (field.runningOnly && reading.state !== "running") return "ok";
  return field.direction === "below" ? severityBelow(value, field.threshold) : severityAbove(value, field.threshold);
}

// Tiga metrik yang paling menjelaskan kondisi perangkat.
function chartKeys(reading) {
  if (reading.categoryId !== "genset") return ["loadPercent", "batteryPercent", "temperatureC"];
  return reading.state === "running"
    ? ["fuelPercent", "coolantC", "outputKw"]
    : ["fuelPercent", "coolantC", "batteryVdc"];
}

// Persen ditulis rapat (46%), satuan lain pakai spasi (24,0 °C).
function metricText(value, field) {
  return field.unit === "%" ? `${num(value, field.decimals)}%` : num(value, field.decimals);
}

function metricUnit(field) {
  return field.unit === "%" ? "" : field.unit;
}

function formatHourMinute(date) {
  return `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

/* Grafik garis (SVG, tanpa library) */

const CHART_WIDTH = 640;
const CHART_HEIGHT = 150;
const CHART_LEFT = 46;
const CHART_RIGHT = 632;
const CHART_TOP = 12;
const CHART_BOTTOM = 118;

function svgNode(tag, attributes) {
  const node = document.createElementNS("http://www.w3.org/2000/svg", tag);
  for (const name of Object.keys(attributes)) node.setAttribute(name, attributes[name]);
  return node;
}

function chartDomain(field, values) {
  let low = Math.min(...values);
  let high = Math.max(...values);
  const minSpan = field.minSpan || 4;
  if (high - low < minSpan) {
    const middle = (high + low) / 2;
    low = middle - minSpan / 2;
    high = middle + minSpan / 2;
  }
  const pad = (high - low) * 0.12;
  low -= pad;
  high += pad;
  if (field.unit === "%") {
    low = Math.max(low, 0);
    high = Math.min(high, 100);
  }
  return { low, high };
}

function renderChart(field, history, reading) {
  const values = history.points.map((point) => (point.values ? point.values[field.key] : null));
  const known = values.filter((value) => value !== null);

  const chart = element("div", "chart");
  const head = element("div", "chart-head");
  const readout = element("span", "chart-readout");
  head.append(element("span", "chart-label", field.label), readout);
  chart.append(head);

  if (!known.length) {
    chart.append(element("p", "panel-empty", "Tidak ada data pada rentang ini."));
    return chart;
  }

  const { low, high } = chartDomain(field, known);
  const lastIndex = values.reduce((last, value, index) => (value === null ? last : index), 0);
  const severity = fieldSeverity(field, values[lastIndex], reading);

  const x = (index) => CHART_LEFT + (index / (values.length - 1)) * (CHART_RIGHT - CHART_LEFT);
  const y = (value) => CHART_BOTTOM - ((value - low) / (high - low)) * (CHART_BOTTOM - CHART_TOP);

  const svg = svgNode("svg", {
    viewBox: `0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`,
    class: `chart-svg sev-${severity}`,
    role: "img",
    "aria-label": `Tren ${field.label}`,
  });

  // Garis bantu horizontal plus labelnya.
  for (const step of [0, 0.5, 1]) {
    const value = low + (high - low) * (1 - step);
    const lineY = CHART_TOP + (CHART_BOTTOM - CHART_TOP) * step;
    svg.append(svgNode("line", { class: "chart-grid", x1: CHART_LEFT, x2: CHART_RIGHT, y1: lineY, y2: lineY }));
    const label = svgNode("text", { class: "chart-axis", x: CHART_LEFT - 8, y: lineY + 3, "text-anchor": "end" });
    label.textContent = num(value, field.decimals);
    svg.append(label);
  }

  // Ambang peringatan, kalau kebetulan masuk rentang grafik.
  const warnAt = field.threshold ? field.threshold.warn : undefined;
  if (warnAt !== undefined && warnAt > low && warnAt < high) {
    svg.append(svgNode("line", { class: "chart-threshold", x1: CHART_LEFT, x2: CHART_RIGHT, y1: y(warnAt), y2: y(warnAt) }));
    const label = svgNode("text", { class: "chart-axis chart-threshold-label", x: CHART_RIGHT, y: y(warnAt) - 4, "text-anchor": "end" });
    label.textContent = "ambang";
    svg.append(label);
  }

  // Data bisa putus (perangkat tidak terjangkau), jadi digambar per potongan.
  const segments = [];
  let segment = [];
  values.forEach((value, index) => {
    if (value === null) {
      if (segment.length) segments.push(segment);
      segment = [];
      return;
    }
    segment.push(index);
  });
  if (segment.length) segments.push(segment);

  const firstGap = values.indexOf(null);
  if (firstGap !== -1) {
    svg.append(svgNode("rect", {
      class: "chart-gap",
      x: x(firstGap),
      y: CHART_TOP,
      width: Math.max(x(values.length - 1) - x(firstGap), 1),
      height: CHART_BOTTOM - CHART_TOP,
    }));
  }

  for (const indices of segments) {
    const line = indices
      .map((index, position) => `${position === 0 ? "M" : "L"} ${x(index).toFixed(1)} ${y(values[index]).toFixed(1)}`)
      .join(" ");
    const first = indices[0];
    const last = indices[indices.length - 1];
    svg.append(svgNode("path", { class: "chart-area", d: `${line} L ${x(last).toFixed(1)} ${CHART_BOTTOM} L ${x(first).toFixed(1)} ${CHART_BOTTOM} Z` }));
    svg.append(svgNode("path", { class: "chart-line", d: line }));
  }

  // Label waktu di sumbu bawah.
  const ticks = [0, Math.round((values.length - 1) / 3), Math.round(((values.length - 1) * 2) / 3), values.length - 1];
  for (const index of ticks) {
    const anchor = index === 0 ? "start" : index === values.length - 1 ? "end" : "middle";
    const label = svgNode("text", { class: "chart-axis", x: x(index), y: CHART_BOTTOM + 18, "text-anchor": anchor });
    label.textContent = formatHourMinute(history.points[index].time);
    svg.append(label);
  }

  svg.append(svgNode("circle", { class: "chart-dot", cx: x(lastIndex), cy: y(values[lastIndex]), r: 3 }));

  const hoverLine = svgNode("line", { class: "chart-hover", x1: 0, x2: 0, y1: CHART_TOP, y2: CHART_BOTTOM, visibility: "hidden" });
  const hoverDot = svgNode("circle", { class: "chart-hover-dot", cx: 0, cy: 0, r: 3.5, visibility: "hidden" });
  svg.append(hoverLine, hoverDot);

  const readoutFor = (value) => `${metricText(value, field)}${metricUnit(field) ? ` ${metricUnit(field)}` : ""}`;
  // Perangkat yang datanya putus: angka terakhir bukan kondisi "sekarang".
  const stale = values[values.length - 1] === null;
  const when = stale ? `terakhir ${formatHourMinute(history.points[lastIndex].time)}` : "sekarang";
  const defaultReadout = `${readoutFor(values[lastIndex])} · ${when}`;
  readout.className = `chart-readout sev-${severity}`;
  readout.textContent = defaultReadout;

  svg.addEventListener("pointermove", (event) => {
    const box = svg.getBoundingClientRect();
    const ratio = (event.clientX - box.left) / box.width;
    const position = ((ratio * CHART_WIDTH - CHART_LEFT) / (CHART_RIGHT - CHART_LEFT)) * (values.length - 1);
    const index = clamp(Math.round(position), 0, values.length - 1);
    const value = values[index];
    const time = formatHourMinute(history.points[index].time);
    hoverLine.setAttribute("x1", x(index));
    hoverLine.setAttribute("x2", x(index));
    hoverLine.setAttribute("visibility", "visible");
    if (value === null) {
      hoverDot.setAttribute("visibility", "hidden");
      readout.textContent = `Tidak ada data · ${time}`;
      return;
    }
    hoverDot.setAttribute("cx", x(index));
    hoverDot.setAttribute("cy", y(value));
    hoverDot.setAttribute("visibility", "visible");
    readout.textContent = `${readoutFor(value)} · ${time}`;
  });

  svg.addEventListener("pointerleave", () => {
    hoverLine.setAttribute("visibility", "hidden");
    hoverDot.setAttribute("visibility", "hidden");
    readout.textContent = defaultReadout;
  });

  chart.append(svg);
  return chart;
}

/* Bagian-bagian halaman detail */

function renderDetailActions(category, device) {
  const row = element("div", "detail-actions");
  const open = element("a", "button-open", "Buka web UI perangkat ›");
  open.href = deviceUrl(category, device);
  open.target = "_blank";
  open.rel = "noopener noreferrer";
  attachAutoLogin(open, category, device);
  const hint = category.autoLogin
    ? "Login otomatis memakai kredensial sesi. Ctrl/Shift-klik untuk membuka tanpa login."
    : "Membuka halaman login perangkat di tab baru.";
  row.append(open, element("span", "detail-hint", hint));
  return row;
}

function renderDeviceAlerts(reading) {
  const list = element("ul", "alerts");
  for (const alert of reading.alerts) {
    const item = element("li", "alert-row");
    item.append(
      element("span", `chip sev-${alert.severity}`, SEVERITY_LABEL[alert.severity]),
      element("span", "alert-message", alert.message)
    );
    list.append(item);
  }
  return panel("Peringatan", element("span", "panel-meta", `${reading.alerts.length} temuan`), list);
}

function renderMetricGrid(reading) {
  const grid = element("div", "metric-grid");
  for (const field of metricFields(reading.categoryId)) {
    const value = reading.metrics ? reading.metrics[field.key] : null;
    const item = element("div", `metric sev-${fieldSeverity(field, value, reading)}`);
    const valueRow = element("div", "metric-value");
    if (value === null) {
      valueRow.append(element("span", "cell-empty", "—"));
    } else {
      valueRow.append(element("span", "", metricText(value, field)));
      if (metricUnit(field)) valueRow.append(element("span", "metric-unit", metricUnit(field)));
    }
    item.append(element("div", "metric-label", field.label), valueRow);
    grid.append(item);
  }
  return grid;
}

async function loadCharts(body, category, device, reading) {
  const token = (detailToken += 1);
  const history = await fetchHistory(category, device, detailHours);
  if (token !== detailToken) return;
  body.replaceChildren(...chartKeys(reading).map((key) => renderChart(fieldByKey(reading.categoryId, key), history, reading)));
}

function renderChartPanel(category, device, reading) {
  const body = element("div", "charts");
  body.append(element("p", "panel-empty", "Memuat tren…"));

  const options = [6, 24];
  const range = element("div", "range");
  const buttons = options.map((hours) => {
    const button = element("button", "range-item", `${hours} jam`);
    button.type = "button";
    button.setAttribute("aria-pressed", String(hours === detailHours));
    button.addEventListener("click", () => {
      if (detailHours === hours) return;
      detailHours = hours;
      buttons.forEach((item, index) => item.setAttribute("aria-pressed", String(options[index] === detailHours)));
      loadCharts(body, category, device, reading);
    });
    return button;
  });
  range.append(...buttons);

  const meta = element("span", "panel-meta");
  meta.append(range);

  loadCharts(body, category, device, reading);
  return panel("Tren", meta, body);
}

function renderDeviceDetail(root, category, device, snapshot) {
  if (!snapshot) {
    root.replaceChildren(element("p", "panel-empty", "Memuat data perangkat…"));
    return;
  }

  const reading = snapshot.readings.find((item) => item.device.name === device.name);
  if (!reading) {
    root.replaceChildren(element("p", "panel-empty", "Perangkat tidak ada di snapshot terakhir."));
    return;
  }

  const parts = [renderDetailActions(category, device)];
  if (reading.alerts.length) parts.push(renderDeviceAlerts(reading));
  parts.push(renderChartPanel(category, device, reading));
  parts.push(
    panel(
      "Metrik",
      element("span", "panel-meta", reading.metrics ? "Pembacaan terakhir" : "Tidak ada pembacaan"),
      renderMetricGrid(reading)
    )
  );
  root.replaceChildren(...parts);
}
