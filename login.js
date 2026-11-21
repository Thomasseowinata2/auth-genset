const loginForm = document.getElementById("loginForm");
const loginError = document.getElementById("loginError");
const loginFields = document.getElementById("loginFields");
const loginDescription = document.getElementById("loginDescription");

// Satu grup field per kategori yang punya login otomatis, dibangun dari
// CATEGORIES: menambah jenis perangkat tidak perlu mengubah halaman ini.
const credentialCategories = CATEGORIES.filter((category) => category.autoLogin);

// ?need=<id kategori> dipakai saat pengguna membuka perangkat yang
// kredensialnya belum tersimpan: cukup minta kategori itu saja.
const requested = new URLSearchParams(location.search).get("need");
const requestedCategory = credentialCategories.find((category) => category.id === requested);
const missing = credentialCategories.filter((category) => !loadCredentials(category.id));
// Tanpa ?need, minta yang belum terisi; kalau semuanya sudah terisi
// (pengguna membuka halaman ini sendiri), tampilkan semua untuk diganti.
const askedCategories = requestedCategory ? [requestedCategory] : missing.length ? missing : credentialCategories;

loginDescription.textContent =
  askedCategories.length > 1
    ? "Tiap jenis perangkat punya akunnya sendiri. Kredensial di bawah dipakai otomatis hanya saat membuka web perangkat jenis itu."
    : `Masukkan kredensial ${askedCategories[0].label}, dipakai otomatis saat membuka web ${askedCategories[0].label}.`;

function credentialField(category, kind, label, type) {
  const field = document.createElement("label");
  field.className = "field";

  const caption = document.createElement("span");
  caption.className = "field-label";
  caption.textContent = label;

  const input = document.createElement("input");
  input.className = "field-input";
  input.id = `${kind}-${category.id}`;
  input.name = `${category.id}-${kind}`;
  input.type = type;
  input.required = true;
  // Dua akun berbeda dalam satu form: autofill browser gampang mengisi
  // pasangan yang salah, jadi biar diisi manual saja.
  input.autocomplete = "off";

  field.append(caption, input);
  return { field, input };
}

const inputs = new Map();

for (const category of askedCategories) {
  const group = document.createElement("fieldset");
  group.className = "cred-group";

  const legend = document.createElement("legend");
  legend.className = "cred-legend";
  legend.textContent = `Kredensial ${category.label}`;

  const username = credentialField(category, "username", "Username", "text");
  const password = credentialField(category, "password", "Password", "password");

  group.append(legend, username.field, password.field);
  loginFields.append(group);
  inputs.set(category.id, { username: username.input, password: password.input });
}

const firstInput = loginFields.querySelector(".field-input");
if (firstInput) firstInput.focus();

loginForm.addEventListener("submit", (event) => {
  event.preventDefault();
  try {
    for (const [categoryId, pair] of inputs) {
      saveCredentials(categoryId, pair.username.value, pair.password.value);
    }
  } catch {
    loginError.hidden = false;
    return;
  }
  location.replace("index.html" + location.hash);
});
