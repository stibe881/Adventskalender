requireAdminOrRedirect();

document.addEventListener("DOMContentLoaded", () => {
  const logoutBtn = document.getElementById("logout-btn");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", async () => {
      await api.logout();
      window.location.href = "/";
    });
  }

  const profileForm = document.getElementById("profile-form");
  const profileError = document.getElementById("profile-error");
  const profileSuccess = document.getElementById("profile-success");

  if (profileForm) {
    // Load current profile
    api.me().then(user => {
      if (user.username) profileForm.elements["username"].value = user.username;
      if (user.company) profileForm.elements["company"].value = user.company;
    }).catch(console.error);

    profileForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      profileError.classList.add("hidden");
      profileSuccess.classList.add("hidden");
      
      const formData = new FormData(profileForm);
      const username = formData.get("username");
      const company = formData.get("company");

      try {
        const res = await api.updateProfile(username, company);
        profileSuccess.textContent = res.message || "Profil aktualisiert.";
        profileSuccess.classList.remove("hidden");
      } catch (err) {
        profileError.textContent = err.message;
        profileError.classList.remove("hidden");
      }
    });
  }

  const cpForm = document.getElementById("change-password-form");
  const cpError = document.getElementById("pw-error");
  const cpSuccess = document.getElementById("pw-success");

  if (cpForm) {
    cpForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      cpError.classList.add("hidden");
      cpSuccess.classList.add("hidden");
      cpError.textContent = "";
      
      const formData = new FormData(cpForm);
      const currentPassword = formData.get("currentPassword");
      const newPassword = formData.get("newPassword");

      try {
        const res = await api.changePassword(currentPassword, newPassword);
        cpSuccess.textContent = res.message || "Passwort erfolgreich geändert.";
        cpSuccess.classList.remove("hidden");
        cpForm.reset();
      } catch (err) {
        cpError.textContent = err.message;
        cpError.classList.remove("hidden");
      }
    });
  }

  const showDelBtn = document.getElementById("show-delete-btn");
  const delForm = document.getElementById("delete-account-form");
  const cancelDelBtn = document.getElementById("cancel-delete-btn");
  const delError = document.getElementById("del-error");

  if (showDelBtn && delForm) {
    showDelBtn.addEventListener("click", () => {
      showDelBtn.classList.add("hidden");
      delForm.classList.remove("hidden");
    });

    cancelDelBtn.addEventListener("click", () => {
      delForm.classList.add("hidden");
      showDelBtn.classList.remove("hidden");
      delForm.reset();
      delError.classList.add("hidden");
    });

    delForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      delError.classList.add("hidden");
      
      const formData = new FormData(delForm);
      const password = formData.get("password");

      if (!confirm("Bist du sicher? Dies kann nicht rückgängig gemacht werden.")) {
        return;
      }

      try {
        await api.deleteAccount(password);
        alert("Dein Konto wurde erfolgreich gelöscht.");
        window.location.href = "/admin/";
      } catch (err) {
        delError.textContent = err.message;
        delError.classList.remove("hidden");
      }
    });
  }
});
