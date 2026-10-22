const loginView = document.querySelector("#login-view");
const settingsView = document.querySelector("#settings-view");
const message = document.querySelector("#admin-message");

function showMessage(text, type) {
  message.textContent = text;
  message.className = `admin-message ${type}`;
}

async function api(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: { "Content-Type": "application/json", ...options.headers },
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "The request could not be completed.");
  return result;
}

function populateSettings(settings) {
  const form = document.querySelector("#settings-form");
  for (const [name, value] of Object.entries(settings)) {
    const input = form.elements.namedItem(name);
    if (input?.type === "checkbox") input.checked = value === true;
    else if (input) input.value = value || "";
  }
}

async function showSettings() {
  const settings = await api("/api/admin/settings");
  populateSettings(settings);
  loginView.classList.add("hidden");
  settingsView.classList.remove("hidden");
  message.classList.add("hidden");
}

document.querySelector("#login-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    await api("/api/admin/login", {
      method: "POST",
      body: JSON.stringify({ password: event.currentTarget.elements.password.value }),
    });
    await showSettings();
  } catch (error) {
    showMessage(error.message, "error");
  }
});

document.querySelector("#settings-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const data = Object.fromEntries(new FormData(form).entries());
  data.sendConfirmation = form.elements.sendConfirmation.checked;
  try {
    await api("/api/admin/settings", { method: "PUT", body: JSON.stringify(data) });
    showMessage("Company settings saved successfully.", "success");
  } catch (error) {
    showMessage(error.message, "error");
  }
});

document.querySelector("#logout-button").addEventListener("click", async () => {
  try {
    await api("/api/admin/logout", { method: "POST", body: "{}" });
    settingsView.classList.add("hidden");
    loginView.classList.remove("hidden");
    showMessage("You have been signed out.", "success");
  } catch (error) {
    showMessage(error.message, "error");
  }
});

api("/api/admin/session")
  .then(({ authenticated }) => authenticated ? showSettings() : undefined)
  .catch((error) => showMessage(error.message, "error"));
