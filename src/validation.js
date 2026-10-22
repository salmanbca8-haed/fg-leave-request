const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const LEAVE_TYPES = new Set([
  "Casual Leave",
  "Sick Leave",
  "Emergency Leave",
  "Personal Leave",
  "Other",
]);
const LEAVE_UNITS = new Set(["days", "half-day", "hours"]);
const TEMPLATE_PLACEHOLDERS = new Set([
  "employeeName", "employeeId", "departmentLine", "employeeEmail",
  "managerDesignation", "companyName", "companyAddress", "startDate",
  "endDate", "duration", "reason", "notesBlock", "signatureDepartmentLine",
  "submissionDate",
]);

function cleanText(value, maximumLength) {
  if (typeof value !== "string") return "";
  return value.trim().replace(/\r\n?/g, "\n").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").slice(0, maximumLength + 1);
}

function cleanSingleLine(value, maximumLength) {
  return cleanText(value, maximumLength).replace(/\s+/g, " ");
}

function isValidDate(value) {
  if (!DATE_PATTERN.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function validateRequest(input) {
  const errors = {};
  const employee = {
    name: cleanSingleLine(input?.name, 120),
    id: cleanSingleLine(input?.id, 64),
    email: cleanSingleLine(input?.email, 254).toLowerCase(),
    department: cleanSingleLine(input?.department, 120),
    startDate: cleanText(input?.startDate, 10),
    endDate: cleanText(input?.endDate, 10),
    leaveType: cleanSingleLine(input?.leaveType, 40),
    unit: cleanSingleLine(input?.unit, 20),
    reason: cleanText(input?.reason, 3000),
    notes: cleanText(input?.notes, 2000),
  };

  if (!employee.name) errors.name = "Enter your full name.";
  if (employee.name.length > 120) errors.name = "Keep your full name under 120 characters.";
  if (!employee.id) errors.id = "Enter your employee ID.";
  if (employee.id.length > 64) errors.id = "Keep your employee ID under 64 characters.";
  if (!EMAIL_PATTERN.test(employee.email)) errors.email = "Enter a valid email address.";
  if (employee.email.length > 254) errors.email = "Keep your email address under 254 characters.";
  if (employee.department.length > 120) errors.department = "Keep your department under 120 characters.";
  if (!isValidDate(employee.startDate)) errors.startDate = "Choose a valid start date.";
  if (!isValidDate(employee.endDate)) errors.endDate = "Choose a valid end date.";
  if (isValidDate(employee.startDate) && isValidDate(employee.endDate)
      && employee.endDate < employee.startDate) {
    errors.endDate = "The end date cannot be earlier than the start date.";
  }
  if (!LEAVE_TYPES.has(employee.leaveType)) errors.leaveType = "Choose a leave type.";
  if (!employee.reason) errors.reason = "Tell us the reason for your leave.";
  if (employee.reason.length > 3000) errors.reason = "Keep the reason under 3,000 characters.";
  if (employee.notes.length > 2000) errors.notes = "Keep additional notes under 2,000 characters.";
  if (!LEAVE_UNITS.has(employee.unit)) errors.unit = "Choose a valid leave duration.";

  const days = isValidDate(employee.startDate) && isValidDate(employee.endDate)
    && employee.endDate >= employee.startDate
    ? Math.floor((Date.parse(`${employee.endDate}T00:00:00Z`)
      - Date.parse(`${employee.startDate}T00:00:00Z`)) / 86400000) + 1
    : 0;
  const hours = Number(input?.hours);
  let duration;

  if (employee.unit === "half-day") {
    if (days !== 1) errors.unit = "A half-day request must be for a single date.";
    duration = "0.5 day (half-day)";
  } else if (employee.unit === "hours") {
    if (days !== 1) errors.unit = "An hours-based request must be for a single date.";
    if (!Number.isFinite(hours) || hours <= 0 || hours > 24) {
      errors.hours = "Enter a number of hours greater than 0 and no more than 24.";
    }
    duration = `${Number.isFinite(hours) ? hours : 0} hours`;
  } else {
    duration = `${days} calendar ${days === 1 ? "day" : "days"}`;
  }

  return {
    errors,
    value: { ...employee, duration, hours: employee.unit === "hours" ? hours : null },
  };
}

function validateSettings(input) {
  const errors = {};
  const settings = {
    companyName: cleanSingleLine(input?.companyName, 120),
    officialEmail: cleanSingleLine(input?.officialEmail, 254).toLowerCase(),
    address: cleanText(input?.address, 500),
    managerDesignation: cleanSingleLine(input?.managerDesignation, 120),
    logoUrl: cleanText(input?.logoUrl, 500),
    sendConfirmation: input?.sendConfirmation === true,
    template: cleanText(input?.template, 10000),
  };

  if (!settings.companyName) errors.companyName = "Enter the company name.";
  if (settings.companyName.length > 120) errors.companyName = "Keep the company name under 120 characters.";
  if (!EMAIL_PATTERN.test(settings.officialEmail)) errors.officialEmail = "Enter a valid company email address.";
  if (settings.officialEmail.length > 254) errors.officialEmail = "Keep the company email under 254 characters.";
  if (!settings.address) errors.address = "Enter the official company address.";
  if (!settings.managerDesignation) errors.managerDesignation = "Enter a manager designation.";
  if (settings.managerDesignation.length > 120) errors.managerDesignation = "Keep the manager designation under 120 characters.";
  if (settings.address.length > 500) errors.address = "Keep the official address under 500 characters.";
  if (settings.logoUrl) {
    try {
      if (new URL(settings.logoUrl).protocol !== "https:") throw new Error("Use an HTTPS URL.");
    } catch {
      errors.logoUrl = "Enter a valid HTTPS logo URL.";
    }
  }
  if (!settings.template) errors.template = "Enter the formal leave letter template.";
  if (settings.template.length > 10000) errors.template = "Keep the formal letter template under 10,000 characters.";
  for (const [, name] of settings.template.matchAll(/\{\{([^{}]+)\}\}/g)) {
    if (!TEMPLATE_PLACEHOLDERS.has(name)) {
      errors.template = `The template contains an unsupported placeholder: {{${name}}}.`;
      break;
    }
  }
  return { errors, value: settings };
}

module.exports = { validateRequest, validateSettings, isValidDate };
