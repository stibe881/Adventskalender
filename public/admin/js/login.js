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

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  errorMsg.classList.add("hidden");
  submitBtn.disabled = true;
  submitBtn.textContent = "Anmelden…";

  const username = document.getElementById("username").value.trim();
  const password = document.getElementById("password").value;

  try {
    await api.login(username, password);
    window.location.href = "/admin/dashboard.html";
  } catch (err) {
    errorMsg.textContent = err.message || "Login fehlgeschlagen.";
    errorMsg.classList.remove("hidden");
    submitBtn.disabled = false;
    submitBtn.textContent = "Anmelden";
  }
});
