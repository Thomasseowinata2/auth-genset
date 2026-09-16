const loginForm = document.getElementById("loginForm");
const loginError = document.getElementById("loginError");
const usernameInput = document.getElementById("username");
const passwordInput = document.getElementById("password");

loginForm.addEventListener("submit", (event) => {
  event.preventDefault();
  try {
    saveCredentials(usernameInput.value, passwordInput.value);
  } catch {
    loginError.hidden = false;
    return;
  }
  location.replace("index.html" + location.hash);
});
