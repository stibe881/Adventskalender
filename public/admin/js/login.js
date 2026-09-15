(async function init() {
  // Already logged in? Skip straight to dashboard.
  try {
    await api.me();
    window.location.href = "/admin/dashboard.html";
  } catch (_) {
    /* not logged in, stay on this page */
  }
})();

const form = document.getElementById("login-form");
const errorMsg = document.getElementById("error-msg");
const submitBtn = document.getElementById("submit-btn");
const toggleBtn = document.getElementById("toggle-mode-btn");

let isRegisterMode = false;

toggleBtn.addEventListener("click", () => {
  isRegisterMode = !isRegisterMode;
  if (isRegisterMode) {
    submitBtn.textContent = "Registrieren";
    toggleBtn.textContent = "Schon einen Account? Anmelden";
  } else {
    submitBtn.textContent = "Anmelden";
    toggleBtn.textContent = "Noch keinen Account? Registrieren";
  }
  errorMsg.classList.add("hidden");
});

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  errorMsg.classList.add("hidden");
  submitBtn.disabled = true;
  submitBtn.textContent = "Bitte warten…";

  const username = document.getElementById("username").value.trim();
  const password = document.getElementById("password").value;

  try {
    if (isRegisterMode) {
      await api.register(username, password);
    } else {
      await api.login(username, password);
    }
    window.location.href = "/admin/dashboard.html";
  } catch (err) {
    errorMsg.textContent = err.message || "Aktion fehlgeschlagen.";
    errorMsg.classList.remove("hidden");
    submitBtn.disabled = false;
    submitBtn.textContent = isRegisterMode ? "Registrieren" : "Anmelden";
  }
});
