const CREDENTIALS_KEY = "auth-genset:genset-credentials";

function loadCredentials() {
  try {
    const stored = JSON.parse(sessionStorage.getItem(CREDENTIALS_KEY));
    if (stored && typeof stored.username === "string" && typeof stored.password === "string") {
      return stored;
    }
  } catch {}
  return null;
}

function saveCredentials(username, password) {
  sessionStorage.setItem(CREDENTIALS_KEY, JSON.stringify({ username, password }));
}

function clearCredentials() {
  try {
    sessionStorage.removeItem(CREDENTIALS_KEY);
  } catch {}
}
