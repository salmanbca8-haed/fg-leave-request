const crypto = require("node:crypto");
const path = require("node:path");
const express = require("express");
const helmet = require("helmet");
const nodemailer = require("nodemailer");
const PDFDocument = require("pdfkit");
const { rateLimit } = require("express-rate-limit");
const { validateRequest, validateSettings } = require("./validation");
const { createLetter, formatDate } = require("./letter");
const store = require("./store");

const app = express();
const port = Number(process.env.PORT) || 3000;
const pendingRequests = new Map();
const completedRequests = new Map();

app.disable("x-powered-by");
app.set("trust proxy", process.env.TRUST_PROXY === "true" ? 1 : false);
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      baseUri: ["'self'"],
      connectSrc: ["'self'"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      formAction: ["'self'"],
      frameAncestors: ["'none'"],
      imgSrc: ["'self'", "https:", "data:"],
      objectSrc: ["'none'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "https://fonts.googleapis.com"],
    },
  },
}));
app.use(express.json({ limit: "20kb" }));
app.use(express.static(path.join(__dirname, "..", "public")));
app.use((request, _response, next) => {
  request.cookies = parseCookies(request.headers.cookie);
  next();
});
app.use("/api", (_request, response, next) => {
  response.setHeader("Cache-Control", "no-store");
  next();
});

const submissionLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "Too many requests. Please try again in a few minutes." },
});
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "Too many sign-in attempts. Please try again later." },
});
const pdfLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: "draft-8",
  legacyHeaders: false,
});

function verifySameOrigin(request, response, next) {
  const origin = request.get("origin");
  if (origin) {
    try {
      if (new URL(origin).host !== request.get("host")) {
        return response.status(403).json({ error: "Request origin was not accepted." });
      }
    } catch {
      return response.status(403).json({ error: "Request origin was not accepted." });
    }
  }
  return next();
}

function safeEqual(first, second) {
  const left = Buffer.from(first);
  const right = Buffer.from(second);
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function sign(value) {
  return crypto.createHmac("sha256", process.env.SESSION_SECRET).update(value).digest("base64url");
}

function createAdminToken() {
  const payload = Buffer.from(JSON.stringify({ expires: Date.now() + 8 * 60 * 60 * 1000 })).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

function isAdminTokenValid(token) {
  if (!token || !process.env.SESSION_SECRET) return false;
  const [payload, signature, ...extra] = token.split(".");
  if (!payload || !signature || extra.length || !safeEqual(signature, sign(payload))) return false;
  try {
    return JSON.parse(Buffer.from(payload, "base64url").toString()).expires > Date.now();
  } catch {
    return false;
  }
}

function requireAdmin(request, response, next) {
  const token = request.cookies?.leave_admin;
  if (!isAdminTokenValid(token)) return response.status(401).json({ error: "Administrator sign-in required." });
  return next();
}

function parseCookies(header = "") {
  return Object.fromEntries(header.split(";").map((part) => {
    const separator = part.indexOf("=");
    if (separator < 0) return ["", ""];
    const name = part.slice(0, separator).trim();
    const rawValue = part.slice(separator + 1).trim();
    try {
      return [name, decodeURIComponent(rawValue)];
    } catch {
      return [name, ""];
    }
  }).filter(([name]) => name));
}

app.get("/api/settings", async (_request, response, next) => {
  try {
    const settings = await store.getSettings();
    response.json({
      companyName: settings.companyName,
      address: settings.address,
      managerDesignation: settings.managerDesignation,
      logoUrl: settings.logoUrl,
      template: settings.template,
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/admin/login", loginLimiter, verifySameOrigin, (request, response) => {
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminPassword || !process.env.SESSION_SECRET) {
    return response.status(503).json({ error: "Administrator authentication is not configured on this server." });
  }
  const password = typeof request.body?.password === "string" ? request.body.password : "";
  if (!safeEqual(password, adminPassword)) {
    return response.status(401).json({ error: "The administrator password is incorrect." });
  }
  response.setHeader("Set-Cookie", `leave_admin=${createAdminToken()}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800${process.env.NODE_ENV === "production" ? "; Secure" : ""}`);
  return response.json({ success: true });
});

app.post("/api/admin/logout", verifySameOrigin, (request, response) => {
  response.setHeader("Set-Cookie", `leave_admin=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0${process.env.NODE_ENV === "production" ? "; Secure" : ""}`);
  response.json({ success: true });
});

app.get("/api/admin/session", (request, response) => {
  response.json({ authenticated: isAdminTokenValid(request.cookies?.leave_admin) });
});

app.get("/api/admin/settings", requireAdmin, async (_request, response, next) => {
  try {
    response.json(await store.getSettings());
  } catch (error) {
    next(error);
  }
});

app.put("/api/admin/settings", requireAdmin, verifySameOrigin, async (request, response, next) => {
  const { errors, value } = validateSettings(request.body);
  if (Object.keys(errors).length) return response.status(400).json({ error: "Check the highlighted settings.", fields: errors });
  try {
    await store.saveSettings(value);
    return response.json({ success: true });
  } catch (error) {
    return next(error);
  }
});

function configuredSmtp() {
  const { SMTP_HOST, SMTP_USER, SMTP_PASSWORD, SMTP_FROM_EMAIL } = process.env;
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASSWORD || !(SMTP_FROM_EMAIL || SMTP_USER)) return null;
  const smtpPort = Number(process.env.SMTP_PORT) || 587;
  return {
    from: SMTP_FROM_EMAIL || SMTP_USER,
    transporter: nodemailer.createTransport({
      host: SMTP_HOST,
      port: smtpPort,
      secure: process.env.SMTP_SECURE === "true",
      auth: { user: SMTP_USER, pass: SMTP_PASSWORD },
    }),
  };
}

function escapeHtml(value) {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character]);
}

function createReference() {
  return `LR-${new Date().toISOString().slice(0, 10).replaceAll("-", "")}-${crypto.randomBytes(16).toString("hex").toUpperCase()}`;
}

async function deliverRequest(key, fingerprint, employee, settings, mailer, from) {
  const submittedAt = new Date();
  const reference = createReference();
  const letter = createLetter(employee, settings, submittedAt);
  const record = {
    reference,
    fingerprint,
    employee,
    letter,
    submittedAt: submittedAt.toISOString(),
    emailStatus: "sending",
    approvalStatus: "submitted",
  };
  await store.saveRequest(key, record);

  try {
    const result = await mailer.sendMail({
      from,
      to: settings.officialEmail,
      replyTo: employee.email,
      subject: `Leave Request — ${employee.name} (${employee.id}) — ${formatDate(employee.startDate)} to ${formatDate(employee.endDate)}`,
      text: `Request reference: ${reference}\nLeave type: ${employee.leaveType}\n\n${letter}`,
      html: `<p><strong>Request reference:</strong> ${escapeHtml(reference)}<br><strong>Leave type:</strong> ${escapeHtml(employee.leaveType)}</p><pre style="font-family:Arial,sans-serif;white-space:pre-wrap">${escapeHtml(letter)}</pre>`,
    });
    if (!result.accepted?.length) {
      throw new Error("The email provider did not accept the company's recipient address.");
    }
  } catch (error) {
    record.emailStatus = "failed";
    try {
      await store.saveRequest(key, record);
    } catch (storageError) {
      console.error("Could not save failed email status:", storageError.message);
    }
    throw error;
  }

  record.emailStatus = "sent";
  record.submittedAt = new Date().toISOString();
  completedRequests.set(key, record);
  try {
    await store.saveRequest(key, record);
  } catch (error) {
    console.error("Email was accepted, but the request record could not be saved:", error.message);
  }
  if (settings.sendConfirmation) {
    try {
      const result = await mailer.sendMail({
        from,
        to: employee.email,
        subject: `Leave request received — ${reference}`,
        text: `Your leave request has been received. It has been submitted for review and is not an approval.\n\nRequest reference: ${reference}\n\n${letter}`,
      });
      if (!result.accepted?.length) {
        throw new Error("The email provider did not accept the employee's confirmation address.");
      }
      record.confirmationStatus = "sent";
    } catch (error) {
      record.confirmationStatus = "failed";
      console.error("Employee confirmation email failed:", error.message);
    }
  } else {
    record.confirmationStatus = "not_requested";
  }
  try {
    await store.saveRequest(key, record);
  } catch (error) {
    console.error("Could not save email confirmation status:", error.message);
  }
  return { reference, employee, submittedAt: record.submittedAt, approvalStatus: record.approvalStatus };
}

app.post("/api/requests", submissionLimiter, verifySameOrigin, async (request, response, next) => {
  const { errors, value } = validateRequest(request.body);
  if (Object.keys(errors).length) return response.status(400).json({ error: "Please correct the highlighted fields.", fields: errors });
  const key = request.get("Idempotency-Key");
  if (!key || !/^[0-9a-f-]{36}$/i.test(key)) {
    return response.status(400).json({ error: "Refresh the page before submitting your request." });
  }
  const fingerprint = crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");

  try {
    let pending = pendingRequests.get(key);
    if (pending && pending.fingerprint !== fingerprint) {
      return response.status(409).json({ error: "This request key was already used for different details. Refresh the form and try again." });
    }
    if (!pending) {
      const promise = (async () => {
        const existing = completedRequests.get(key) || await store.getRequest(key);
        if (existing?.fingerprint && existing.fingerprint !== fingerprint) {
          const error = new Error("This request key was already used for different details. Refresh the form and try again.");
          error.status = 409;
          throw error;
        }
        if (existing?.emailStatus === "sent") {
          return {
            reference: existing.reference,
            employee: existing.employee,
            submittedAt: existing.submittedAt,
            approvalStatus: existing.approvalStatus,
          };
        }
        if (existing?.emailStatus === "sending") {
          const error = new Error("This request's delivery status is uncertain. Please contact your administrator before retrying.");
          error.status = 409;
          throw error;
        }
        const settings = await store.getSettings();
        if (!settings.companyName || !settings.officialEmail || !settings.address || !settings.managerDesignation) {
          const error = new Error("Company settings are incomplete. Please contact your administrator.");
          error.status = 503;
          throw error;
        }
        const email = configuredSmtp();
        if (!email) {
          const error = new Error("Email delivery is not configured on this server. Please contact your administrator.");
          error.status = 503;
          throw error;
        }
        return deliverRequest(key, fingerprint, value, settings, email.transporter, email.from);
      })();
      pending = { fingerprint, promise };
      pendingRequests.set(key, pending);
    }
    try {
      return response.json(await pending.promise);
    } catch (error) {
      if (error.status) return response.status(error.status).json({ error: error.message });
      console.error("Leave request delivery failed:", error.message);
      return response.status(502).json({ error: "Email delivery failed. Your request was not confirmed; please retry safely." });
    } finally {
      if (pendingRequests.get(key) === pending) pendingRequests.delete(key);
    }
  } catch (error) {
    return next(error);
  }
});

app.post("/api/letter/pdf", pdfLimiter, verifySameOrigin, (request, response, next) => {
  const letter = request.body?.letter;
  if (typeof letter !== "string" || !letter.trim() || letter.length > 10000) {
    return response.status(400).json({ error: "The letter must contain between 1 and 10,000 characters." });
  }
  response.setHeader("Content-Type", "application/pdf");
  response.setHeader("Content-Disposition", 'attachment; filename="leave-letter-preview.pdf"');
  const pdf = new PDFDocument({ margin: 64, size: "A4" });
  pdf.on("error", next);
  pdf.pipe(response);
  pdf.font("Helvetica").fontSize(10).fillColor("#202a36").text(letter, { lineGap: 4 });
  pdf.end();
});

app.get("/api/requests/:reference/pdf", pdfLimiter, async (request, response, next) => {
  try {
    const inMemoryRecord = [...completedRequests.values()].find((item) => item.reference === request.params.reference);
    const record = inMemoryRecord || await store.getRequestByReference(request.params.reference);
    if (!record || record.emailStatus !== "sent") return response.status(404).json({ error: "Request letter not found." });
    response.setHeader("Content-Type", "application/pdf");
    response.setHeader("Content-Disposition", `attachment; filename="${record.reference}.pdf"`);
    const pdf = new PDFDocument({ margin: 64, size: "A4" });
    pdf.on("error", next);
    pdf.pipe(response);
    pdf.font("Helvetica").fontSize(10).fillColor("#202a36").text(record.letter, { lineGap: 4 });
    pdf.end();
  } catch (error) {
    next(error);
  }
});

app.use((error, _request, response, _next) => {
  console.error("Portal request failed:", error.message);
  if (response.headersSent) return;
  const status = error.status === 413 ? 413 : error.status === 400 ? 400 : 500;
  const message = status === 413
    ? "The request is too large."
    : status === 400
      ? "The request could not be read. Check the submitted data and try again."
      : "Something went wrong. Please try again or contact your administrator.";
  response.status(status).json({ error: message });
});

app.listen(port, () => {
  console.log(`Employee Leave Portal is running on port ${port}.`);
});
