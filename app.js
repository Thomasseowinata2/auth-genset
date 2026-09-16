const nav = document.getElementById("nav");
const grid = document.getElementById("deviceGrid");
const categoryTitle = document.getElementById("categoryTitle");
const categoryCount = document.getElementById("categoryCount");
const gensetLoginForm = document.getElementById("gensetLoginForm");
const gensetUsername = document.getElementById("gensetUsername");
const gensetPassword = document.getElementById("gensetPassword");
const logoutButton = document.getElementById("logoutButton");

function goToLogin() {
  location.replace("login.html" + location.hash);
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

function openWithAutoLogin(category, device) {
  const credentials = loadCredentials();
  if (!credentials) {
    goToLogin();
    return;
  }
  gensetLoginForm.action = deviceUrl(category, device);
  gensetUsername.name = category.loginFields.username;
  gensetUsername.value = credentials.username;
  gensetPassword.name = category.loginFields.password;
  gensetPassword.value = credentials.password;
  gensetLoginForm.submit();
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

  if (category.autoLogin) {
    card.addEventListener("click", (event) => {
      // Ctrl/Shift/Cmd-click keeps plain link behavior (open without logging in).
      if (event.ctrlKey || event.metaKey || event.shiftKey) return;
      event.preventDefault();
      openWithAutoLogin(category, device);
    });
  }

  return card;
}

function renderNav(activeCategory) {
  nav.replaceChildren(
    ...CATEGORIES.map((category) => {
      const item = element("a", "nav-item");
      item.href = `#${category.id}`;
      if (category === activeCategory) item.setAttribute("aria-current", "page");
      item.append(element("span", "", category.label), element("span", "nav-count", String(category.devices.length)));
      return item;
    })
  );
}

function render() {
  const hashId = location.hash.slice(1);
  const category = CATEGORIES.find((c) => c.id === hashId) || CATEGORIES[0];

  renderNav(category);
  categoryTitle.textContent = category.label;
  categoryCount.textContent = `${category.devices.length} perangkat`;
  grid.replaceChildren(...category.devices.map((device) => renderCard(category, device)));
}

logoutButton.addEventListener("click", () => {
  clearCredentials();
  goToLogin();
});

window.addEventListener("hashchange", render);
render();
