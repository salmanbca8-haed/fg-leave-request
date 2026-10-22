const form = document.querySelector("#leave-form");
const previewSection = document.querySelector("#preview-section");
const successSection = document.querySelector("#success-section");
const letterPreview = document.querySelector("#letter-preview");
const notice = document.querySelector("#notice");
const formErrors = document.querySelector("#form-errors");
const durationValue = document.querySelector("#duration-value");
const dateFormat = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
const leaveRecipient = "fuglide@gmail.com";
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
{{notesBlock}}
I kindly request you to consider my situation and approve my leave for the above-mentioned period. I will make the necessary arrangements to ensure that my responsibilities and pending tasks are managed appropriately during my absence.

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
  const stored = window.localStorage ? window.localStorage.getItem("leave_portal_backend_url") : null;
  const globalVar = window.LEAVE_PORTAL_BACKEND_URL;
  const url = (globalVar || stored || meta || "").trim();
  return url.replace(/\/+$/, "");
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
  const isStaticHost = window.location.hostname.endsWith("github.io") || window.location.protocol === "file:";

  if (!backend && isStaticHost) {
    applyCompanySettings(company);
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
    if (backend || !isStaticHost) {
      showNotice("Company settings could not be loaded. The letter uses the default company details.", "error");
    }
  }
}

function showNotice(message, type) {
  notice.textContent = message;
  notice.className = `notice ${type}`;
}

function showPreview() {
  if (!validateForm()) return;
  updateLetter();
  form.closest(".portal-layout").classList.add("hidden");
  document.querySelector(".intro").classList.add("hidden");
  previewSection.classList.remove("hidden");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function saveBrowserPdf(letter, filename) {
  const JsPDF = window.jspdf?.jsPDF;
  if (!JsPDF) throw new Error("PDF generator could not be loaded. Refresh the page and try again.");

  const pdf = new JsPDF({ unit: "pt", format: "a4" });
  const margin = 56;
  const lineHeight = 16;
  const pageHeight = pdf.internal.pageSize.getHeight();
  const contentWidth = pdf.internal.pageSize.getWidth() - margin * 2;
  const lines = pdf.splitTextToSize(letter, contentWidth);
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
  } catch (error) {
    showNotice(error.message, "error");
  } finally {
    button.disabled = false;
  }
});
document.querySelector("#download-final").addEventListener("click", () => {
  try {
    saveBrowserPdf(letterPreview.textContent, "leave-letter.pdf");
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
document.querySelector("#send-button").addEventListener("click", (event) => {
  if (!validateForm()) {
    previewSection.classList.add("hidden");
    form.closest(".portal-layout").classList.remove("hidden");
    document.querySelector(".intro").classList.remove("hidden");
    return;
  }
  const button = event.currentTarget;
  const employeeName = fieldValue("name");
  const employeeId = fieldValue("id");
  const subject = `Leave Request — ${employeeName} (${employeeId}) — ${prettyDate(fieldValue("startDate"))} to ${prettyDate(fieldValue("endDate"))}`;
  const body = `${letterPreview.textContent}\n\nLeave type: ${fieldValue("leaveType")}`;
  const composeUrl = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(leaveRecipient)}&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  const accountChooserUrl = `https://accounts.google.com/AccountChooser?service=mail&continue=${encodeURIComponent(composeUrl)}`;

  notice.replaceChildren(
    document.createTextNode(`Choose your personal @gmail.com account to open a draft addressed to ${leaveRecipient}. Review it and press Send in Gmail. `),
  );
  const fallbackLink = document.createElement("a");
  fallbackLink.href = accountChooserUrl;
  fallbackLink.target = "_blank";
  fallbackLink.rel = "noopener noreferrer";
  fallbackLink.textContent = "Open Gmail draft";
  notice.append(fallbackLink);
  notice.className = "notice info";
  button.blur();
  const composeLink = document.createElement("a");
  composeLink.href = accountChooserUrl;
  composeLink.target = "_blank";
  composeLink.rel = "noopener noreferrer";
  composeLink.click();
});

loadCompany();
updateDuration();
