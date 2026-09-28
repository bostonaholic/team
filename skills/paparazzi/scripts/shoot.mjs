#!/usr/bin/env node

/**
 * Captures every frame of a shot list under one deterministic browser setup, so
 * the same list shot again renders the same pixels wherever the app does.
 *
 *     node "<skill-dir>/scripts/shoot.mjs" <shots.json> <out-dir>
 *
 * Writes `<out-dir>/<name>.png` for each frame that passes its gates and prints
 * one JSON report. Exit 0: every frame passed. 1: a frame failed, named in the report.
 * 2: the shot list is unusable; nothing was launched. 3: no Playwright or no browser.
 *
 * Playwright resolves from `$PAPARAZZI_TOOLS`, then from the working directory.
 */

import { mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { inspect } from "./png-check.mjs";

export const SHOT_TIMEOUT_MS = 30_000;
const NETWORK_IDLE_MS = 5_000;
const TARGET_PADDING = 16;
const MESSAGE_LIMIT = 5;
const MESSAGE_LENGTH = 200;

export const DEFAULT_CONTEXT = {
  viewport: { width: 1280, height: 800 },
  deviceScaleFactor: 2,
  colorScheme: "light",
  locale: "en-US",
  timezoneId: "UTC",
};

const NAME = /^\d{2}-[a-z0-9]+(?:-[a-z0-9]+)*$/;
const LIST_KEYS = new Set(["origin", "defaults", "shots"]);
const SHOT_KEYS = new Set(["name", "path", "actions", "waitFor", "target", "fullPage", "mask", "hide", "expectStatus", ...Object.keys(DEFAULT_CONTEXT)]);
const LOCATOR_ACTIONS = ["click", "hover", "check", "scroll", "fill"];

export class InputError extends Error {}

function fail(where, message) {
  throw new InputError(`${where}: ${message}`);
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function checkLocator(spec, where) {
  if (typeof spec === "string" && spec.trim()) return;
  if (isObject(spec)) {
    const keys = Object.keys(spec);
    const single = keys.length === 1 && ["text", "label", "testId"].includes(keys[0]) && typeof spec[keys[0]] === "string";
    const role = typeof spec.role === "string" && keys.every((key) => key === "role" || key === "name") && (spec.name === undefined || typeof spec.name === "string");
    if (single || role) return;
  }
  fail(where, "a locator is a selector string or one of {role[, name]}, {text}, {label}, {testId}");
}

function checkContext(context, where) {
  const { viewport, deviceScaleFactor, colorScheme, locale, timezoneId } = context;
  const dimension = (value) => Number.isInteger(value) && value > 0 && value <= 4096;
  if (!isObject(viewport) || !dimension(viewport.width) || !dimension(viewport.height)) fail(where, "viewport needs integer width and height in 1-4096");
  if (typeof deviceScaleFactor !== "number" || deviceScaleFactor < 1 || deviceScaleFactor > 3) fail(where, "deviceScaleFactor must be a number in 1-3");
  if (!["light", "dark"].includes(colorScheme)) fail(where, "colorScheme must be light or dark");
  if (typeof locale !== "string" || !locale) fail(where, "locale must be a non-empty string");
  if (typeof timezoneId !== "string" || !timezoneId) fail(where, "timezoneId must be a non-empty string");
}

function checkAction(action, where) {
  if (!isObject(action)) fail(where, "an action is an object");
  const [kind, ...extra] = Object.keys(action).filter((key) => key !== "value");
  if (extra.length || !kind) fail(where, "an action names exactly one of click, hover, check, scroll, fill, press");
  if (kind === "press") {
    if (typeof action.press !== "string" || !action.press || "value" in action) fail(where, "press takes one key name, such as Enter");
    return;
  }
  if (!LOCATOR_ACTIONS.includes(kind)) fail(where, `unknown action ${JSON.stringify(kind)}`);
  checkLocator(action[kind], `${where}.${kind}`);
  if (kind === "fill" && typeof action.value !== "string") fail(where, "fill needs a string value");
  if (kind !== "fill" && "value" in action) fail(where, `${kind} takes no value`);
}

/** Joins as strings, never `new URL(path, origin)`, so a `//host` path stays on its origin and keeps the origin's base path. */
function frameUrl(origin, path, where) {
  if (typeof path !== "string" || !path.startsWith("/")) fail(where, "path must start with /");
  return new URL(origin.replace(/\/+$/, "") + path).href;
}

function checkOrigin(origin, where) {
  let protocol;
  try {
    protocol = new URL(origin).protocol;
  } catch {
    fail(where, "not a URL");
  }
  if (protocol !== "http:" && protocol !== "https:") fail(where, "must be http or https");
}

/**
 * Validates the whole shot list and expands it into frames before any browser
 * starts, so an unusable list refuses with nothing launched.
 */
export function planFrames(list, outDir) {
  if (!isObject(list)) fail("shot list", "must be a JSON object");
  for (const key of Object.keys(list)) if (!LIST_KEYS.has(key)) fail(key, "unknown field");
  const { origin, defaults = {}, shots } = list;
  checkOrigin(origin, "origin");
  if (!isObject(defaults)) fail("defaults", "must be an object");
  for (const key of Object.keys(defaults)) if (!(key in DEFAULT_CONTEXT)) fail(`defaults.${key}`, "unknown setting");
  if (!Array.isArray(shots) || !shots.length) fail("shots", "must be a non-empty array");

  const frames = [];
  const names = new Set();
  shots.forEach((shot, index) => {
    const where = `shots[${index}]`;
    if (!isObject(shot)) fail(where, "must be an object");
    for (const key of Object.keys(shot)) if (!SHOT_KEYS.has(key)) fail(`${where}.${key}`, "unknown field");
    if (typeof shot.name !== "string" || !NAME.test(shot.name)) fail(`${where}.name`, "must match NN-lowercase-words, such as 01-settings-empty");
    if (names.has(shot.name)) fail(`${where}.name`, "duplicate name");
    names.add(shot.name);

    const context = { ...DEFAULT_CONTEXT, ...defaults };
    for (const key of Object.keys(DEFAULT_CONTEXT)) if (key in shot) context[key] = shot[key];
    checkContext(context, where);

    const actions = shot.actions ?? [];
    if (!Array.isArray(actions)) fail(`${where}.actions`, "must be an array");
    actions.forEach((action, at) => checkAction(action, `${where}.actions[${at}]`));
    for (const key of ["waitFor", "target"]) if (key in shot) checkLocator(shot[key], `${where}.${key}`);
    for (const key of ["mask", "hide"]) {
      if (!(key in shot)) continue;
      if (!Array.isArray(shot[key])) fail(`${where}.${key}`, "must be an array of locators");
      shot[key].forEach((spec, at) => checkLocator(spec, `${where}.${key}[${at}]`));
    }
    if ("expectStatus" in shot && !(Number.isInteger(shot.expectStatus) && shot.expectStatus >= 100 && shot.expectStatus <= 599)) {
      fail(`${where}.expectStatus`, "must be an HTTP status code");
    }
    if ("fullPage" in shot && typeof shot.fullPage !== "boolean") fail(`${where}.fullPage`, "must be true or false");
    if (shot.fullPage && "target" in shot) fail(where, "fullPage and target are exclusive");

    frames.push({
      shot,
      context,
      name: shot.name,
      url: frameUrl(origin, shot.path, `${where}.path`),
      file: join(outDir, `${shot.name}.png`),
    });
  });
  return frames;
}

function loadPlaywright() {
  const bases = [process.env.PAPARAZZI_TOOLS, process.cwd()].filter(Boolean);
  for (const base of bases) {
    const require = createRequire(join(resolve(base), "package.json"));
    for (const name of ["playwright", "@playwright/test", "playwright-core"]) {
      try {
        return { playwright: require(name), from: `${name} in ${resolve(base)}` };
      } catch {
        continue;
      }
    }
  }
  return null;
}

async function launch(chromium) {
  try {
    return { browser: await chromium.launch(), channel: "chromium" };
  } catch (bundled) {
    try {
      return { browser: await chromium.launch({ channel: "chrome" }), channel: "chrome" };
    } catch (chrome) {
      throw new Error(`no browser: bundled chromium: ${firstLine(bundled)}; chrome: ${firstLine(chrome)}`);
    }
  }
}

function firstLine(error) {
  return String(error?.message ?? error).split("\n")[0].slice(0, MESSAGE_LENGTH);
}

function locate(page, spec) {
  if (typeof spec === "string") return page.locator(spec);
  if ("role" in spec) return page.getByRole(spec.role, spec.name === undefined ? {} : { name: spec.name, exact: true });
  if ("text" in spec) return page.getByText(spec.text, { exact: true });
  if ("label" in spec) return page.getByLabel(spec.label, { exact: true });
  return page.getByTestId(spec.testId);
}

async function perform(page, action) {
  if ("press" in action) return page.keyboard.press(action.press);
  const [kind] = Object.keys(action).filter((key) => key !== "value");
  const target = locate(page, action[kind]).first();
  if (kind === "fill") return target.fill(action.value);
  if (kind === "scroll") return target.scrollIntoViewIfNeeded();
  return target[kind]();
}

/** Waits out the network, web fonts, images in view, and two frames of layout. Returns whether the network went idle. */
async function settle(page) {
  const networkIdle = await page.waitForLoadState("networkidle", { timeout: NETWORK_IDLE_MS }).then(
    () => true,
    () => false,
  );
  await page.evaluate(async (budget) => {
    await document.fonts.ready;
    const inView = (image) => {
      const box = image.getBoundingClientRect();
      return box.bottom > 0 && box.right > 0 && box.top < innerHeight && box.left < innerWidth;
    };
    const pending = [...document.images].filter((image) => !image.complete && inView(image));
    const loaded = Promise.all(
      pending.map(
        (image) =>
          new Promise((done) => {
            image.addEventListener("load", done);
            image.addEventListener("error", done);
          }),
      ),
    );
    await Promise.race([loaded, new Promise((done) => setTimeout(done, budget))]);
    await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));
  }, NETWORK_IDLE_MS);
  return networkIdle;
}

async function clipTo(page, spec, viewport) {
  const target = locate(page, spec).first();
  await target.scrollIntoViewIfNeeded();
  await settle(page);
  const box = await target.boundingBox();
  if (!box) throw new Error("target is not visible");
  const left = Math.max(0, box.x - TARGET_PADDING);
  const top = Math.max(0, box.y - TARGET_PADDING);
  const right = Math.min(viewport.width, box.x + box.width + TARGET_PADDING);
  const bottom = Math.min(viewport.height, box.y + box.height + TARGET_PADDING);
  if (right <= left || bottom <= top) throw new Error("target lies outside the viewport");
  return { x: left, y: top, width: right - left, height: bottom - top };
}

function note(list, text) {
  if (list.length < MESSAGE_LIMIT) list.push(String(text).split("\n")[0].slice(0, MESSAGE_LENGTH));
}

async function capture(browser, frame) {
  const { shot, context: settings } = frame;
  const result = { name: frame.name, url: frame.url, file: null, ok: false, status: null, networkIdle: null, consoleErrors: [], pageErrors: [], failedRequests: [], reason: null };
  const context = await browser.newContext({ ...settings, reducedMotion: "reduce" });
  try {
    const page = await context.newPage();
    page.setDefaultTimeout(SHOT_TIMEOUT_MS);
    page.on("console", (message) => message.type() === "error" && note(result.consoleErrors, message.text()));
    page.on("pageerror", (error) => note(result.pageErrors, error.message));
    page.on("requestfailed", (request) => note(result.failedRequests, `failed ${request.url()}`));
    page.on("response", (response) => response.status() >= 400 && note(result.failedRequests, `${response.status()} ${response.url()}`));

    const response = await page.goto(frame.url, { waitUntil: "load", timeout: SHOT_TIMEOUT_MS });
    result.status = response?.status() ?? null;
    const expected = shot.expectStatus;
    if (expected === undefined ? result.status >= 400 : result.status !== expected) {
      result.reason = `HTTP ${result.status}, expected ${expected ?? "below 400"}`;
      return result;
    }

    result.networkIdle = await settle(page);
    for (const action of shot.actions ?? []) {
      await perform(page, action);
      result.networkIdle = (await settle(page)) && result.networkIdle;
    }
    if (shot.waitFor) await locate(page, shot.waitFor).first().waitFor({ state: "visible" });
    if (shot.hide?.length) {
      const hidden = await Promise.all(shot.hide.map((spec) => locate(page, spec).elementHandles()));
      await page.evaluate((elements) => elements.forEach((element) => element.style.setProperty("visibility", "hidden", "important")), hidden.flat());
    }

    const clip = shot.target ? await clipTo(page, shot.target, settings.viewport) : undefined;
    const buffer = await page.screenshot({
      clip,
      fullPage: shot.fullPage === true,
      animations: "disabled",
      caret: "hide",
      mask: (shot.mask ?? []).map((spec) => locate(page, spec)),
      maskColor: "#9ca3af",
      timeout: SHOT_TIMEOUT_MS,
    });

    const check = inspect(buffer);
    Object.assign(result, { width: check.width, height: check.height, bytes: check.bytes, sparse: check.sparse });
    if (check.failures.length) {
      result.reason = check.failures.join("; ");
      return result;
    }
    writeFileSync(frame.file, buffer);
    Object.assign(result, { file: frame.file, ok: true });
    return result;
  } catch (error) {
    result.reason = firstLine(error);
    return result;
  } finally {
    await context.close();
  }
}

async function main(argv) {
  const [listPath, outDir, ...rest] = argv;
  if (!listPath || !outDir || rest.length) {
    process.stderr.write("shoot.mjs: usage: shoot.mjs <shots.json> <out-dir>\n");
    return 2;
  }

  let planned;
  try {
    planned = planFrames(JSON.parse(readFileSync(listPath, "utf8")), resolve(outDir));
  } catch (error) {
    process.stderr.write(`shoot.mjs: ${error.message}\n`);
    return 2;
  }

  const loaded = loadPlaywright();
  if (!loaded) {
    process.stderr.write("shoot.mjs: no playwright package in $PAPARAZZI_TOOLS or the working directory\n");
    return 3;
  }
  let launched;
  try {
    launched = await launch(loaded.playwright.chromium);
  } catch (error) {
    process.stderr.write(`shoot.mjs: ${error.message}\n`);
    return 3;
  }

  mkdirSync(resolve(outDir), { recursive: true });
  const frames = [];
  try {
    for (const frame of planned) frames.push(await capture(launched.browser, frame));
  } finally {
    await launched.browser.close();
  }

  const report = { playwright: loaded.from, browser: launched.channel, frames };
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  return frames.every((frame) => frame.ok) ? 0 : 1;
}

// Node realpaths import.meta.url but not argv[1], so a symlinked path needs realpathSync.
if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  process.exitCode = await main(process.argv.slice(2));
}
