#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const apiRoot = path.resolve(__dirname, "..");
const defaultDoc = path.join(apiRoot, "docs", "域名-数据库用户名和密码.txt");
const docPath = process.argv[2] ? path.resolve(process.argv[2]) : defaultDoc;

function readParameterDoc() {
  if (!fs.existsSync(docPath)) {
    throw new Error(`Parameter document not found: ${docPath}`);
  }
  return fs.readFileSync(docPath, "utf8");
}

function sectionBetween(text, start, end) {
  const startIndex = text.indexOf(start);
  if (startIndex < 0) throw new Error(`Missing section: ${start}`);
  const endIndex = end ? text.indexOf(end, startIndex + start.length) : -1;
  return text.slice(startIndex, endIndex > 0 ? endIndex : undefined);
}

function valueAfter(section, label) {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = section.match(new RegExp(`${escaped}\\s*[：:]\\s*\\n\\s*([^\\s]+)`));
  if (!match) throw new Error(`Missing value: ${label}`);
  return match[1].replace(/^["']|["']$/g, "");
}

function updateEnvFile(filePath, updates) {
  if (!fs.existsSync(filePath)) throw new Error(`Env file not found: ${filePath}`);
  let text = fs.readFileSync(filePath, "utf8");

  for (const [key, value] of Object.entries(updates)) {
    const nextLine = `${key}=${JSON.stringify(value)}`;
    const linePattern = new RegExp(`^${key}=.*$`, "m");
    text = linePattern.test(text)
      ? text.replace(linePattern, nextLine)
      : `${text.trimEnd()}\n${nextLine}\n`;
  }

  fs.writeFileSync(filePath, text);
}

function assertPrefix(label, value, prefix) {
  if (!value.startsWith(prefix)) {
    throw new Error(`${label} must start with ${prefix}`);
  }
}

const doc = readParameterDoc();
const liveSection = sectionBetween(doc, "980的产品", "stripe test");
const testSection = sectionBetween(doc, "980 test", "cloudflare");

const liveSecret = valueAfter(liveSection, "STRIPE_SECRET_KEY");
const liveWebhook = valueAfter(liveSection, "STRIPE_WEBHOOK_SECRET");
const testSecret = valueAfter(testSection, "STRIPE_SECRET_KEY");
const testWebhook = valueAfter(testSection, "STRIPE_WEBHOOK_SECRET");

assertPrefix("production STRIPE_SECRET_KEY", liveSecret, "sk_live_");
assertPrefix("development STRIPE_SECRET_KEY", testSecret, "sk_test_");
assertPrefix("production STRIPE_WEBHOOK_SECRET", liveWebhook, "whsec_");
assertPrefix("development STRIPE_WEBHOOK_SECRET", testWebhook, "whsec_");

updateEnvFile(path.join(apiRoot, ".env.development"), {
  STRIPE_SECRET_KEY: testSecret,
  STRIPE_WEBHOOK_SECRET: testWebhook,
  STRIPE_PRICE_SINGLE_DOCUMENT: "",
  STRIPE_PRICE_BUSINESS_PACK: "",
});

updateEnvFile(path.join(apiRoot, ".env.production"), {
  STRIPE_SECRET_KEY: liveSecret,
  STRIPE_WEBHOOK_SECRET: liveWebhook,
  STRIPE_PRICE_SINGLE_DOCUMENT: "",
  STRIPE_PRICE_BUSINESS_PACK: "",
});

console.log("Updated Stripe env files.");
console.log("OK development uses sk_test... and whsec...");
console.log("OK production uses sk_live... and whsec...");
