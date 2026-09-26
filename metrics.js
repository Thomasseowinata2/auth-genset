// Telemetri perangkat untuk halaman Dashboard.
//
// SEMUA ANGKA DI FILE INI MASIH DUMMY. Titik gantinya cuma satu, yaitu
// fetchMetrics(): begitu collector siap, isi fungsi itu dengan panggilan ke
// collector dan hapus generator dummy di bawahnya.
//
// Browser tidak bisa bicara SNMP/Modbus ke perangkat, jadi data asli harus
// dikumpulkan di sisi server (mis. skrip Python yang polling kartu jaringan
// Eaton dan kontroler genset, lalu menulis snapshot JSON yang di-fetch
// halaman ini).
//
// Bentuk snapshot yang dipakai dashboard:
//   { time: Date, readings: [reading] }
//   reading = {
//     device, categoryId, state, stateLabel, severity,
//     metrics: { ... } | null,        // null kalau perangkat tidak terjangkau
//     alerts: [{ severity, message }] // severity: "warn" | "crit"
//   }

const METRICS_REFRESH_MS = 30000;

const SEVERITY_RANK = { ok: 0, warn: 1, crit: 2 };
const SEVERITY_LABEL = { ok: "Normal", warn: "Peringatan", crit: "Kritis" };

// Ambang batas dipakai bersama oleh pembuat peringatan dan pewarnaan tabel,
// jadi angkanya cuma ditulis sekali di sini.
const THRESHOLDS = {
  upsLoad: { warn: 85, crit: 95 },
  upsBattery: { warn: 50, crit: 25 },
  upsRuntime: { warn: 15, crit: 8 },
  upsTemperature: { warn: 34, crit: 40 },
  gensetFuel: { warn: 30, crit: 15 },
  gensetService: { warn: 250 },
  gensetCoolant: { warn: 90, crit: 95 },
  gensetOil: { crit: 2.5 },
  gensetBattery: { warn: 24.2 },
};

const DEVICE_STATES = {
  ups: {
    normal: { label: "Normal", severity: "ok" },
    battery: { label: "Pakai baterai", severity: "warn", alert: "Beroperasi dengan baterai" },
    bypass: { label: "Bypass", severity: "warn", alert: "Beroperasi lewat bypass" },
    fault: { label: "Gangguan", severity: "crit", alert: "UPS melaporkan gangguan" },
    offline: { label: "Tidak terjangkau", severity: "crit", alert: "Tidak merespons polling" },
  },
  genset: {
    standby: { label: "Siaga", severity: "ok" },
    running: { label: "Beroperasi", severity: "ok" },
    fault: { label: "Gangguan", severity: "crit", alert: "Kontroler melaporkan gangguan" },
    offline: { label: "Tidak terjangkau", severity: "crit", alert: "Tidak merespons polling" },
  },
};

const DEFAULT_STATE = { ups: "normal", genset: "standby" };

// Skenario dummy supaya dashboard tidak polos. Perangkat yang tidak terdaftar
// di sini dianggap normal, dengan angka acak yang stabil per perangkat.
// `sinceMinutes` = berapa menit lalu kejadiannya mulai. Dipakai grafik tren:
// sebelum waktu itu perangkat digambar normal, sesudahnya bergerak ke nilai
// sekarang. Tanpa `sinceMinutes`, nilai dianggap sudah begitu sejak awal.
const DUMMY_SCENARIOS = {
  "UPS-B1-02": { state: "battery", batteryPercent: 46, runtimeMinutes: 11, sinceMinutes: 26 },
  "UPS-C1-01": { loadPercent: 91, sinceMinutes: 145 },
  "UPS-A2-02": { temperatureC: 36, sinceMinutes: 190 },
  "UPS-DR-02": { state: "offline", sinceMinutes: 52 },
  "GENSET-A-01": { hoursSinceService: 268 },
  "GENSET-B-02": { state: "running", fuelPercent: 58, sinceMinutes: 38 },
  "GENSET-C-01": { fuelPercent: 24 },
  "GENSET-UT-02": { state: "fault", fuelPercent: 71, batteryVdc: 23.6, sinceMinutes: 17 },
};

/* Utilitas angka */

function hash32(text) {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

// mulberry32, supaya angka dummy sebuah perangkat selalu sama tiap render.
function seededRandom(seed) {
  let state = seed >>> 0;
  return function next() {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function between(random, min, max) {
  return min + random() * (max - min);
}

function drift(random, amount) {
  return (random() - 0.5) * 2 * amount;
}

function choose(random, values) {
  return values[Math.floor(random() * values.length)];
}

function round(value, decimals = 0) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function worstSeverity(severities) {
  return severities.reduce((worst, severity) => (SEVERITY_RANK[severity] > SEVERITY_RANK[worst] ? severity : worst), "ok");
}

/* Ambang batas */

function severityAbove(value, threshold) {
  if (threshold.crit !== undefined && value >= threshold.crit) return "crit";
  if (threshold.warn !== undefined && value >= threshold.warn) return "warn";
  return "ok";
}

function severityBelow(value, threshold) {
  if (threshold.crit !== undefined && value <= threshold.crit) return "crit";
  if (threshold.warn !== undefined && value <= threshold.warn) return "warn";
  return "ok";
}

function pushAlert(alerts, severity, message) {
  if (severity !== "ok") alerts.push({ severity, message });
}

/* Generator dummy */

// Selalu menarik satu angka dari generator, walau nilainya ditimpa skenario,
// supaya urutan angka acak sebuah perangkat tidak bergeser. Tanpa ini, grafik
// "sebelum kejadian" ikut melonjak di metrik yang seharusnya tidak berubah.
function fixed(override, random, min, max) {
  const drawn = between(random, min, max);
  return override !== undefined ? override : drawn;
}

function upsMetrics(base, live, scenario, state) {
  // Semua angka ditarik di depan, tidak di dalam percabangan, supaya urutannya
  // sama untuk kondisi normal maupun kondisi skenario.
  const capacityKva = choose(base, [40, 60, 80, 100, 120, 160]);
  const loadDraw = fixed(scenario.loadPercent, base, 34, 66);
  const batteryDraw = fixed(scenario.batteryPercent, base, 96, 100);
  const inputDraw = between(base, 384, 398);
  const temperatureDraw = fixed(scenario.temperatureC, base, 22, 27);

  const onBattery = state === "battery";
  const loadJitter = drift(live, 2);
  const batteryJitter = drift(live, onBattery ? 1.5 : 0.4);
  const runtimeJitter = drift(live, 1);
  const inputJitter = drift(live, 1.5);
  const outputJitter = drift(live, 1.2);
  const frequencyJitter = drift(live, 0.12);
  const temperatureJitter = drift(live, 0.5);

  const loadPercent = clamp(round(loadDraw + loadJitter), 0, 100);
  const batteryPercent = clamp(round(batteryDraw + batteryJitter), 0, 100);
  const runtimeMinutes = scenario.runtimeMinutes !== undefined
    ? Math.round(scenario.runtimeMinutes + runtimeJitter)
    : Math.round(42 * (batteryPercent / 100) * (52 / Math.max(loadPercent, 20)));

  return {
    capacityKva,
    loadPercent,
    batteryPercent,
    runtimeMinutes,
    outputKw: round((capacityKva * 0.9 * loadPercent) / 100, 1),
    inputVoltage: onBattery ? 0 : round(inputDraw + inputJitter),
    outputVoltage: round(400 + outputJitter),
    frequency: round(50 + frequencyJitter, 2),
    temperatureC: round(temperatureDraw + temperatureJitter, 1),
  };
}

function gensetMetrics(base, live, scenario, state) {
  const capacityKva = choose(base, [250, 350, 500, 650, 800]);
  const running = state === "running";

  const loadDraw = fixed(scenario.loadPercent, base, 38, 62);
  const fuelDraw = fixed(scenario.fuelPercent, base, 56, 94);
  const engineHoursDraw = between(base, 320, 4200);
  const serviceDraw = fixed(scenario.hoursSinceService, base, 12, 235);
  const coolantDraw = running ? between(base, 78, 88) : between(base, 27, 33);
  const oilDraw = between(base, 3.4, 4.6);
  const batteryDraw = fixed(scenario.batteryVdc, base, 25.8, 27.4);

  const loadJitter = drift(live, 2);
  const fuelJitter = drift(live, running ? 0.6 : 0.2);
  const coolantJitter = drift(live, running ? 1.5 : 0.4);
  const oilJitter = drift(live, 0.1);
  const batteryJitter = drift(live, 0.15);
  const rpmJitter = drift(live, 6);
  const frequencyJitter = drift(live, 0.15);

  const loadPercent = running ? clamp(round(loadDraw + loadJitter), 0, 100) : 0;

  return {
    capacityKva,
    fuelPercent: clamp(round(fuelDraw + fuelJitter), 0, 100),
    engineHours: Math.round(engineHoursDraw),
    hoursSinceService: Math.round(serviceDraw),
    coolantC: round(coolantDraw + coolantJitter, 1),
    oilBar: running ? round(oilDraw + oilJitter, 1) : 0,
    batteryVdc: round(batteryDraw + batteryJitter, 1),
    rpm: running ? Math.round(1500 + rpmJitter) : 0,
    loadPercent,
    outputKw: running ? round((capacityKva * 0.8 * loadPercent) / 100, 1) : 0,
    frequency: running ? round(50 + frequencyJitter, 2) : 0,
  };
}

/* Peringatan */

function upsAlerts(metrics) {
  const alerts = [];
  pushAlert(alerts, severityAbove(metrics.loadPercent, THRESHOLDS.upsLoad), `Beban ${metrics.loadPercent}%`);
  pushAlert(alerts, severityBelow(metrics.batteryPercent, THRESHOLDS.upsBattery), `Kapasitas baterai ${metrics.batteryPercent}%`);
  pushAlert(alerts, severityBelow(metrics.runtimeMinutes, THRESHOLDS.upsRuntime), `Waktu cadangan ${metrics.runtimeMinutes} menit`);
  pushAlert(alerts, severityAbove(metrics.temperatureC, THRESHOLDS.upsTemperature), `Suhu ${metrics.temperatureC} °C`);
  return alerts;
}

function gensetAlerts(metrics, state) {
  const alerts = [];
  pushAlert(alerts, severityBelow(metrics.fuelPercent, THRESHOLDS.gensetFuel), `Bahan bakar ${metrics.fuelPercent}%`);
  pushAlert(alerts, severityAbove(metrics.hoursSinceService, THRESHOLDS.gensetService), `${metrics.hoursSinceService} jam sejak servis terakhir`);
  pushAlert(alerts, severityBelow(metrics.batteryVdc, THRESHOLDS.gensetBattery), `Tegangan aki ${metrics.batteryVdc} V`);
  if (state === "running") {
    pushAlert(alerts, severityAbove(metrics.coolantC, THRESHOLDS.gensetCoolant), `Suhu air pendingin ${metrics.coolantC} °C`);
    pushAlert(alerts, severityBelow(metrics.oilBar, THRESHOLDS.gensetOil), `Tekanan oli ${metrics.oilBar} bar`);
  }
  return alerts;
}

/* Perakitan snapshot */

let pollCount = 0;

function buildReading(category, device, poll) {
  const base = seededRandom(hash32(device.name));
  const live = seededRandom(hash32(`${device.name}#${poll}`));
  const scenario = DUMMY_SCENARIOS[device.name] || {};
  const states = DEVICE_STATES[category.id] || DEVICE_STATES.ups;
  const state = scenario.state || DEFAULT_STATE[category.id] || "normal";
  const stateInfo = states[state];

  let metrics = null;
  if (state !== "offline") {
    metrics = category.id === "genset"
      ? gensetMetrics(base, live, scenario, state)
      : upsMetrics(base, live, scenario, state);
  }

  const alerts = [];
  if (stateInfo.alert) alerts.push({ severity: stateInfo.severity, message: stateInfo.alert });
  if (metrics) {
    alerts.push(...(category.id === "genset" ? gensetAlerts(metrics, state) : upsAlerts(metrics)));
  }

  return {
    device,
    categoryId: category.id,
    state,
    stateLabel: stateInfo.label,
    severity: worstSeverity([stateInfo.severity, ...alerts.map((alert) => alert.severity)]),
    metrics,
    alerts,
  };
}

// Satu-satunya titik yang perlu diganti saat data asli sudah tersedia, mis.:
//   const response = await fetch("/api/metrics", { cache: "no-store" });
//   const data = await response.json();
//   return { time: new Date(data.time), readings: data.readings };
async function fetchMetrics(categories) {
  pollCount += 1;
  const readings = [];
  for (const category of categories) {
    for (const device of category.devices) {
      readings.push(buildReading(category, device, pollCount));
    }
  }
  return { time: new Date(), readings };
}

/* Riwayat (dummy) */

// Jumlah titik per grafik, berapa pun rentang waktunya.
const HISTORY_POINTS = 96;

// Metrik yang punya riwayat, plus seberapa besar goyangannya.
// `trend` = selisih nilai di awal rentang (mis. bahan bakar dulu lebih penuh).
const HISTORY_FIELDS = {
  ups: {
    loadPercent: { amplitude: 5, min: 0, max: 100 },
    batteryPercent: { amplitude: 0.6, min: 0, max: 100 },
    temperatureC: { amplitude: 0.9, min: 0 },
    outputKw: { amplitude: 3.5, min: 0 },
    inputVoltage: { amplitude: 2.5, min: 0 },
  },
  genset: {
    fuelPercent: { amplitude: 0.5, trend: 2.5, min: 0, max: 100 },
    coolantC: { amplitude: 1.1, min: 0 },
    batteryVdc: { amplitude: 0.1, min: 0 },
    outputKw: { amplitude: 5, min: 0 },
  },
};

function wavePhase(text) {
  return (hash32(text) % 1000) / 1000;
}

// Gabungan sinus, bukan acak per titik, supaya garisnya halus seperti tren asli.
function waveAt(phase, ratio) {
  return (
    0.62 * Math.sin(2 * Math.PI * (ratio * 1.15 + phase)) +
    0.28 * Math.sin(2 * Math.PI * (ratio * 2.7 + phase * 1.7)) +
    0.1 * Math.sin(2 * Math.PI * (ratio * 8.3 + phase * 3.1))
  );
}

// Nilai perangkat seandainya tidak kena skenario apa pun, dipakai sebagai
// bentuk grafik sebelum kejadian mulai.
function baselineMetrics(category, device) {
  const base = seededRandom(hash32(device.name));
  const live = seededRandom(hash32(`${device.name}#baseline`));
  const state = DEFAULT_STATE[category.id] || "normal";
  return category.id === "genset" ? gensetMetrics(base, live, {}, state) : upsMetrics(base, live, {}, state);
}

// Pasangan fetchMetrics() untuk data riwayat. Nanti isinya jadi panggilan ke
// time-series milik collector, mis. fetch(`/api/history?ip=${device.ip}&hours=${hours}`).
async function fetchHistory(category, device, hours = 6) {
  const now = Date.now();
  const stepMs = (hours * 3600000) / (HISTORY_POINTS - 1);
  const scenario = DUMMY_SCENARIOS[device.name] || {};
  const fields = HISTORY_FIELDS[category.id] || HISTORY_FIELDS.ups;
  const current = buildReading(category, device, pollCount).metrics;
  const baseline = baselineMetrics(category, device);
  const eventStart = scenario.sinceMinutes ? now - scenario.sinceMinutes * 60000 : null;

  const points = [];
  for (let index = 0; index < HISTORY_POINTS; index += 1) {
    const time = now - (HISTORY_POINTS - 1 - index) * stepMs;
    const ratio = index / (HISTORY_POINTS - 1);

    // Perangkat tidak terjangkau: datanya putus sejak kejadian mulai.
    if (!current && eventStart !== null && time >= eventStart) {
      points.push({ time: new Date(time), values: null });
      continue;
    }

    const values = {};
    for (const key of Object.keys(fields)) {
      const field = fields[key];
      const from = baseline[key];
      const to = current ? current[key] : baseline[key];

      let value;
      if (eventStart === null) value = to;
      else if (time <= eventStart) value = from;
      else value = from + (to - from) * Math.min(1, (time - eventStart) / (now - eventStart));

      if (field.trend) value += field.trend * (1 - ratio);
      // Goyangan digeser supaya titik terakhir persis sama dengan nilai sekarang.
      const phase = wavePhase(device.name + key);
      value += field.amplitude * (waveAt(phase, ratio) - waveAt(phase, 1));

      values[key] = round(clamp(value, field.min ?? -Infinity, field.max ?? Infinity), 2);
    }
    points.push({ time: new Date(time), values });
  }

  return { hours, points };
}
