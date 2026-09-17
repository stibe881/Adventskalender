(async function init() {
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get("verified") === "1") {
    const errorMsg = document.getElementById("error-msg");
    errorMsg.textContent = "E-Mail-Adresse erfolgreich bestätigt. Du kannst dich nun anmelden.";
    errorMsg.classList.remove("hidden");
    errorMsg.classList.replace("text-rose-400", "text-emerald-400");
    errorMsg.classList.replace("bg-rose-950/40", "bg-emerald-950/40");
    errorMsg.classList.replace("border-rose-900", "border-emerald-900");
  }

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
const devLoginBtn = document.getElementById("dev-login-btn");

let isRegisterMode = false;

if (devLoginBtn) {
  devLoginBtn.addEventListener("click", async () => {
    errorMsg.classList.add("hidden");
    devLoginBtn.disabled = true;
    devLoginBtn.textContent = "Bitte warten...";
    try {
      await api.devLogin();
      window.location.href = "/admin/dashboard.html";
    } catch (err) {
      errorMsg.textContent = err.message || "Bypass fehlgeschlagen.";
      errorMsg.classList.remove("hidden");
      devLoginBtn.disabled = false;
      devLoginBtn.textContent = "Admin-Bereich ohne Login betreten (Bypass)";
    }
  });
}

const formTitle = document.getElementById("form-title");
const registerFields = document.getElementById("register-fields");
const registerPasswordConfirm = document.getElementById("register-password-confirm");
const passwordConfirmInput = document.getElementById("password-confirm");

toggleBtn.addEventListener("click", () => {
  isRegisterMode = !isRegisterMode;
  if (isRegisterMode) {
    formTitle.textContent = "Neues Konto erstellen";
    submitBtn.textContent = "Registrieren";
    toggleBtn.textContent = "Schon einen Account? Zur Anmeldung";
    registerFields.classList.remove("hidden");
    registerPasswordConfirm.classList.remove("hidden");
    passwordConfirmInput.required = true;
  } else {
    formTitle.textContent = "Anmelden";
    submitBtn.textContent = "Anmelden";
    toggleBtn.textContent = "Noch keinen Account? Hier Registrieren";
    registerFields.classList.add("hidden");
    registerPasswordConfirm.classList.add("hidden");
    passwordConfirmInput.required = false;
  }
  errorMsg.classList.add("hidden");
});

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  errorMsg.classList.add("hidden");
  submitBtn.disabled = true;
  submitBtn.textContent = "Bitte warten…";

  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value;
  const username = document.getElementById("username").value.trim();
  const company = document.getElementById("company").value.trim();
  const passwordConfirm = passwordConfirmInput.value;

  try {
    if (isRegisterMode) {
      if (password !== passwordConfirm) {
        throw new Error("Die Passwörter stimmen nicht überein.");
      }
      const res = await api.register(email, password, username, company);
      
      // Switch back to login mode programmatically
      isRegisterMode = false;
      formTitle.textContent = "Anmelden";
      submitBtn.textContent = "Anmelden";
      toggleBtn.textContent = "Noch keinen Account? Hier Registrieren";
      registerFields.classList.add("hidden");
      registerPasswordConfirm.classList.add("hidden");
      passwordConfirmInput.required = false;

      // Show success message
      errorMsg.textContent = "Bitte überprüfe deine E-Mails, um deinen Account zu aktivieren.";
      errorMsg.classList.remove("hidden");
      errorMsg.classList.replace("text-rose-400", "text-emerald-400");
      errorMsg.classList.replace("bg-rose-950/40", "bg-emerald-950/40");
      errorMsg.classList.replace("border-rose-900", "border-emerald-900");
      
      submitBtn.disabled = false;
      
      // Clear all fields
      document.getElementById("password").value = "";
      passwordConfirmInput.value = "";
      document.getElementById("username").value = "";
      document.getElementById("company").value = "";
    } else {
      await api.login(email, password);
      window.location.href = "/admin/dashboard.html";
    }
  } catch (err) {
    errorMsg.textContent = err.message || "Aktion fehlgeschlagen.";
    errorMsg.classList.remove("hidden");
    errorMsg.classList.replace("text-emerald-400", "text-rose-400");
    errorMsg.classList.replace("bg-emerald-950/40", "bg-rose-950/40");
    errorMsg.classList.replace("border-emerald-900", "border-rose-900");
    submitBtn.disabled = false;
    submitBtn.textContent = isRegisterMode ? "Registrieren" : "Anmelden";
  }
});
