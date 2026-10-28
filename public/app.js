const form = document.querySelector("#leave-form");
const previewSection = document.querySelector("#preview-section");
const successSection = document.querySelector("#success-section");
const letterPreview = document.querySelector("#letter-preview");
const notice = document.querySelector("#notice");
const formErrors = document.querySelector("#form-errors");
const durationValue = document.querySelector("#duration-value");
const dateFormat = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
const timeFormat = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
const leaveRecipient = "fuglide@gmail.com";

let currentRequest = null;
let statusPollTimer = null;

const previewTemplate = `From:

{{employeeName}}
Employee ID: {{employeeId}}
{{departmentLine}}{{employeeEmail}}

To:

{{managerDesignation}}
{{companyName}}
{{companyAddress}}

Subject: Request for Leave from {{startDate}} to {{endDate}}

Respected Sir,

I am writing to formally request leave from {{startDate}} to {{endDate}}, for a total duration of {{duration}}.

The reason for my leave is as follows:

{{reason}}
{{notesBlock}}I kindly request you to consider my situation and approve my leave for the above-mentioned period. I will make the necessary arrangements to ensure that my responsibilities and pending tasks are managed appropriately during my absence.

Please let me know if any additional information or documentation is required. I would be grateful for your consideration and approval of this request.

Thank you for your time and understanding.

Yours sincerely,

{{employeeName}}
Employee ID: {{employeeId}}
{{signatureDepartmentLine}}Date of Submission: {{submissionDate}}`;

let company = {
  companyName: "Fuglide Innovation Intelligence Network",
  address: "Dindigul",
  managerDesignation: "T. Hariharan, the Founder and CEO",
  logoUrl: "",
  template: previewTemplate,
};

function fieldValue(name) {
  return form.elements.namedItem(name).value.trim();
}

function prettyDate(value) {
  if (!value) return "[Leave date]";
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? "[Leave date]" : dateFormat.format(date);
}

function calendarDays(start, end) {
  if (!start || !end || end < start) return 0;
  return Math.floor((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86400000) + 1;
}

function durationText() {
  const unit = fieldValue("unit");
  const days = calendarDays(fieldValue("startDate"), fieldValue("endDate"));
  if (!days) return "Choose your dates to calculate leave duration";
  if (unit === "half-day") return days === 1 ? "0.5 day (half-day)" : "Half day — select the same start and end date";
  if (unit === "hours") {
    const hours = fieldValue("hours");
    return days === 1 ? `${hours || "—"} hours` : "Hours-based leave must be for a single date";
  }
  return `${days} calendar ${days === 1 ? "day" : "days"}`;
}

function updateDuration() {
  durationValue.textContent = durationText();
  document.querySelector("#hours-field").classList.toggle("hidden", fieldValue("unit") !== "hours");
  updateLetter();
}

function createLetter() {
  if (!company.template) return "Loading the company leave letter template…";
  const name = fieldValue("name") || "[Employee Full Name]";
  const id = fieldValue("id") || "[Employee ID]";
  const email = fieldValue("email") || "[Employee Email Address]";
  const department = fieldValue("department");
  const start = prettyDate(fieldValue("startDate"));
  const end = prettyDate(fieldValue("endDate"));
  const reason = fieldValue("reason") || "[Employee's Reason for Leave]";
  const notes = fieldValue("notes");
  const duration = durationText();
  const replacements = {
    employeeName: name,
    employeeId: id,
    departmentLine: department ? `${department}\n` : "",
    employeeEmail: email,
    managerDesignation: company.managerDesignation,
    companyName: company.companyName || "[Company Name]",
    companyAddress: company.address || "[Company Official Address]",
    startDate: start,
    endDate: end,
    duration,
    reason,
    notesBlock: notes ? `Additional notes:\n${notes}\n\n` : "",
    signatureDepartmentLine: department ? `${department}\n` : "",
    submissionDate: dateFormat.format(new Date()),
  };
  return company.template.replace(/\{\{([A-Za-z]+)\}\}/g, (placeholder, key) => replacements[key] ?? placeholder);
}

function updateLetter() {
  letterPreview.textContent = createLetter();
}

function clearValidation() {
  formErrors.classList.add("hidden");
  formErrors.textContent = "";
  form.querySelectorAll("[aria-invalid='true']").forEach((field) => field.removeAttribute("aria-invalid"));
}

function validateForm() {
  clearValidation();
  const errors = {};
  const start = fieldValue("startDate");
  const end = fieldValue("endDate");
  const days = calendarDays(start, end);
  if (!fieldValue("name")) errors.name = "Enter your full name.";
  if (!fieldValue("id")) errors.id = "Enter your employee ID.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fieldValue("email"))) errors.email = "Enter a valid email address.";
  if (!start) errors.startDate = "Choose a start date.";
  if (!end) errors.endDate = "Choose an end date.";
  if (start && end && end < start) errors.endDate = "The end date cannot be earlier than the start date.";
  if (!fieldValue("leaveType")) errors.leaveType = "Choose a leave type.";
  if (!fieldValue("reason")) errors.reason = "Tell us the reason for your leave.";
  if (fieldValue("unit") === "half-day" && days !== 1) errors.unit = "A half-day request must be for a single date.";
  if (fieldValue("unit") === "hours") {
    if (days !== 1) errors.unit = "An hours-based request must be for a single date.";
    const hours = Number(fieldValue("hours"));
    if (!Number.isFinite(hours) || hours <= 0 || hours > 24) errors.hours = "Enter between 0.5 and 24 hours.";
  }
  for (const [name, message] of Object.entries(errors)) {
    const field = form.elements.namedItem(name);
    field?.setAttribute("aria-invalid", "true");
    field?.setAttribute("aria-describedby", "form-errors");
  }
  if (Object.keys(errors).length) {
    formErrors.textContent = Object.values(errors).join(" ");
    formErrors.classList.remove("hidden");
    form.querySelector("[aria-invalid='true']")?.focus();
    return false;
  }
  return true;
}

function getBackendUrl() {
  if (typeof window === "undefined") return "";
  const meta = document.querySelector('meta[name="backend-api-url"]')?.getAttribute("content");
  const globalVar = window.LEAVE_PORTAL_BACKEND_URL;
  const url = (globalVar || meta || "").trim();
  return url.replace(/\/+$/, "");
}

function isBrowserLocalMode() {
  return window.location.hostname.endsWith("github.io") || window.location.protocol === "file:";
}

function applyCompanySettings(data) {
  company = { ...company, ...data };
  const companyName = company.companyName || "Fuglide Innovation Intelligence Network";
  const brandName = document.querySelector("#brand-name");
  const footerCompanyName = document.querySelector("#footer-company-name");
  if (brandName) brandName.textContent = companyName;
  if (footerCompanyName) footerCompanyName.textContent = companyName;
  const logo = document.querySelector("#company-logo");
  const mark = document.querySelector(".brand-mark");
  if (company.logoUrl && logo && mark) {
    logo.src = company.logoUrl;
    logo.alt = `${companyName} logo`;
    logo.referrerPolicy = "no-referrer";
    logo.classList.remove("hidden");
    mark.querySelector("svg")?.classList.add("hidden");
  }
  updateLetter();
}

async function loadCompany() {
  const backend = getBackendUrl();
  if (isBrowserLocalMode()) {
    try {
      const stored = localStorage.getItem("fg_company_settings");
      if (stored) applyCompanySettings(JSON.parse(stored));
      else applyCompanySettings(company);
    } catch {
      applyCompanySettings(company);
    }
    return;
  }

  const endpoint = backend ? `${backend}/api/settings` : "/api/settings";
  try {
    const response = await fetch(endpoint);
    if (!response.ok) throw new Error();
    const data = await response.json();
    applyCompanySettings(data);
  } catch {
    applyCompanySettings(company);
  }
}

function showNotice(message, type) {
  let toast = document.querySelector("#portal-toast");
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "portal-toast";
    toast.className = "portal-toast";
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.className = `portal-toast ${type} show`;
  setTimeout(() => {
    toast.classList.remove("show");
  }, 4500);
}

function showPreview() {
  if (!validateForm()) return;
  updateLetter();
  form.closest(".portal-layout").classList.add("hidden");
  document.querySelector(".intro").classList.add("hidden");
  previewSection.classList.remove("hidden");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function saveBrowserPdf(letter, filename, approvalDetails = null) {
  const JsPDF = window.jspdf?.jsPDF;
  if (!JsPDF) throw new Error("PDF generator could not be loaded. Refresh the page and try again.");

  let fullContent = letter;
  if (approvalDetails && approvalDetails.approvalStatus === "approved") {
    fullContent += `\n\n--------------------------------------------------------------------------------\nOFFICIAL LEAVE APPROVAL ENDORSEMENT\nStatus        : APPROVED BY ADMINISTRATION\nReference ID  : ${approvalDetails.reference}\nDecision Date : ${approvalDetails.decidedAt ? timeFormat.format(new Date(approvalDetails.decidedAt)) : dateFormat.format(new Date())}\nAuthority     : ${company.managerDesignation || "Fuglide Administration"}\nOrganization  : ${company.companyName}\n--------------------------------------------------------------------------------`;
  }

  const pdf = new JsPDF({ unit: "pt", format: "a4" });
  const margin = 56;
  const lineHeight = 16;
  const pageHeight = pdf.internal.pageSize.getHeight();
  const contentWidth = pdf.internal.pageSize.getWidth() - margin * 2;
  const lines = pdf.splitTextToSize(fullContent, contentWidth);
  let y = margin;

  pdf.setFont("times", "normal");
  pdf.setFontSize(11);
  for (const line of lines) {
    if (y + lineHeight > pageHeight - margin) {
      pdf.addPage();
      y = margin;
    }
    pdf.text(line, margin, y);
    y += lineHeight;
  }
  pdf.save(filename);
}

document.querySelector("#preview-button").addEventListener("click", showPreview);
document.querySelector("#edit-button").addEventListener("click", () => {
  previewSection.classList.add("hidden");
  form.closest(".portal-layout").classList.remove("hidden");
  document.querySelector(".intro").classList.remove("hidden");
  window.scrollTo({ top: 0, behavior: "smooth" });
});

document.querySelector("#download-draft").addEventListener("click", async () => {
  const button = document.querySelector("#download-draft");
  button.disabled = true;
  try {
    saveBrowserPdf(letterPreview.textContent, "leave-letter-preview.pdf");
    showNotice("Draft preview PDF downloaded.", "info");
  } catch (error) {
    showNotice(error.message, "error");
  } finally {
    button.disabled = false;
  }
});

// Download Final Letter Button Handler
document.querySelector("#download-final").addEventListener("click", () => {
  if (!currentRequest) {
    showNotice("No leave request record found. Please submit a request first.", "error");
    return;
  }

  if (currentRequest.approvalStatus !== "approved") {
    showNotice("This leave letter has not been approved by the admin yet. The download will unlock once approved.", "error");
    return;
  }

  try {
    const filename = `${currentRequest.reference}-approved.pdf`;
    saveBrowserPdf(currentRequest.letter || letterPreview.textContent, filename, currentRequest);
    showNotice("Official approved leave letter PDF downloaded successfully!", "success");
  } catch (error) {
    showNotice(error.message, "error");
  }
});

document.querySelector("#home-button").addEventListener("click", () => window.location.reload());

form.addEventListener("input", (event) => {
  if (event.target.matches("input[type='date'], select[name='unit'], input[name='hours']")) updateDuration();
  else updateLetter();
});
form.addEventListener("change", updateDuration);

function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function populateReceipt(details) {
  const receipt = document.querySelector("#receipt");
  if (!receipt) return;
  receipt.innerHTML = `
    <div class="receipt-item">
      <small>Reference Number</small>
      <strong style="color: var(--secondary-light, #ffd07a); font-family: monospace;">${escapeHtml(details.reference)}</strong>
    </div>
    <div class="receipt-item">
      <small>Employee Name</small>
      <strong>${escapeHtml(details.name)}</strong>
    </div>
    <div class="receipt-item">
      <small>Employee ID</small>
      <strong>${escapeHtml(details.id)}</strong>
    </div>
    <div class="receipt-item">
      <small>Work Email</small>
      <strong>${escapeHtml(details.email)}</strong>
    </div>
    <div class="receipt-item">
      <small>Leave Period</small>
      <strong>${escapeHtml(details.dates)}</strong>
    </div>
    <div class="receipt-item">
      <small>Duration &amp; Type</small>
      <strong>${escapeHtml(details.duration)} (${escapeHtml(details.leaveType)})</strong>
    </div>
    <div class="receipt-item">
      <small>Submission Time</small>
      <strong>${escapeHtml(details.time)}</strong>
    </div>
    <div class="receipt-item">
      <small>Approval Status</small>
      <strong id="receipt-status-val" class="receipt-status-pill status-${details.status || 'pending'}">
        ${
          details.status === "approved"
            ? "Approved by Admin"
            : details.status === "rejected"
            ? "Not Approved"
            : "Pending Admin Approval"
        }
      </strong>
    </div>
  `;
}

// Generate unique reference string
function generateReference() {
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  let randHex = "";
  try {
    const bytes = new Uint8Array(6);
    crypto.getRandomValues(bytes);
    randHex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("").toUpperCase();
  } catch {
    randHex = Math.random().toString(16).slice(2, 14).toUpperCase();
  }
  return `LR-${dateStr}-${randHex}`;
}

// Save to shared localStorage database for immediate cross-tab sync with Admin Portal
function saveRequestToLocalDb(request) {
  try {
    const raw = localStorage.getItem("fg_leave_requests_db");
    const db = raw ? JSON.parse(raw) : {};
    db[request.reference] = request;
    localStorage.setItem("fg_leave_requests_db", JSON.stringify(db));
    localStorage.setItem("fg_last_ref", request.reference);
    localStorage.setItem("fg_leave_sync_event", String(Date.now()));
    return true;
  } catch (err) {
    console.error("Could not write to local storage:", err);
    return false;
  }
}

// Fetch request from local or server
async function fetchLatestRequest(reference) {
  let localReq = null;
  try {
    const raw = localStorage.getItem("fg_leave_requests_db");
    if (raw) {
      const db = JSON.parse(raw);
      localReq = db[reference] || null;
    }
  } catch {}

  if (isBrowserLocalMode()) return localReq;

  const backend = getBackendUrl();
  const endpoint = backend
    ? `${backend}/api/requests/${encodeURIComponent(reference)}/status`
    : `/api/requests/${encodeURIComponent(reference)}/status`;

  try {
    const res = await fetch(endpoint);
    if (res.ok) {
      const serverData = await res.json();
      return { ...localReq, ...serverData };
    }
  } catch {}

  return localReq;
}

// Update the Employee Success View based on approval status
function updateApprovalUI(req) {
  if (!req) return;
  currentRequest = req;

  const status = req.approvalStatus || "pending";
  const card = document.querySelector("#approval-status-card");
  const icon = document.querySelector("#status-icon");
  const tag = document.querySelector("#status-tag");
  const refTag = document.querySelector("#status-ref-tag");
  const title = document.querySelector("#status-title");
  const desc = document.querySelector("#status-desc");
  const adminNote = document.querySelector("#status-admin-note");
  const downloadBtn = document.querySelector("#download-final");
  const downloadHint = document.querySelector("#download-hint");
  const receiptStatus = document.querySelector("#receipt-status-val");
  const pulseText = document.querySelector("#status-pulse-text");

  if (refTag) refTag.textContent = `Ref: ${req.reference}`;

  if (card) {
    card.classList.remove("status-pending", "status-approved", "status-rejected");
    card.classList.add(`status-${status}`);
  }

  if (receiptStatus) {
    receiptStatus.className = `receipt-status-pill status-${status}`;
    receiptStatus.textContent =
      status === "approved"
        ? "Approved by Admin"
        : status === "rejected"
        ? "Not Approved"
        : "Pending Admin Approval";
  }

  if (status === "approved") {
    if (icon) icon.textContent = "✅";
    if (tag) tag.textContent = "APPROVED BY ADMIN";
    if (title) title.textContent = "Leave Request Approved!";
    const dateStr = req.decidedAt ? timeFormat.format(new Date(req.decidedAt)) : "Recently";
    if (desc) {
      desc.innerHTML = `Great news! The administrator has <strong>APPROVED</strong> your leave request on <strong>${dateStr}</strong>. You can now download your official approved leave letter PDF below.`;
    }
    if (pulseText) pulseText.textContent = `Approved by Administration · Ready for PDF download.`;

    if (downloadBtn) {
      downloadBtn.disabled = false;
      downloadBtn.className = "button button-primary button-approved";
      downloadBtn.innerHTML = `📥 Download Approved Letter PDF`;
      downloadBtn.title = "Download your official approved letter PDF";
    }

    if (downloadHint) {
      downloadHint.textContent = `✔ Your leave letter is approved. Click the green "Download Approved Letter PDF" button above to save your document.`;
      downloadHint.style.color = "var(--secondary-light, #ffd07a)";
    }

    if (adminNote) {
      if (req.adminRemarks) {
        adminNote.innerHTML = `<strong>Admin Remarks:</strong> ${escapeHtml(req.adminRemarks)}`;
        adminNote.classList.remove("hidden");
      } else {
        adminNote.classList.add("hidden");
      }
    }
  } else if (status === "rejected") {
    if (icon) icon.textContent = "❌";
    if (tag) tag.textContent = "NOT APPROVED";
    if (title) title.textContent = "Leave Request Not Approved";
    if (desc) {
      desc.innerHTML = `The administrator has reviewed and <strong>NOT APPROVED</strong> your leave request. The PDF download remains disabled.`;
    }
    if (pulseText) pulseText.textContent = `Decision Received: Not approved by administrator.`;

    if (downloadBtn) {
      downloadBtn.disabled = true;
      downloadBtn.className = "button button-secondary button-locked button-rejected";
      downloadBtn.innerHTML = `🔒 Download letter PDF (Not Approved)`;
      downloadBtn.title = "This leave request was not approved by the admin.";
    }

    if (downloadHint) {
      downloadHint.textContent = `This request was not approved by administration. Please consult your reporting manager for further details.`;
      downloadHint.style.color = "#fca5a5";
    }

    if (adminNote) {
      if (req.adminRemarks) {
        adminNote.innerHTML = `<strong>Admin Remarks:</strong> ${escapeHtml(req.adminRemarks)}`;
        adminNote.classList.remove("hidden");
      } else {
        adminNote.classList.add("hidden");
      }
    }
  } else {
    // Pending
    if (icon) icon.textContent = "⏳";
    if (tag) tag.textContent = "PENDING ADMIN APPROVAL";
    if (title) title.textContent = "Awaiting Administrator Approval";
    if (desc) {
      desc.innerHTML = isBrowserLocalMode()
        ? `This request is saved only in this browser. To review it, open the Admin Portal in this same browser at the same website address. It is not shared with other browsers or devices.`
        : `Your letter has been sent to the Admin. The <strong>"Download letter PDF"</strong> button below is disabled and will automatically unlock as soon as the admin approves your request.`;
    }
    if (pulseText) {
      pulseText.textContent = isBrowserLocalMode()
        ? `Browser-only demo · Requests are not synced to a shared admin inbox`
        : `Live Sync Active · Waiting for admin decision in Admin Portal…`;
    }

    if (downloadBtn) {
      downloadBtn.disabled = true;
      downloadBtn.className = "button button-secondary button-locked";
      downloadBtn.innerHTML = `🔒 Download letter PDF (Pending Approval)`;
      downloadBtn.title = "PDF download will unlock once the administrator approves your leave request.";
    }

    if (downloadHint) {
      downloadHint.textContent = `Notice: The "Download letter PDF" button will automatically unlock and turn green when the admin approves your request.`;
      downloadHint.style.color = "var(--text-dim)";
    }

    if (adminNote) adminNote.classList.add("hidden");
  }
}

// Live polling for status
async function checkCurrentRequestStatus(notify = false) {
  if (!currentRequest?.reference) return;
  const updated = await fetchLatestRequest(currentRequest.reference);
  if (updated) {
    const prevStatus = currentRequest.approvalStatus;
    updateApprovalUI(updated);
    if (notify && updated.approvalStatus !== prevStatus) {
      if (updated.approvalStatus === "approved") {
        showNotice("Congratulations! Your leave letter has been approved by the Admin!", "success");
      } else if (updated.approvalStatus === "rejected") {
        showNotice("Your leave letter was not approved by the Admin.", "error");
      }
    }
  }
}

function startStatusPolling() {
  if (statusPollTimer) clearInterval(statusPollTimer);
  statusPollTimer = setInterval(() => {
    if (currentRequest && currentRequest.approvalStatus === "pending") {
      checkCurrentRequestStatus(true);
    }
  }, 2500);
}

// Storage event listener for instantaneous cross-tab updates from Admin Portal
window.addEventListener("storage", (event) => {
  if (event.key === "fg_leave_requests_db" || event.key === "fg_leave_sync_event") {
    if (currentRequest?.reference) {
      checkCurrentRequestStatus(true);
    }
  }
});

// Manual Refresh Status button in card
document.querySelector("#check-status-btn")?.addEventListener("click", async () => {
  const btn = document.querySelector("#check-status-btn");
  btn.disabled = true;
  await checkCurrentRequestStatus(false);
  setTimeout(() => {
    btn.disabled = false;
  }, 600);
  if (currentRequest?.approvalStatus === "approved") {
    showNotice("Status verified: Approved by Admin!", "success");
  } else if (currentRequest?.approvalStatus === "rejected") {
    showNotice("Status verified: Not Approved.", "info");
  } else {
    showNotice("Status checked: Still pending administrator review.", "info");
  }
});

// Send Button: submits to Admin and opens success view
document.querySelector("#send-button").addEventListener("click", (event) => {
  if (!validateForm()) {
    previewSection.classList.add("hidden");
    form.closest(".portal-layout").classList.remove("hidden");
    document.querySelector(".intro").classList.remove("hidden");
    window.scrollTo({ top: 0, behavior: "smooth" });
    return;
  }

  const employeeName = fieldValue("name");
  const employeeId = fieldValue("id");
  const employeeEmail = fieldValue("email");
  const department = fieldValue("department");
  const startVal = fieldValue("startDate");
  const endVal = fieldValue("endDate");
  const leaveTypeVal = fieldValue("leaveType");
  const unitVal = fieldValue("unit");
  const hoursVal = unitVal === "hours" ? fieldValue("hours") : "";
  const reasonVal = fieldValue("reason");
  const notesVal = fieldValue("notes");
  const datesText = `${prettyDate(startVal)} to ${prettyDate(endVal)}`;
  const durationVal = durationText();
  const letterText = letterPreview.textContent;

  const reference = generateReference();
  const submittedAt = new Date().toISOString();

  // Create full request object
  const requestRecord = {
    reference,
    employee: {
      name: employeeName,
      id: employeeId,
      email: employeeEmail,
      department,
      startDate: startVal,
      endDate: endVal,
      leaveType: leaveTypeVal,
      unit: unitVal,
      hours: hoursVal,
      duration: durationVal,
      reason: reasonVal,
      notes: notesVal,
    },
    letter: letterText,
    submittedAt,
    approvalStatus: "pending",
    decidedAt: null,
    adminRemarks: "",
  };

  currentRequest = requestRecord;

  // 1. Save locally for same-browser demo use and cross-tab updates.
  const savedLocally = saveRequestToLocalDb(requestRecord);
  if (!savedLocally && isBrowserLocalMode()) {
    showNotice("The request could not be saved in this browser. Check browser storage settings and try again.", "error");
    return;
  }

  // 2. Also send to server API if available
  const backend = getBackendUrl();
  if (!isBrowserLocalMode()) {
    const submitUrl = backend ? `${backend}/api/requests` : "/api/requests";
    fetch(submitUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": crypto.randomUUID ? crypto.randomUUID() : reference,
      },
      body: JSON.stringify({
        name: employeeName,
        id: employeeId,
        email: employeeEmail,
        department,
        startDate: startVal,
        endDate: endVal,
        leaveType: leaveTypeVal,
        unit: unitVal,
        hours: hoursVal ? Number(hoursVal) : undefined,
        reason: reasonVal,
        notes: notesVal,
      }),
    })
      .then(async (res) => {
        if (res.ok) {
          const data = await res.json();
          if (data.reference) {
            requestRecord.reference = data.reference;
            saveRequestToLocalDb(requestRecord);
          }
        }
      })
      .catch(() => {
        // Local database is already stored safely
      });
  }

  // 3. Prepare optional Gmail draft links
  const subject = `Leave Request — ${employeeName} (${employeeId}) — ${datesText}`;
  const body = `${letterText}\n\nRequest Reference: ${reference}\nLeave type: ${leaveTypeVal}`;
  const composeUrl = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(leaveRecipient)}&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  const accountChooserUrl = `https://accounts.google.com/AccountChooser?service=mail&continue=${encodeURIComponent(composeUrl)}`;
  const targetUrl = accountChooserUrl.length < 2400 ? accountChooserUrl : composeUrl;

  const successGmailLink = document.querySelector("#success-gmail-link");
  if (successGmailLink) {
    successGmailLink.href = targetUrl;
  }

  // 4. Update UI to success section with pending status
  const successHeadline = document.querySelector("#success-headline");
  const successCopy = document.querySelector("#success-copy");
  const successStepLabel = document.querySelector("#success-step-label");
  if (isBrowserLocalMode()) {
    if (successHeadline) successHeadline.textContent = "Leave request saved in this browser.";
    if (successCopy) successCopy.textContent = "This GitHub Pages demo does not send requests to an administrator. Open the Admin Portal in this same browser and at the same website address to review this request.";
    if (successStepLabel) successStepLabel.textContent = "SAVED LOCALLY";
  }
  populateReceipt({
    reference,
    name: employeeName,
    id: employeeId,
    email: employeeEmail,
    dates: datesText,
    duration: durationVal,
    leaveType: leaveTypeVal,
    time: timeFormat.format(new Date()),
    status: "pending",
  });

  updateApprovalUI(requestRecord);

  previewSection.classList.add("hidden");
  successSection.classList.remove("hidden");
  window.scrollTo({ top: 0, behavior: "smooth" });

  showNotice(
    isBrowserLocalMode()
      ? `Request saved in this browser. Reference: ${reference}.`
      : `Leave request submitted to Admin! Reference: ${reference}. Awaiting approval.`,
    "info",
  );

  // Start polling
  startStatusPolling();
});

const copyBtn = document.querySelector("#copy-letter-button");
if (copyBtn) {
  copyBtn.addEventListener("click", async () => {
    try {
      const text = currentRequest?.letter || letterPreview.textContent;
      await navigator.clipboard.writeText(text);
      showNotice("Leave letter text copied to clipboard!", "success");
    } catch {
      showNotice("Could not copy automatically. You can copy the text from the preview.", "info");
    }
  });
}

// Track Modal Handling
const trackBtn = document.querySelector("#nav-track-btn");
const trackModal = document.querySelector("#track-modal");
const closeTrackBtn = document.querySelector("#close-track-modal");
const trackForm = document.querySelector("#track-form");
const trackInput = document.querySelector("#track-ref-input");
const trackResult = document.querySelector("#track-result");

if (trackBtn && trackModal) {
  trackBtn.addEventListener("click", () => {
    const lastRef = localStorage.getItem("fg_last_ref");
    if (lastRef && trackInput) trackInput.value = lastRef;
    trackModal.classList.remove("hidden");
    trackInput?.focus();
  });
}

if (closeTrackBtn && trackModal) {
  closeTrackBtn.addEventListener("click", () => {
    trackModal.classList.add("hidden");
  });
}

if (trackModal) {
  trackModal.addEventListener("click", (e) => {
    if (e.target === trackModal) trackModal.classList.add("hidden");
  });
}

if (trackForm) {
  trackForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const ref = (trackInput.value || "").trim();
    if (!ref) return;

    trackResult.innerHTML = `<p style="color: var(--text-dim);">Checking request status for <strong>${escapeHtml(ref)}</strong>…</p>`;
    trackResult.classList.remove("hidden");

    const req = await fetchLatestRequest(ref);
    if (!req) {
      trackResult.innerHTML = `
        <div class="track-card status-rejected">
          <p>❌ No leave request found with reference <strong>${escapeHtml(ref)}</strong>. Please verify the ID.</p>
        </div>
      `;
      return;
    }

    const status = req.approvalStatus || "pending";
    const statusText =
      status === "approved"
        ? "✅ Approved by Admin"
        : status === "rejected"
        ? "❌ Not Approved"
        : "⏳ Pending Admin Approval";

    trackResult.innerHTML = `
      <div class="track-card status-${status}">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
          <strong style="color: #ffffff;">${escapeHtml(req.employee?.name || "Employee")} (${escapeHtml(req.employee?.id || "")})</strong>
          <span class="status-pill status-${status}">${statusText}</span>
        </div>
        <p style="font-size: 0.88rem; color: var(--text-dim); margin-bottom: 0.75rem;">
          <strong>Dates:</strong> ${escapeHtml(req.employee?.startDate || "")} to ${escapeHtml(req.employee?.endDate || "")} (${escapeHtml(req.employee?.duration || "")})
        </p>
        ${
          req.adminRemarks
            ? `<p style="font-size: 0.84rem; color: #ffd07a; margin-bottom: 0.75rem;"><strong>Admin Remarks:</strong> ${escapeHtml(req.adminRemarks)}</p>`
            : ""
        }
        <div style="display: flex; gap: 0.5rem; flex-wrap: wrap;">
          ${
            status === "approved"
              ? `<button class="button button-primary button-sm" type="button" id="modal-download-btn">📥 Download Approved PDF</button>`
              : `<button class="button button-secondary button-sm" type="button" disabled>🔒 PDF Locked (Awaiting Approval)</button>`
          }
          <button class="button button-secondary button-sm" type="button" id="modal-view-details">Open in Page</button>
        </div>
      </div>
    `;

    document.querySelector("#modal-download-btn")?.addEventListener("click", () => {
      saveBrowserPdf(req.letter, `${req.reference}-approved.pdf`, req);
    });

    document.querySelector("#modal-view-details")?.addEventListener("click", () => {
      trackModal.classList.add("hidden");
      currentRequest = req;
      populateReceipt({
        reference: req.reference,
        name: req.employee?.name || "",
        id: req.employee?.id || "",
        email: req.employee?.email || "",
        dates: `${prettyDate(req.employee?.startDate)} to ${prettyDate(req.employee?.endDate)}`,
        duration: req.employee?.duration || "",
        leaveType: req.employee?.leaveType || "",
        time: formatPrettyDate(req.submittedAt),
        status: req.approvalStatus,
      });
      updateApprovalUI(req);
      form.closest(".portal-layout").classList.add("hidden");
      document.querySelector(".intro").classList.add("hidden");
      previewSection.classList.add("hidden");
      successSection.classList.remove("hidden");
      startStatusPolling();
    });
  });
}

function formatPrettyDate(isoString) {
  if (!isoString) return "—";
  try {
    const date = new Date(isoString);
    if (Number.isNaN(date.getTime())) return isoString;
    return timeFormat.format(date);
  } catch {
    return isoString;
  }
}

loadCompany();
updateDuration();
