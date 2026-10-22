const fs = require("node:fs/promises");
const path = require("node:path");
const { DEFAULT_TEMPLATE } = require("./letter");

const dataDirectory = process.env.DATA_DIRECTORY
  ? path.resolve(process.env.DATA_DIRECTORY)
  : path.join(__dirname, "..", "data");
const dataPath = path.join(dataDirectory, "store.json");
let writeQueue = Promise.resolve();

function initialSettings() {
  return {
    companyName: process.env.COMPANY_NAME || "Fuglide Innovation Intelligence Network",
    officialEmail: process.env.COMPANY_OFFICIAL_EMAIL || "fuglide@gmail.com",
    address: process.env.COMPANY_ADDRESS || "Dindigul",
    managerDesignation: process.env.MANAGER_DESIGNATION || "T. Hariharan, the Founder and CEO",
    logoUrl: process.env.COMPANY_LOGO_URL || "",
    sendConfirmation: process.env.SEND_EMPLOYEE_CONFIRMATION === "true",
    template: DEFAULT_TEMPLATE,
  };
}

async function readStore() {
  try {
    const content = await fs.readFile(dataPath, "utf8");
    return JSON.parse(content);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    return { settings: initialSettings(), requests: {} };
  }
}

async function updateStore(update) {
  const operation = writeQueue.then(async () => {
    const store = await readStore();
    const result = await update(store);
    await fs.mkdir(dataDirectory, { recursive: true });
    const temporaryPath = `${dataPath}.${process.pid}.tmp`;
    await fs.writeFile(temporaryPath, JSON.stringify(store, null, 2), { mode: 0o600 });
    await fs.rename(temporaryPath, dataPath);
    return result;
  });
  writeQueue = operation.catch(() => {});
  return operation;
}

async function getSettings() {
  return (await readStore()).settings;
}

async function saveSettings(settings) {
  return updateStore((store) => {
    store.settings = settings;
  });
}

async function getRequest(key) {
  return (await readStore()).requests[key] || null;
}

async function saveRequest(key, request) {
  return updateStore((store) => {
    store.requests[key] = request;
  });
}

async function getRequestByReference(reference) {
  const store = await readStore();
  return Object.values(store.requests).find((request) => request.reference === reference) || null;
}

module.exports = { getSettings, saveSettings, getRequest, saveRequest, getRequestByReference, initialSettings };
