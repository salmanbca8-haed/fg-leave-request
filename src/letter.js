const DEFAULT_TEMPLATE = `From:

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

function formatDate(date) {
  return new Date(`${date}T00:00:00.000Z`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

function createLetter(employee, settings, submittedAt = new Date()) {
  const replacements = {
    employeeName: employee.name,
    employeeId: employee.id,
    departmentLine: employee.department ? `${employee.department}\n` : "",
    employeeEmail: employee.email,
    managerDesignation: settings.managerDesignation,
    companyName: settings.companyName,
    companyAddress: settings.address,
    startDate: formatDate(employee.startDate),
    endDate: formatDate(employee.endDate),
    duration: employee.duration,
    reason: employee.reason,
    notesBlock: employee.notes ? `Additional notes:\n${employee.notes}\n\n` : "",
    signatureDepartmentLine: employee.department ? `${employee.department}\n` : "",
    submissionDate: formatDate(submittedAt.toISOString().slice(0, 10)),
  };
  const template = settings.template || DEFAULT_TEMPLATE;
  return template.replace(/\{\{([A-Za-z]+)\}\}/g, (placeholder, name) => replacements[name] ?? placeholder);
}

module.exports = { createLetter, formatDate, DEFAULT_TEMPLATE };
