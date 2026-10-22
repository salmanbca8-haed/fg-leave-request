const test = require("node:test");
const assert = require("node:assert/strict");
const { validateRequest, validateSettings } = require("../src/validation");
const { createLetter, formatDate, DEFAULT_TEMPLATE } = require("../src/letter");
const { initialSettings } = require("../src/store");

const validRequest = {
  name: "Jordan Lee",
  id: "EMP-1042",
  email: "jordan@example.org",
  department: "Product Design",
  startDate: "2026-10-22",
  endDate: "2026-10-24",
  leaveType: "Casual Leave",
  unit: "days",
  reason: "Family commitment",
  notes: "",
};

test("validates required request fields and counts inclusive calendar days", () => {
  const result = validateRequest(validRequest);
  assert.deepEqual(result.errors, {});
  assert.equal(result.value.duration, "3 calendar days");
});

test("rejects invalid date ranges and half-day multi-day requests", () => {
  const reversed = validateRequest({ ...validRequest, endDate: "2026-10-21" });
  assert.match(reversed.errors.endDate, /earlier/);
  const halfDay = validateRequest({ ...validRequest, endDate: "2026-10-23", unit: "half-day" });
  assert.match(halfDay.errors.unit, /single date/);
});

test("validates an hours-based request and its amount", () => {
  const invalid = validateRequest({ ...validRequest, endDate: validRequest.startDate, unit: "hours", hours: 25 });
  assert.match(invalid.errors.hours, /no more than 24/);
  const valid = validateRequest({ ...validRequest, endDate: validRequest.startDate, unit: "hours", hours: 3.5 });
  assert.equal(valid.value.duration, "3.5 hours");
});

test("letter formats dates, preserves reason text and omits empty optional details", () => {
  const { value } = validateRequest(validRequest);
  const letter = createLetter(value, {
    companyName: "Example Company",
    officialEmail: "hr@example.org",
    address: "1 Main Street",
    managerDesignation: "The HR Manager",
    logoUrl: "",
  }, new Date("2026-10-20T12:00:00Z"));
  assert.match(letter, /22 October 2026 to 24 October 2026/);
  assert.match(letter, /To:\n\nThe HR Manager/);
  assert.match(letter, /Respected Sir/);
  assert.match(letter, /Family commitment/);
  assert.match(letter, /Product Design/);
  assert.doesNotMatch(letter, /Additional notes:/);
  assert.match(letter, /Date of Submission: 20 October 2026/);
});

test("validates required company settings and HTTPS branding URL", () => {
  const result = validateSettings({
    companyName: "Example Company",
    officialEmail: "hr@example.org",
    address: "1 Main Street",
    managerDesignation: "The HR Manager",
    logoUrl: "http://example.org/logo.png",
  });
  assert.match(result.errors.logoUrl, /HTTPS/);
  assert.equal(formatDate("2026-10-22"), "22 October 2026");
});

test("accepts supported administrator template placeholders and rejects unknown ones", () => {
  const settings = {
    companyName: "Example Company",
    officialEmail: "hr@example.org",
    address: "1 Main Street",
    managerDesignation: "The HR Manager",
    logoUrl: "",
    sendConfirmation: false,
    template: DEFAULT_TEMPLATE,
  };
  assert.deepEqual(validateSettings(settings).errors, {});
  const invalid = validateSettings({ ...settings, template: "Hello {{untrustedValue}}" });
  assert.match(invalid.errors.template, /unsupported placeholder/);
});

test("uses Fuglide company details and CEO as the default letter recipient", () => {
  const settings = initialSettings();
  assert.equal(settings.companyName, "Fuglide Innovation Intelligence Network");
  assert.equal(settings.address, "Dindigul");
  assert.equal(settings.managerDesignation, "T. Hariharan, the Founder and CEO");
  assert.equal(settings.officialEmail, "fuglide@gmail.com");
});
