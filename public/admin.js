const loginView = document.querySelector("#login-view");
const dashboardView = document.querySelector("#dashboard-view");
const requestsPane = document.querySelector("#requests-pane");
const settingsPane = document.querySelector("#settings-pane");
const message = document.querySelector("#admin-message");
const requestsList = document.querySelector("#requests-list");

let currentTab = "requests";
let currentFilter = "all";
let searchQuery = "";
let requestsData = [];

const dateFormat = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

function getBackendUrl() {
  if (typeof window === "undefined") return "";
  const meta = document.querySelector('meta[name="backend-api-url"]')?.getAttribute("content");
  const globalVar = window.LEAVE_PORTAL_BACKEND_URL;
  const url = (globalVar || meta || "").trim();
  return url.replace(/\/+$/, "");
}

function resolveApiUrl(path) {
  const backend = getBackendUrl();
  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  return backend ? `${backend}${cleanPath}` : cleanPath;
}

function isStaticMode() {
  return window.location.hostname.endsWith("github.io") || window.location.protocol === "file:";
}

function showMessage(text, type = "info") {
  message.textContent = text;
  message.className = `admin-message ${type}`;
  message.classList.remove("hidden");
  if (type === "success" || type === "info") {
    setTimeout(() => {
      if (message.textContent === text) {
        message.classList.add("hidden");
      }
    }, 4500);
  }
}

async function api(path, options = {}) {
  if (isStaticMode()) {
    throw new Error("STATIC_MODE");
  }

  const backend = getBackendUrl();
  const url = resolveApiUrl(path);
  const response = await fetch(url, {
    ...options,
    credentials: "include",
    headers: { "Content-Type": "application/json", ...options.headers },
  });

  if (response.status === 405) {
    throw new Error("The configured backend does not support admin sign-in (HTTP 405). Check the backend URL and deployment.");
  }

  let result;
  try {
    result = await response.json();
  } catch {
    throw new Error(`The server returned status ${response.status}.`);
  }

  if (!response.ok) throw new Error(result.error || "The request could not be completed.");
  return result;
}

function getLocalRequests() {
  try {
    const raw = localStorage.getItem("fg_leave_requests_db");
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed;
    return Object.values(parsed);
  } catch {
    return [];
  }
}

function saveLocalRequests(list) {
  try {
    const dict = {};
    for (const req of list) {
      if (req?.reference) dict[req.reference] = req;
    }
    localStorage.setItem("fg_leave_requests_db", JSON.stringify(dict));
    localStorage.setItem("fg_leave_sync_event", String(Date.now()));
  } catch (error) {
    console.error("Could not save to localStorage:", error);
  }
}

function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatPrettyDate(isoString) {
  if (!isoString) return "—";
  try {
    const date = new Date(isoString);
    if (Number.isNaN(date.getTime())) return isoString;
    return dateFormat.format(date);
  } catch {
    return isoString;
  }
}

async function loadRequests() {
  const localList = getLocalRequests();
  let merged = [...localList];

  try {
    const serverRequests = await api("/api/admin/requests");
    if (Array.isArray(serverRequests) && serverRequests.length > 0) {
      const map = new Map();
      for (const item of localList) map.set(item.reference, item);
      for (const item of serverRequests) {
        if (!map.has(item.reference)) {
          map.set(item.reference, item);
        } else {
          // Merge prefer later decided status
          const existing = map.get(item.reference);
          map.set(item.reference, { ...existing, ...item });
        }
      }
      merged = [...map.values()];
      saveLocalRequests(merged);
    }
  } catch (err) {
    // Fall back safely to local storage
  }

  // Sort descending by submission date
  merged.sort((a, b) => new Date(b.submittedAt || 0) - new Date(a.submittedAt || 0));
  requestsData = merged;
  updateStats();
  renderRequests();
}

function updateStats() {
  const total = requestsData.length;
  const pending = requestsData.filter((r) => (r.approvalStatus || "pending") === "pending").length;
  const approved = requestsData.filter((r) => r.approvalStatus === "approved").length;
  const rejected = requestsData.filter((r) => r.approvalStatus === "rejected").length;

  const totalEl = document.querySelector("#stat-total");
  const pendingEl = document.querySelector("#stat-pending");
  const approvedEl = document.querySelector("#stat-approved");
  const rejectedEl = document.querySelector("#stat-rejected");
  const pendingBadge = document.querySelector("#pending-count-badge");
  const filterPending = document.querySelector("#filter-pending-count");

  if (totalEl) totalEl.textContent = total;
  if (pendingEl) pendingEl.textContent = pending;
  if (approvedEl) approvedEl.textContent = approved;
  if (rejectedEl) rejectedEl.textContent = rejected;
  if (pendingBadge) pendingBadge.textContent = pending;
  if (filterPending) filterPending.textContent = pending;
}

function renderRequests() {
  if (!requestsList) return;

  const filtered = requestsData.filter((req) => {
    const status = req.approvalStatus || "pending";
    if (currentFilter !== "all" && status !== currentFilter) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const name = (req.employee?.name || "").toLowerCase();
      const id = (req.employee?.id || "").toLowerCase();
      const ref = (req.reference || "").toLowerCase();
      const type = (req.employee?.leaveType || "").toLowerCase();
      const dept = (req.employee?.department || "").toLowerCase();
      if (!name.includes(q) && !id.includes(q) && !ref.includes(q) && !type.includes(q) && !dept.includes(q)) {
        return false;
      }
    }
    return true;
  });

  if (filtered.length === 0) {
    requestsList.innerHTML = `
      <div class="admin-empty-state">
        <div class="empty-icon">📋</div>
        <h3>No ${currentFilter === "all" ? "" : currentFilter + " "}requests match</h3>
        <p>${
          requestsData.length === 0
            ? "When employees submit leave letters, they will appear here in real time for approval."
            : "Try clearing your search query or choosing another filter above."
        }</p>
      </div>
    `;
    return;
  }

  requestsList.innerHTML = filtered
    .map((req) => {
      const status = req.approvalStatus || "pending";
      const statusBadge =
        status === "approved"
          ? `<span class="status-pill status-approved">✅ Approved</span>`
          : status === "rejected"
          ? `<span class="status-pill status-rejected">❌ Not Approved</span>`
          : `<span class="status-pill status-pending">⏳ Pending Review</span>`;

      const emp = req.employee || {};
      const datesText = `${escapeHtml(emp.startDate || "—")} to ${escapeHtml(emp.endDate || "—")}`;
      const letterId = `letter-${escapeHtml(req.reference || Math.random().toString())}`;

      return `
        <article class="request-card status-${status}" data-ref="${escapeHtml(req.reference)}">
          <div class="request-card-header">
            <div>
              <div class="request-card-title">
                <h3>${escapeHtml(emp.name || "Unknown Employee")}</h3>
                <span class="request-id-badge">${escapeHtml(emp.id || "ID")}</span>
                ${emp.department ? `<span class="request-dept-badge">${escapeHtml(emp.department)}</span>` : ""}
              </div>
              <div class="request-card-meta">
                <span><strong>Ref:</strong> ${escapeHtml(req.reference)}</span>
                <span>•</span>
                <span><strong>Submitted:</strong> ${formatPrettyDate(req.submittedAt)}</span>
                ${
                  emp.email
                    ? `<span>•</span><span><a href="mailto:${escapeHtml(emp.email)}" class="admin-emp-email">${escapeHtml(emp.email)}</a></span>`
                    : ""
                }
              </div>
            </div>
            <div>
              ${statusBadge}
            </div>
          </div>

          <div class="request-card-body">
            <div class="request-grid">
              <div class="request-grid-item">
                <small>Leave Type</small>
                <strong>${escapeHtml(emp.leaveType || "Leave")}</strong>
              </div>
              <div class="request-grid-item">
                <small>Duration</small>
                <strong>${escapeHtml(emp.duration || "—")}</strong>
              </div>
              <div class="request-grid-item">
                <small>Leave Dates</small>
                <strong>${datesText}</strong>
              </div>
              <div class="request-grid-item">
                <small>Decision Date</small>
                <strong>${req.decidedAt ? formatPrettyDate(req.decidedAt) : "Awaiting Review"}</strong>
              </div>
            </div>

            <div class="request-reason-callout">
              <small>Reason for Leave:</small>
              <p>${escapeHtml(emp.reason || "No reason specified.")}</p>
              ${
                emp.notes
                  ? `<div class="request-notes-box"><small>Additional Notes:</small><p>${escapeHtml(emp.notes)}</p></div>`
                  : ""
              }
              ${
                req.adminRemarks
                  ? `<div class="request-admin-remarks"><small>Admin Remarks:</small><p>${escapeHtml(req.adminRemarks)}</p></div>`
                  : ""
              }
            </div>

            <div class="request-letter-toggle-wrap">
              <button class="toggle-letter-btn button button-secondary button-sm" type="button" aria-expanded="false" data-target="${letterId}">
                📄 View Formal Letter
              </button>
            </div>

            <div id="${letterId}" class="request-letter-preview hidden">
              <div class="letter-preview-header">
                <span>FORMAL SUBMISSION LETTER</span>
                <button type="button" class="copy-card-letter-btn button-link" data-letter="${escapeHtml(req.letter || "")}">Copy Text</button>
              </div>
              <pre class="letter-content-text">${escapeHtml(req.letter || "No letter content generated.")}</pre>
            </div>
          </div>

          <div class="request-card-footer">
            <div class="decision-status-summary">
              ${
                status === "approved"
                  ? `<span class="decision-text text-approved">Approved on ${formatPrettyDate(req.decidedAt)}. Employee can download PDF.</span>`
                  : status === "rejected"
                  ? `<span class="decision-text text-rejected">Not Approved. Download PDF is disabled for employee.</span>`
                  : `<span class="decision-text text-pending">Pending decision. Employee PDF download is locked.</span>`
              }
            </div>

            <div class="request-actions">
              ${
                status === "pending"
                  ? `
                  <button class="button button-reject-btn button-sm" type="button" data-action="reject" data-ref="${escapeHtml(req.reference)}">
                    ✖ Not Approve
                  </button>
                  <button class="button button-approve-btn button-sm" type="button" data-action="approve" data-ref="${escapeHtml(req.reference)}">
                    ✔ Approve Request
                  </button>
                  `
                  : `
                  <button class="button button-secondary button-sm" type="button" data-action="reset" data-ref="${escapeHtml(req.reference)}">
                    ↺ Reset to Pending
                  </button>
                  ${
                    status === "approved"
                      ? `
                      <button class="button button-reject-btn button-sm" type="button" data-action="reject" data-ref="${escapeHtml(req.reference)}">
                        ✖ Revoke / Not Approve
                      </button>
                      `
                      : `
                      <button class="button button-approve-btn button-sm" type="button" data-action="approve" data-ref="${escapeHtml(req.reference)}">
                        ✔ Approve Request
                      </button>
                      `
                  }
                  `
              }
            </div>
          </div>
        </article>
      `;
    })
    .join("");

  attachCardEvents();
}

function attachCardEvents() {
  document.querySelectorAll(".toggle-letter-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const targetId = btn.getAttribute("data-target");
      const targetEl = document.getElementById(targetId);
      if (!targetEl) return;
      const isHidden = targetEl.classList.contains("hidden");
      targetEl.classList.toggle("hidden", !isHidden);
      btn.setAttribute("aria-expanded", String(isHidden));
      btn.textContent = isHidden ? "Hide Formal Letter" : "📄 View Formal Letter";
    });
  });

  document.querySelectorAll(".copy-card-letter-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const text = btn.getAttribute("data-letter");
      if (text) {
        try {
          await navigator.clipboard.writeText(text);
          showMessage("Letter text copied to clipboard.", "success");
        } catch {
          showMessage("Could not copy automatically.", "info");
        }
      }
    });
  });

  document.querySelectorAll(".button-approve-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const ref = btn.getAttribute("data-ref");
      await setRequestDecision(ref, "approved");
    });
  });

  document.querySelectorAll(".button-reject-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const ref = btn.getAttribute("data-ref");
      const remarks = window.prompt("Optional remarks for not approving this leave request (leave empty if none):", "");
      if (remarks === null) return; // cancelled
      await setRequestDecision(ref, "rejected", remarks.trim());
    });
  });

  document.querySelectorAll("[data-action='reset']").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const ref = btn.getAttribute("data-ref");
      await setRequestDecision(ref, "pending", "");
    });
  });
}

async function setRequestDecision(reference, status, remarks = "") {
  const req = requestsData.find((r) => r.reference === reference);
  if (!req) return;

  req.approvalStatus = status;
  req.decidedAt = status === "pending" ? null : new Date().toISOString();
  if (remarks || status === "pending") req.adminRemarks = remarks;

  // 1. Save in local database and trigger live sync
  saveLocalRequests(requestsData);

  // 2. Sync with backend if available
  try {
    await api(`/api/admin/requests/${encodeURIComponent(reference)}/status`, {
      method: "POST",
      body: JSON.stringify({ status, remarks }),
    });
  } catch (err) {
    // If running in static mode, local storage sync is primary
  }

  updateStats();
  renderRequests();

  const empName = req.employee?.name || "Employee";
  if (status === "approved") {
    showMessage(`Leave request for ${empName} has been APPROVED. The employee can now download the PDF.`, "success");
  } else if (status === "rejected") {
    showMessage(`Leave request for ${empName} was marked as NOT APPROVED.`, "error");
  } else {
    showMessage(`Leave request for ${empName} reset to Pending.`, "info");
  }
}

function switchTab(tab) {
  currentTab = tab;
  document.querySelectorAll(".admin-tab").forEach((btn) => {
    const isTab = btn.getAttribute("data-tab") === tab;
    btn.classList.toggle("active", isTab);
    btn.setAttribute("aria-selected", String(isTab));
  });

  if (tab === "requests") {
    requestsPane?.classList.remove("hidden");
    settingsPane?.classList.add("hidden");
    loadRequests();
  } else {
    requestsPane?.classList.add("hidden");
    settingsPane?.classList.remove("hidden");
  }
}

function populateSettings(settings) {
  const form = document.querySelector("#settings-form");
  if (!form) return;
  for (const [name, value] of Object.entries(settings)) {
    const input = form.elements.namedItem(name);
    if (input?.type === "checkbox") input.checked = value === true;
    else if (input) input.value = value || "";
  }
}

async function showDashboard() {
  loginView.classList.add("hidden");
  dashboardView.classList.remove("hidden");
  message.classList.add("hidden");

  // Load requests first
  await loadRequests();

  // Try to load settings
  try {
    const settings = await api("/api/admin/settings");
    populateSettings(settings);
  } catch (err) {
    // Fall back to default stored settings if in static mode
    const defaultSettings = {
      companyName: "Fuglide Innovation Intelligence Network",
      officialEmail: "fuglide@gmail.com",
      address: "Dindigul",
      managerDesignation: "T. Hariharan, the Founder and CEO",
      logoUrl: "",
    };
    populateSettings(defaultSettings);
  }
}

// Attach filter button events
document.querySelectorAll(".filter-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".filter-btn").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    currentFilter = btn.getAttribute("data-filter") || "all";
    renderRequests();
  });
});

const searchInput = document.querySelector("#admin-search-input");
if (searchInput) {
  searchInput.addEventListener("input", (e) => {
    searchQuery = (e.target.value || "").trim();
    renderRequests();
  });
}

const refreshBtn = document.querySelector("#admin-refresh-btn");
if (refreshBtn) {
  refreshBtn.addEventListener("click", () => {
    loadRequests();
    showMessage("Requests list refreshed.", "info");
  });
}

document.querySelector("#tab-requests-btn")?.addEventListener("click", () => switchTab("requests"));
document.querySelector("#tab-settings-btn")?.addEventListener("click", () => switchTab("settings"));

document.querySelector("#login-form")?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const enteredPassword = event.currentTarget.elements.password.value;
  try {
    await api("/api/admin/login", {
      method: "POST",
      body: JSON.stringify({ password: enteredPassword }),
    });
    sessionStorage.setItem("leave_admin_auth", "true");
    await showDashboard();
  } catch (error) {
    // Static mode is a browser-local demo with no backend authentication.
    if (error.message === "STATIC_MODE") {
      sessionStorage.setItem("leave_admin_auth", "true");
      await showDashboard();
      showMessage("Signed in to Administrator Portal (Static / Local Mode).", "success");
    } else {
      showMessage(error.message, "error");
    }
  }
});

document.querySelector("#settings-form")?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const data = Object.fromEntries(new FormData(form).entries());
  data.sendConfirmation = form.elements.sendConfirmation.checked;
  try {
    await api("/api/admin/settings", { method: "PUT", body: JSON.stringify(data) });
    showMessage("Company settings saved successfully.", "success");
  } catch (error) {
    if (error.message === "STATIC_MODE") {
      localStorage.setItem("fg_company_settings", JSON.stringify(data));
      showMessage("Company settings saved locally.", "success");
    } else {
      showMessage(error.message, "error");
    }
  }
});

document.querySelector("#logout-button")?.addEventListener("click", async () => {
  try {
    await api("/api/admin/logout", { method: "POST", body: "{}" });
  } catch {
    // Ignore logout errors
  }
  sessionStorage.removeItem("leave_admin_auth");
  dashboardView.classList.add("hidden");
  loginView.classList.remove("hidden");
  showMessage("You have been signed out.", "success");
});

// Cross-tab real-time sync with employee page
window.addEventListener("storage", (event) => {
  if (event.key === "fg_leave_requests_db" || event.key === "fg_leave_sync_event") {
    loadRequests();
  }
});

// Polling for live updates
setInterval(() => {
  if (!dashboardView.classList.contains("hidden")) {
    loadRequests();
  }
}, 4000);

// GitHub Pages is a browser-local demo; it has no shared server-side admin data.
if (isStaticMode()) {
  document.querySelector("#logout-button")?.classList.add("hidden");
  const syncStatus = document.querySelector("#sync-status-indicator");
  if (syncStatus) syncStatus.textContent = "Local demo - changes saved in this browser only";
  showDashboard();
} else if (sessionStorage.getItem("leave_admin_auth") === "true") {
  showDashboard();
} else {
  api("/api/admin/session")
    .then(({ authenticated }) => {
      if (authenticated) showDashboard();
    })
    .catch(() => {});
}
