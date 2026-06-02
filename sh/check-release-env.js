#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const apiRoot = path.resolve(__dirname, "..");
const webRoot = path.resolve(apiRoot, "..", "docs-web");

function readEnv(filePath) {
  if (!fs.existsSync(filePath)) throw new Error(`Missing env file: ${filePath}`);
  const env = {};
  const text = fs.readFileSync(filePath, "utf8");
  for (const line of text.split(/\n/)) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!match) continue;
    env[match[1]] = match[2].replace(/^"|"$/g, "");
  }
  return env;
}

function check(label, condition) {
  console.log(`${condition ? "OK" : "NG"} ${label}`);
  if (!condition) failures += 1;
}

let failures = 0;
const apiDev = readEnv(path.join(apiRoot, ".env.development"));
const apiProd = readEnv(path.join(apiRoot, ".env.production"));
const webDev = readEnv(path.join(webRoot, ".env.development"));
const webProd = readEnv(path.join(webRoot, ".env.production"));

check("API development uses Stripe test key", apiDev.STRIPE_SECRET_KEY?.startsWith("sk_test_"));
check("API development has Stripe webhook secret", apiDev.STRIPE_WEBHOOK_SECRET?.startsWith("whsec_"));
check("API production uses Stripe live key", apiProd.STRIPE_SECRET_KEY?.startsWith("sk_live_"));
check("API production has Stripe webhook secret", apiProd.STRIPE_WEBHOOK_SECRET?.startsWith("whsec_"));
check("API production NODE_ENV is production", apiProd.NODE_ENV === "production");
check("API production FRONTEND_URL is https", apiProd.FRONTEND_URL?.startsWith("https://"));
check("API production port is 4100", apiProd.PORT === "4100");

check("Web development API URL is localhost:3002", webDev.NEXT_PUBLIC_API_BASE_URL === "http://localhost:3002");
check("Web development site URL is localhost:3000", webDev.NEXT_PUBLIC_SITE_URL === "http://localhost:3000");
check("Web production API URL is api-docs.meritledger.org", webProd.NEXT_PUBLIC_API_BASE_URL === "https://api-docs.meritledger.org");
check("Web production site URL is docs.meritledger.org", webProd.NEXT_PUBLIC_SITE_URL === "https://docs.meritledger.org");

if (failures) {
  console.error(`Release environment check failed: ${failures}`);
  process.exit(1);
}

console.log("Release environment check passed.");
