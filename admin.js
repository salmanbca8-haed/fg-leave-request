const loginView = document.querySelector("#login-view");
const settingsView = document.querySelector("#settings-view");
const message = document.querySelector("#admin-message");
const backendInput = document.querySelector("#backend-url-input");

function getBackendUrl() {
  if (typeof window === "undefined") return "";
  const meta = document.querySelector('meta[name="backend-api-url"]')?.getAttribute("content");
  const stored = window.localStorage ? window.localStorage.getItem("leave_portal_backend_url") : null;
  const globalVar = window.LEAVE_PORTAL_BACKEND_URL;
  const url = (globalVar || stored || meta || "").trim();
  return url.replace(/\/+$/, "");
}

function setBackendUrl(url) {
  if (window.localStorage) {
    if (url) window.localStorage.setItem("leave_portal_backend_url", url);
    else window.localStorage.removeItem("leave_portal_backend_url");
  }
}

function resolveApiUrl(path) {
  const backend = getBackendUrl();
  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  return backend ? `${backend}${cleanPath}` : cleanPath;
}

function showMessage(text, type) {
  message.textContent = text;
  message.className = `admin-message ${type}`;
  message.classList.remove("hidden");
}

async function api(path, options = {}) {
  const backend = getBackendUrl();
  const isStaticHost = window.location.hostname.endsWith("github.io") || window.location.protocol === "file:";

  if (!backend && isStaticHost) {
    throw new Error("This static portal is not connected to a backend server. To manage company settings, deploy the Node.js backend to a host like Render or Railway and enter its HTTPS URL below.");
  }

  const url = resolveApiUrl(path);
  const response = await fetch(url, {
    ...options,
    credentials: "include",
    headers: { "Content-Type": "application/json", ...options.headers },
  });

  let result;
  try {
    result = await response.json();
  } catch {
    throw new Error(`The server returned status ${response.status}. Please check your backend URL and CORS settings.`);
  }

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

if (backendInput) {
  backendInput.value = getBackendUrl();
}

document.querySelector("#login-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (backendInput) {
    const enteredBackend = backendInput.value.trim().replace(/\/+$/, "");
    setBackendUrl(enteredBackend);
  }
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

const isStatic = window.location.hostname.endsWith("github.io") || window.location.protocol === "file:";
if (!getBackendUrl() && isStatic) {
  showMessage("Static hosting mode: To sign in, configure your separately hosted HTTPS backend URL below.", "info");
} else {
  api("/api/admin/session")
    .then(({ authenticated }) => authenticated ? showSettings() : undefined)
    .catch((error) => {
      if (getBackendUrl()) showMessage(error.message, "error");
    });
}
