import { randomBytes } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import axios from 'axios';
import { chromium } from 'rebrowser-playwright-core';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const envPath = path.join(rootDir, '.env');
const authProfileDir = path.join(rootDir, '.data', 'suno-auth-profile');
const loginUrl = 'https://suno.com/create';
const clerkVersion = '5.117.0';
const clerkClientUrl = `https://auth.suno.com/v1/client?__clerk_api_version=2025-11-10&_clerk_js_version=${clerkVersion}`;
const cookieProbeUrls = [
  'https://suno.com',
  'https://auth.suno.com',
  'https://studio-api.prod.suno.com'
];

const requiredCookieName = '__client';
const pollTimeoutMs = 5 * 60 * 1000;
const pollIntervalMs = 1000;
const validationTimeoutMs = 10000;

export const readEnvFile = async () => {
  try {
    return await fs.readFile(envPath, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') {
      return '';
    }
    throw error;
  }
};

export const parseEnv = (content) => {
  const values = new Map();
  for (const line of content.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match) {
      continue;
    }

    let value = match[2] ?? '';
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    values.set(match[1], value.replace(/\\"/g, '"').replace(/\\\\/g, '\\'));
  }
  return values;
};

const envValueNeedsQuotes = (value) => /[\s;#"'\\]/.test(value);

const formatEnvValue = (value) => {
  if (!envValueNeedsQuotes(value)) {
    return value;
  }

  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
};

export const updateEnvFile = async (updates) => {
  const content = await readEnvFile();
  const seen = new Set();
  const lines = content ? content.split(/\r?\n/) : [];
  const nextLines = lines.map((line) => {
    const match = line.match(/^(\s*)([A-Za-z_][A-Za-z0-9_]*)(\s*=\s*)(.*)$/);
    if (!match || !(match[2] in updates)) {
      return line;
    }

    seen.add(match[2]);
    return `${match[1]}${match[2]}${match[3]}${formatEnvValue(updates[match[2]])}`;
  });

  for (const [key, value] of Object.entries(updates)) {
    if (!seen.has(key)) {
      nextLines.push(`${key}=${formatEnvValue(value)}`);
    }
  }

  await fs.writeFile(envPath, `${nextLines.filter(Boolean).join('\n')}\n`);
};

const hasReusableCookie = (env) => {
  const cookie = env.get('SUNO_COOKIE')?.trim();
  return Boolean(cookie && cookie.includes(`${requiredCookieName}=`));
};

const getCookieValue = (cookieHeader, name) => {
  for (const part of cookieHeader.split(';')) {
    const trimmed = part.trim();
    const separatorIndex = trimmed.indexOf('=');
    if (separatorIndex <= 0) {
      continue;
    }

    if (trimmed.slice(0, separatorIndex) === name) {
      return trimmed.slice(separatorIndex + 1);
    }
  }

  return null;
};

const isSunoCookieUsable = async (cookieHeader) => {
  const clientToken = getCookieValue(cookieHeader, requiredCookieName);
  if (!clientToken) {
    return false;
  }

  try {
    const response = await axios.get(clerkClientUrl, {
      headers: {
        Authorization: clientToken,
        Cookie: cookieHeader
      },
      timeout: validationTimeoutMs,
      validateStatus: () => true
    });

    if (response.status !== 200) {
      return false;
    }

    return Boolean(response.data?.response?.last_active_session_id);
  } catch {
    return false;
  }
};

const serializeCookies = (cookies) => {
  const unique = new Map();
  for (const item of cookies) {
    if (!item.name || item.value === undefined) {
      continue;
    }
    unique.set(item.name, `${item.name}=${item.value}`);
  }
  return [...unique.values()].join('; ');
};

const readSunoCookieFromContext = async (context) => {
  const cookies = await context.cookies(cookieProbeUrls);
  const cookieHeader = serializeCookies(cookies);
  return cookieHeader.includes(`${requiredCookieName}=`) ? cookieHeader : null;
};

const isLoggedInCreatePage = async (page) => {
  try {
    if (!page.url().startsWith('https://suno.com/create')) {
      return false;
    }

    return page.evaluate(() => {
      const text = document.body.innerText || '';
      return !text.includes('Join Suno for free') && !text.startsWith('Log in');
    });
  } catch {
    return false;
  }
};

const waitForSunoCookie = async (context, getCapturedCookieHeader) => {
  const deadline = Date.now() + pollTimeoutMs;
  while (Date.now() < deadline) {
    const pages = context.pages();
    const createPage =
      pages.find((page) => page.url().startsWith('https://suno.com/create')) ??
      pages[0];
    const isLoggedIn = createPage
      ? await isLoggedInCreatePage(createPage)
      : false;

    if (!isLoggedIn) {
      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
      continue;
    }

    const capturedCookieHeader = getCapturedCookieHeader();
    if (
      capturedCookieHeader?.includes(`${requiredCookieName}=`) &&
      (await isSunoCookieUsable(capturedCookieHeader))
    ) {
      return capturedCookieHeader;
    }

    const contextCookieHeader = await readSunoCookieFromContext(context);
    if (
      contextCookieHeader &&
      (await isSunoCookieUsable(contextCookieHeader))
    ) {
      return contextCookieHeader;
    }

    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }

  throw new Error('Timed out waiting for Suno login cookies.');
};

const ensureInternalApiKey = async (env) => {
  if (env.get('INTERNAL_API_KEY')?.trim()) {
    return {};
  }

  return {
    INTERNAL_API_KEY: randomBytes(32).toString('hex')
  };
};

const launchLoginContext = async () => {
  await fs.mkdir(authProfileDir, { recursive: true });
  return chromium.launchPersistentContext(authProfileDir, {
    headless: false,
    viewport: { width: 1280, height: 900 },
    args: ['--disable-blink-features=AutomationControlled']
  });
};

export const ensureSunoCookie = async ({ force = false } = {}) => {
  const envContent = await readEnvFile();
  const env = parseEnv(envContent);
  const envUpdates = await ensureInternalApiKey(env);

  if (
    !force &&
    hasReusableCookie(env) &&
    (await isSunoCookieUsable(env.get('SUNO_COOKIE').trim()))
  ) {
    if (Object.keys(envUpdates).length > 0) {
      await updateEnvFile(envUpdates);
      console.log('Generated INTERNAL_API_KEY in .env.');
    }
    console.log('SUNO_COOKIE exists and is usable.');
    return;
  }

  if (!force && hasReusableCookie(env)) {
    console.log('SUNO_COOKIE exists but is not usable. Refreshing it.');
  } else {
    console.log('SUNO_COOKIE is missing. Capturing it once.');
  }
  console.log('Opening a dedicated Suno login browser.');
  console.log('Log in there once; this script will store SUNO_COOKIE in .env without printing it.');

  const context = await launchLoginContext();
  let capturedCookieHeader = '';

  context.on('request', (request) => {
    const url = request.url();
    if (
      url.includes('auth.suno.com/v1/client') &&
      url.includes('__clerk_api_version')
    ) {
      const cookieHeader = request.headers().cookie;
      if (cookieHeader?.includes(`${requiredCookieName}=`)) {
        capturedCookieHeader = cookieHeader;
      }
    }
  });

  try {
    const page = context.pages()[0] ?? (await context.newPage());
    await page.goto(loginUrl, {
      waitUntil: 'domcontentloaded',
      timeout: 0
    });

    const sunoCookie = await waitForSunoCookie(
      context,
      () => capturedCookieHeader
    );

    if (!(await isSunoCookieUsable(sunoCookie))) {
      throw new Error('Suno login completed, but the captured cookie is not usable.');
    }

    await updateEnvFile({
      ...envUpdates,
      SUNO_COOKIE: sunoCookie
    });

    if (envUpdates.INTERNAL_API_KEY) {
      console.log('Generated INTERNAL_API_KEY in .env.');
    }
    console.log('SUNO_COOKIE stored in .env.');
  } finally {
    await context.close();
  }
};

if (import.meta.url === `file://${process.argv[1]}`) {
  const force = process.argv.includes('--force');
  ensureSunoCookie({ force }).catch((error) => {
    console.error(error.message || error);
    process.exit(1);
  });
}
