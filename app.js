const overviewNav = document.getElementById("overviewNav");
const nav = document.getElementById("nav");
const grid = document.getElementById("deviceGrid");
const dashboard = document.getElementById("dashboard");
const deviceDetail = document.getElementById("deviceDetail");
const crumb = document.getElementById("crumb");
const contentBadge = document.getElementById("contentBadge");
const dashboardActions = document.getElementById("dashboardActions");
const updatedAt = document.getElementById("updatedAt");
const refreshButton = document.getElementById("refreshButton");
const syncTime = document.getElementById("syncTime");
const categoryTitle = document.getElementById("categoryTitle");
const categoryCount = document.getElementById("categoryCount");
const autoLoginForm = document.getElementById("autoLoginForm");
const autoLoginUsername = document.getElementById("autoLoginUsername");
const autoLoginPassword = document.getElementById("autoLoginPassword");
const logoutButton = document.getElementById("logoutButton");

// Snapshot metrik terakhir, dipakai dashboard dan penanda peringatan di sidebar.
let snapshot = null;
// Kategori yang kartunya sedang terpasang, supaya grid tidak dibangun ulang
// tiap kali metrik di-refresh (kartu tidak bergantung pada metrik).
let renderedCategory = null;

// categoryId diisi kalau yang kurang cuma kredensial satu jenis perangkat,
// supaya halaman login tidak meminta ulang kredensial yang sudah ada.
function goToLogin(categoryId) {
  const query = categoryId ? `?need=${encodeURIComponent(categoryId)}` : "";
  location.replace("login.html" + query + location.hash);
}

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function deviceUrl(category, device) {
  return `${category.scheme}://${device.ip}${category.path}`;
}

// Tiap kategori punya akunnya sendiri, jadi kredensial diambil per kategori.
function openWithAutoLogin(category, device) {
  const credentials = loadCredentials(category.id);
  if (!credentials) {
    goToLogin(category.id);
    return;
  }
  autoLoginForm.action = deviceUrl(category, device);
  autoLoginUsername.name = category.loginFields.username;
  autoLoginUsername.value = credentials.username;
  autoLoginPassword.name = category.loginFields.password;
  autoLoginPassword.value = credentials.password;
  autoLoginForm.submit();
}

// Perangkat ber-login otomatis dibuka lewat POST form tersembunyi, bukan link biasa.
function attachAutoLogin(link, category, device) {
  if (!category.autoLogin) return;
  link.addEventListener("click", (event) => {
    // Ctrl/Shift/Cmd-click keeps plain link behavior (open without logging in).
    if (event.ctrlKey || event.metaKey || event.shiftKey) return;
    event.preventDefault();
    openWithAutoLogin(category, device);
  });
}

function renderCard(category, device) {
  const card = element("a", "card");
  card.href = deviceUrl(category, device);
  card.target = "_blank";
  card.rel = "noopener noreferrer";

  const head = element("div", "card-head");
  head.append(element("span", "card-name", device.name), element("span", "card-chevron", "›"));

  const body = element("div", "card-body");
  body.append(element("div", "card-location", device.location), element("div", "card-ip", device.ip));

  card.append(head, body);
  attachAutoLogin(card, category, device);

  // Kartu tetap link ke web UI perangkat; halaman detail lewat tautan terpisah
  // di bawahnya, karena <a> tidak boleh bersarang.
  const detail = element("a", "card-detail", "Lihat detail ›");
  detail.href = detailHref(device);

  const wrap = element("div", "card-wrap");
  wrap.append(card, detail);
  return wrap;
}

function categorySeverity(category) {
  if (!snapshot) return "ok";
  return worstSeverity(snapshot.readings.filter((reading) => reading.categoryId === category.id).map((reading) => reading.severity));
}

function activeAlerts() {
  return snapshot ? snapshot.readings.flatMap((reading) => reading.alerts) : [];
}

function renderNav(view) {
  const activeCategory = view.type === "dashboard" ? null : view.category;
  const dashboardItem = element("a", "nav-item");
  dashboardItem.href = "#dashboard";
  if (!activeCategory) dashboardItem.setAttribute("aria-current", "page");
  dashboardItem.append(element("span", "", "Dashboard"));

  const alerts = activeAlerts();
  if (alerts.length) {
    const severity = worstSeverity(alerts.map((alert) => alert.severity));
    dashboardItem.append(element("span", `nav-count nav-badge sev-${severity}`, String(alerts.length)));
  }
  overviewNav.replaceChildren(dashboardItem);

  nav.replaceChildren(
    ...CATEGORIES.map((category) => {
      const item = element("a", "nav-item");
      item.href = `#${category.id}`;
      if (category === activeCategory) item.setAttribute("aria-current", "page");

      const trailing = element("span", "nav-right");
      const severity = categorySeverity(category);
      if (severity !== "ok") trailing.append(element("span", `nav-dot sev-${severity}`));
      trailing.append(element("span", "nav-count", String(category.devices.length)));

      item.append(element("span", "", category.label), trailing);
      return item;
    })
  );
}

// #ups / #genset = daftar perangkat, #device/<nama> = halaman detail,
// sisanya (termasuk hash kosong) = dashboard.
function currentView() {
  const hash = decodeURIComponent(location.hash.slice(1));

  if (hash.startsWith("device/")) {
    const name = hash.slice("device/".length);
    for (const category of CATEGORIES) {
      const device = category.devices.find((item) => item.name === name);
      if (device) return { type: "device", category, device };
    }
  }

  const category = CATEGORIES.find((item) => item.id === hash);
  return category ? { type: "category", category } : { type: "dashboard" };
}

function renderDeviceHeader(category, device) {
  crumb.textContent = `‹ ${category.label}`;
  crumb.href = `#${category.id}`;
  categoryTitle.textContent = device.name;
  categoryCount.textContent = `${device.location} · ${device.ip}`;

  const reading = snapshot ? snapshot.readings.find((item) => item.device.name === device.name) : null;
  contentBadge.hidden = !reading;
  if (!reading) return;
  const states = DEVICE_STATES[reading.categoryId] || DEVICE_STATES.ups;
  contentBadge.className = `chip sev-${states[reading.state].severity}`;
  contentBadge.textContent = reading.stateLabel;
}

function render() {
  const view = currentView();
  renderNav(view);

  grid.hidden = view.type !== "category";
  dashboard.hidden = view.type !== "dashboard";
  deviceDetail.hidden = view.type !== "device";
  dashboardActions.hidden = view.type === "category";
  crumb.hidden = view.type !== "device";
  if (view.type !== "device") contentBadge.hidden = true;

  if (view.type === "dashboard") {
    const total = CATEGORIES.reduce((count, item) => count + item.devices.length, 0);
    categoryTitle.textContent = "Dashboard";
    categoryCount.textContent = `${total} perangkat dipantau`;
    renderDashboard(dashboard, snapshot);
    return;
  }

  if (view.type === "device") {
    renderDeviceHeader(view.category, view.device);
    renderDeviceDetail(deviceDetail, view.category, view.device, snapshot);
    return;
  }

  const category = view.category;
  categoryTitle.textContent = category.label;
  categoryCount.textContent = `${category.devices.length} perangkat`;
  if (renderedCategory !== category) {
    grid.replaceChildren(...category.devices.map((device) => renderCard(category, device)));
    renderedCategory = category;
  }
}

async function refreshMetrics() {
  refreshButton.disabled = true;
  try {
    snapshot = await fetchMetrics(CATEGORIES);
    syncTime.textContent = formatDateTime(snapshot.time);
    updatedAt.textContent = `Diperbarui ${formatClock(snapshot.time)}`;
  } catch {
    updatedAt.textContent = "Gagal memuat data";
  } finally {
    refreshButton.disabled = false;
    render();
  }
}

logoutButton.addEventListener("click", () => {
  clearCredentials();
  goToLogin();
});

refreshButton.addEventListener("click", refreshMetrics);
window.addEventListener("hashchange", render);

render();
refreshMetrics();
setInterval(refreshMetrics, METRICS_REFRESH_MS);
