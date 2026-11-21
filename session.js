// Tiap jenis perangkat punya akun sendiri (UPS beda dari genset), tapi akunnya
// sama untuk semua perangkat dalam satu jenis. Jadi kredensial disimpan sebagai
// satu peta { <id kategori>: { username, password } }: kategori baru tinggal
// menambah entri, tidak perlu kunci penyimpanan baru.
const CREDENTIALS_KEY = "auth-genset:credentials";
// Kunci versi lama yang hanya menyimpan satu pasang kredensial (genset).
const LEGACY_CREDENTIALS_KEY = "auth-genset:genset-credentials";

function isCredentialPair(value) {
  return Boolean(value) && typeof value.username === "string" && typeof value.password === "string";
}

function writeCredentialStore(store) {
  sessionStorage.setItem(CREDENTIALS_KEY, JSON.stringify(store));
}

// Sesi yang dibuka sebelum portal mengenal kredensial per kategori tetap
// dipakai: isinya dulu selalu kredensial genset.
function migrateLegacyCredentials() {
  try {
    const legacy = JSON.parse(sessionStorage.getItem(LEGACY_CREDENTIALS_KEY));
    if (isCredentialPair(legacy)) {
      const store = { genset: { username: legacy.username, password: legacy.password } };
      writeCredentialStore(store);
      sessionStorage.removeItem(LEGACY_CREDENTIALS_KEY);
      return store;
    }
  } catch {}
  return {};
}

function readCredentialStore() {
  try {
    const stored = JSON.parse(sessionStorage.getItem(CREDENTIALS_KEY));
    if (stored && typeof stored === "object") return stored;
  } catch {}
  return migrateLegacyCredentials();
}

function loadCredentials(categoryId) {
  const pair = readCredentialStore()[categoryId];
  return isCredentialPair(pair) ? pair : null;
}

function saveCredentials(categoryId, username, password) {
  const store = readCredentialStore();
  store[categoryId] = { username, password };
  writeCredentialStore(store);
}

// Portal boleh dibuka begitu ada satu kredensial: operator yang cuma pegang UPS
// tidak dipaksa mengisi akun genset. Kredensial yang belum ada baru diminta
// saat perangkat jenis itu dibuka.
function hasAnyCredentials() {
  const store = readCredentialStore();
  return Object.keys(store).some((id) => isCredentialPair(store[id]));
}

function clearCredentials() {
  try {
    sessionStorage.removeItem(CREDENTIALS_KEY);
    sessionStorage.removeItem(LEGACY_CREDENTIALS_KEY);
  } catch {}
}
