import fs from 'fs';
import path from 'path';
import { chromium, Page } from 'playwright';
import { PNG } from 'pngjs';
import { PatternAnalyzer, Choice } from './pattern-analyzer';

type BetSide = 'PLAYER' | 'BANKER';

interface RoadmapReadResult {
  history: Choice[];
  redPixels: number;
  bluePixels: number;
  savedPath: string | null;
  derived?: DerivedRegionStats;
}

interface DerivedRegionStats {
  redPixels: number;
  bluePixels: number;
  redRatio: number;
  majority: BetSide | 'UNKNOWN';
}

const VIEWPORT = { width: 1366, height: 768 };
const PROFILE_DIR =
  process.env.PLAYWRIGHT_PROFILE_DIR && process.env.PLAYWRIGHT_PROFILE_DIR.trim() !== ''
    ? path.resolve(process.env.PLAYWRIGHT_PROFILE_DIR)
    : path.join(__dirname, '..', 'data', 'chromium-profile');
const ALLOW_TEMP_PROFILE = process.env.ALLOW_TEMP_PROFILE === '1';
// Default: fixed click only to avoid accidental pair/dual bets. Set BET_CLICK_MODE=text only if you really need it.
const BET_CLICK_MODE = (process.env.BET_CLICK_MODE ?? 'fixed').toLowerCase();
// Shape click stays off by default (set BET_SHAPE_FIRST=1 to enable).
const BET_SHAPE_FIRST = (process.env.BET_SHAPE_FIRST ?? '0') === '1';
// Fixed coords approximated to main ovals (1366x768 baseline, avoiding pair edges).
const BET_PLAYER_X = parseFloat(process.env.BET_PLAYER_X ?? '0.62');
const BET_BANKER_X = parseFloat(process.env.BET_BANKER_X ?? '0.69');
const BET_Y = parseFloat(process.env.BET_Y ?? '0.80');
// Signal gating
const MIN_CONFIDENCE = parseFloat(process.env.MIN_CONFIDENCE ?? '70');
const MIN_HISTORY = parseInt(process.env.MIN_HISTORY ?? '5', 10);
const ALLOW_OVERRIDE = (process.env.ALLOW_OVERRIDE ?? '0') === '1';
const MIN_PIXELS = parseInt(process.env.MIN_PIXELS ?? '400', 10);
const MIN_GREEN_CLOCK_PIXELS = parseInt(process.env.MIN_GREEN_CLOCK_PIXELS ?? '1200', 10);
// Chip selection
const CHIP_CLICK_MODE = (process.env.CHIP_CLICK_MODE ?? 'once').toLowerCase(); // 'once' | 'each' | 'off'
const CHIP_X = parseFloat(process.env.CHIP_X ?? '0.14');
const CHIP_Y = parseFloat(process.env.CHIP_Y ?? '0.93');
const RUN_LOG_PATH = path.join(__dirname, '..', 'data', 'bot-log.txt');
const RUN_STD_LOG_PATH = path.join(__dirname, '..', 'data', 'bot-run.log');
const TIMER_REGION = { x: 0.45, y: 0.15, width: 0.1, height: 0.2 }; // heuristic: center-top timer

const log = (message: string) => {
  console.log(`[bot] ${message}`);
  const line = `${new Date().toISOString()}\t${message}\n`;
  fs.promises
    .mkdir(path.dirname(RUN_STD_LOG_PATH), { recursive: true })
    .then(() => fs.promises.appendFile(RUN_STD_LOG_PATH, line, 'utf8'))
    .catch(() => undefined);
};

const isRed = (r: number, g: number, b: number) =>
  r > 110 && r - g > 25 && r - b > 25;

// Loosen blue detection further to capture dim/partial blues.
const isBlue = (r: number, g: number, b: number) =>
  b > 70 && b - r > 10 && b - g > 10;

function classifySample(r: number, g: number, b: number): Choice | null {
  if (isRed(r, g, b)) return 'R';
  if (isBlue(r, g, b)) return 'B';
  return null;
}

interface Region {
  x: number;
  y: number;
  width: number;
  height: number;
}

function clamp(val: number, min: number, max: number) {
  return Math.min(Math.max(val, min), max);
}

function detectGreenClock(buffer: Buffer): { greenCount: number } {
  const png = PNG.sync.read(buffer);
  let greenCount = 0;
  for (let y = 0; y < png.height; y++) {
    for (let x = 0; x < png.width; x++) {
      const idx = (png.width * y + x) * 4;
      const r = png.data[idx];
      const g = png.data[idx + 1];
      const b = png.data[idx + 2];
      if (g > 120 && g > r * 1.6 && g > b * 1.6) {
        greenCount++;
      }
    }
  }
  return { greenCount };
}

async function clickChip(page: Page) {
  const viewport = page.viewportSize() ?? VIEWPORT;
  const coords = {
    x: Math.round(viewport.width * CHIP_X),
    y: Math.round(viewport.height * CHIP_Y)
  };
  await page.mouse.click(coords.x, coords.y, { button: 'left', clickCount: 1, delay: 25 });
  log(`clicked chip (coords ${coords.x},${coords.y} frac=${CHIP_X.toFixed(3)},${CHIP_Y.toFixed(3)})`);
}

function computeRegionStats(png: PNG, region: Region) {
  let redPixels = 0;
  let bluePixels = 0;

  for (let y = region.y; y < region.y + region.height; y++) {
    for (let x = region.x; x < region.x + region.width; x++) {
      const idx = (png.width * y + x) * 4;
      const r = png.data[idx];
      const g = png.data[idx + 1];
      const b = png.data[idx + 2];
      if (isRed(r, g, b)) redPixels++;
      else if (isBlue(r, g, b)) bluePixels++;
    }
  }

  return { redPixels, bluePixels };
}

function readRoadmapFromPng(buffer: Buffer, savePath: string | null, region?: Region): RoadmapReadResult {
  const png = PNG.sync.read(buffer);

  const area: Region =
    region ?? {
      x: 0,
      y: 0,
      width: png.width,
      height: png.height
    };

  const { redPixels, bluePixels } = computeRegionStats(png, area);

  const cols = 24;
  const rows = 6;
  const cellW = area.width / cols;
  const cellH = area.height / rows;
  const history: Choice[] = [];

  for (let col = 0; col < cols; col++) {
    for (let row = 0; row < rows; row++) {
      const cx = Math.floor((col + 0.5) * cellW);
      const cy = Math.floor((row + 0.5) * cellH);

      // Sample a few pixels around the cell center to reduce noise.
      const offsets = [
        { dx: 0, dy: 0 },
        { dx: Math.floor(cellW * 0.15), dy: 0 },
        { dx: -Math.floor(cellW * 0.15), dy: 0 },
        { dx: 0, dy: Math.floor(cellH * 0.15) },
        { dx: 0, dy: -Math.floor(cellH * 0.15) }
      ];

      let rVotes = 0;
      let bVotes = 0;
      for (const { dx, dy } of offsets) {
        const x = clamp(area.x + cx + dx, 0, png.width - 1);
        const y = clamp(area.y + cy + dy, 0, png.height - 1);
        const idx = (png.width * y + x) * 4;
        const r = png.data[idx];
        const g = png.data[idx + 1];
        const b = png.data[idx + 2];
        const result = classifySample(r, g, b);
        if (result === 'R') rVotes++;
        else if (result === 'B') bVotes++;
      }

      if (rVotes === 0 && bVotes === 0) continue;
      history.push(rVotes >= bVotes ? 'R' : 'B');
    }
  }

  return {
    history,
    redPixels,
    bluePixels,
    savedPath: savePath
  };
}

function analyzeDerivedRegion(png: PNG, region: Region): DerivedRegionStats {
  const { redPixels, bluePixels } = computeRegionStats(png, region);
  const total = redPixels + bluePixels || 1;
  const redRatio = redPixels / total;
  let majority: BetSide | 'UNKNOWN' = 'UNKNOWN';
  if (redPixels > bluePixels) majority = 'BANKER';
  else if (bluePixels > redPixels) majority = 'PLAYER';
  return { redPixels, bluePixels, redRatio: Math.round(redRatio * 100) / 100, majority };
}

async function captureRoadmap(page: Page): Promise<RoadmapReadResult> {
  const viewport = page.viewportSize() ?? VIEWPORT;
  const clip = {
    // Focus more on the right/lower boards (derived area) as requested.
    x: Math.floor(viewport.width * 0.45),
    y: Math.floor(viewport.height * 0.35),
    width: Math.min(Math.floor(viewport.width * 0.52), viewport.width - Math.floor(viewport.width * 0.45)),
    height: Math.min(Math.floor(viewport.height * 0.6), viewport.height - Math.floor(viewport.height * 0.35))
  };

  const saveScreenshot = process.env.SAVE_ROADMAP === '1';
  const savePath = saveScreenshot
    ? path.join(__dirname, '..', 'data', `roadmap-${Date.now()}.png`)
    : null;

  const buffer = await page.screenshot({ clip });

  if (savePath) {
    await fs.promises.mkdir(path.dirname(savePath), { recursive: true });
    await fs.promises.writeFile(savePath, buffer);
    log(`roadmap screenshot saved to ${savePath}`);
  }

  const png = PNG.sync.read(buffer);
  const bigRoadRegion: Region = {
    x: 0,
    y: 0,
    width: png.width,
    height: Math.floor(png.height * 0.6)
  };
  // Emphasize bottom-right section (question marks / predictions area).
  const derivedRegion: Region = {
    x: Math.floor(png.width * 0.55),
    y: Math.floor(png.height * 0.6),
    width: png.width - Math.floor(png.width * 0.55),
    height: png.height - Math.floor(png.height * 0.6)
  };

  const roadmap = readRoadmapFromPng(buffer, savePath, bigRoadRegion);
  roadmap.derived = analyzeDerivedRegion(png, derivedRegion);
  return roadmap;
}

async function getTimerSignature(page: Page) {
  const viewport = page.viewportSize() ?? VIEWPORT;
  const clip = {
    x: Math.floor(viewport.width * TIMER_REGION.x),
    y: Math.floor(viewport.height * TIMER_REGION.y),
    width: Math.floor(viewport.width * TIMER_REGION.width),
    height: Math.floor(viewport.height * TIMER_REGION.height)
  };
  const buf = await page.screenshot({ clip });
  let sum = 0;
  for (const b of buf) sum = (sum + b) >>> 0;
  return { sum, size: buf.length };
}

async function waitForTimerTick(page: Page, pollMs = 400, timeoutMs = 8000) {
  try {
    const start = Date.now();
    const initial = await getTimerSignature(page);
    while (Date.now() - start < timeoutMs) {
      await page.waitForTimeout(pollMs);
      const current = await getTimerSignature(page);
      if (current.sum !== initial.sum || current.size !== initial.size) {
        log('timer tick detected (signature changed)');
        return true;
      }
    }
    log('timer tick wait timed out; skipping bet this round');
    return false;
  } catch (err) {
    log(`timer tick detection failed: ${err}`);
    return false;
  }
}

type Decision = { bet: BetSide; reason: string; confidence: number; method: 'pattern' | 'density' | 'derived' };

function recommendBet(history: Choice[], redPixels: number, bluePixels: number, derived?: DerivedRegionStats): Decision {
  const total = redPixels + bluePixels || 1;
  const redRatio = redPixels / total;

  if (derived && derived.majority !== 'UNKNOWN') {
    const majority = derived.majority;
    const blueRatio = 1 - redRatio;
    const nearEven = Math.abs(redRatio - 0.5) < 0.12;
    const derivedConf = Math.max(60, Math.round(Math.abs(redRatio - 0.5) * 200));
    if (nearEven || (majority === 'PLAYER' && blueRatio > redRatio)) {
      return {
        bet: majority,
        reason: `Derived region majority (${majority}) redRatio=${redRatio.toFixed(2)} derivedRatio=${derived.redRatio}`,
        confidence: derivedConf,
        method: 'derived'
      };
    }
  }

  if (history.length >= 4) {
    const analyzer = new PatternAnalyzer(history);
    const analysis = analyzer.analyze();
    const bet: BetSide = analysis.recommendedChoice === 'R' ? 'BANKER' : 'PLAYER';
    return {
      bet,
      reason: `Pattern-based: ${analysis.reason}`,
      confidence: Math.round(analysis.confidence),
      method: 'pattern'
    };
  }

  const bet: BetSide = redRatio >= 0.5 ? 'BANKER' : 'PLAYER';
  const confidence = Math.round(Math.max(redRatio, 1 - redRatio) * 100);
  return {
    bet,
    reason: 'Color density fallback',
    confidence,
    method: 'density'
  };
}

async function recordDecision(
  history: Choice[],
  redPixels: number,
  bluePixels: number,
  decision: Decision,
  derived?: DerivedRegionStats
) {
  try {
    await fs.promises.mkdir(path.dirname(RUN_LOG_PATH), { recursive: true });
    const line = [
      new Date().toISOString(),
      `history=${history.join('') || 'none'}`,
      `red=${redPixels}`,
      `blue=${bluePixels}`,
      `bet=${decision.bet}`,
      `confidence=${decision.confidence}`,
      `method=${decision.method}`,
      `reason=${decision.reason}`,
      derived ? `derived_red=${derived.redPixels}` : 'derived_red=',
      derived ? `derived_blue=${derived.bluePixels}` : 'derived_blue=',
      derived ? `derived_majority=${derived.majority}` : 'derived_majority=',
      derived ? `derived_ratio=${derived.redRatio}` : 'derived_ratio='
    ].join('\t');
    await fs.promises.appendFile(RUN_LOG_PATH, `${line}\n`, 'utf8');
    log(`run logged to ${RUN_LOG_PATH}`);
  } catch (err) {
    log(`failed to write run log: ${err}`);
  }
}

async function findLargestText(page: Page, text: string) {
  let locator = page.getByText(text, { exact: true });
  let count = await locator.count();

  if (count === 0) {
    locator = page.getByText(new RegExp(text, 'i'));
    count = await locator.count();
  }

  if (count === 0) {
    locator = page.getByRole('button', { name: new RegExp(text, 'i') });
    count = await locator.count();
  }

  let bestIdx = -1;
  let bestArea = -1;

  for (let i = 0; i < count; i++) {
    const box = await locator.nth(i).boundingBox();
    if (!box) continue;
    const area = box.width * box.height;
    if (area > bestArea) {
      bestArea = area;
      bestIdx = i;
    }
  }

  if (bestIdx === -1) {
    throw new Error(`Unable to find clickable text for "${text}"`);
  }

  return locator.nth(bestIdx);
}

async function findBetLabel(page: Page, bet: BetSide, viewport: { width: number; height: number }) {
  const targetText = bet === 'PLAYER' ? 'PLAYER' : 'BANKER';
  const locatorCandidates = [
    () => page.getByText(new RegExp(`^${targetText}$`, 'i')),
    () => page.getByRole('button', { name: new RegExp(`^${targetText}$`, 'i') }),
    () => page.getByRole('heading', { name: new RegExp(`^${targetText}$`, 'i') }),
    () => page.locator('[aria-label*="' + targetText.toLowerCase() + '" i]'),
    () => page.locator('[title*="' + targetText.toLowerCase() + '" i]'),
    () => page.locator('[alt*="' + targetText.toLowerCase() + '" i]'),
    () => page.locator('[class*="' + targetText.toLowerCase() + '" i]')
  ];

  let bestLocator: ReturnType<Page['locator']> | null = null;
  let bestArea = -1;

  for (const get of locatorCandidates) {
    const loc = get();
    const count = await loc.count().catch(() => 0);
    if (!count) continue;
    for (let i = 0; i < count; i++) {
      const nth = loc.nth(i);
      // Skip elements whose text/label contains "PAIR".
      const name = await nth
        .evaluate(el => {
          const t = (el.innerText || '').toUpperCase();
          const a = (el.getAttribute('aria-label') || '').toUpperCase();
          const ttl = (el.getAttribute('title') || '').toUpperCase();
          const alt = (el.getAttribute('alt') || '').toUpperCase();
          return t || a || ttl || alt;
        })
        .catch(() => '');
      if (name.includes('PAIR')) continue;

      const box = await nth.boundingBox().catch(() => null);
      if (!box) continue;
      const cx = box.x + box.width / 2;
      const cy = box.y + box.height / 2;
      // Band filter to avoid pair zones: bottom band, and split left/right.
      const inBandY = cy > viewport.height * 0.6 && cy < viewport.height * 0.9;
      const inBandX =
        bet === 'PLAYER'
          ? cx > viewport.width * 0.55 && cx < viewport.width * 0.72
          : cx > viewport.width * 0.70 && cx < viewport.width * 0.86;
      if (!inBandY || !inBandX) continue;

      const area = box.width * box.height;
      if (area > bestArea) {
        bestArea = area;
        bestLocator = nth;
      }
    }
    if (bestLocator) break; // found a good candidate in this strategy
  }

  if (!bestLocator) throw new Error(`No ${targetText} label found`);
  return bestLocator;
}

async function findBetShape(page: Page, bet: BetSide, viewport: { width: number; height: number }) {
  const key = bet === 'PLAYER' ? 'player' : 'banker';
  const selectors = [
    `path[fill*="${key}"]`,
    `path[id*="${key}"]`,
    `path[class*="${key}"]`,
    `svg path[fill*="${key}"]`,
    `svg path[id*="${key}"]`,
    `svg path[class*="${key}"]`,
    // more tolerant: data attributes
    `path[data-fill*="${key}"]`,
    `path[data-name*="${key}"]`
  ];

  let bestLocator: ReturnType<Page['locator']> | null = null;
  let bestArea = -1;

  for (const sel of selectors) {
    const locator = page.locator(sel);
    const count = await locator.count().catch(() => 0);
    if (!count) continue;
    for (let i = 0; i < count; i++) {
      const nth = locator.nth(i);
      const box = await nth.boundingBox().catch(() => null);
      if (!box) continue;
      const cx = box.x + box.width / 2;
      const cy = box.y + box.height / 2;
      const inBandY = cy > viewport.height * 0.72 && cy < viewport.height * 0.86;
      const inBandX =
        bet === 'PLAYER'
          ? cx > viewport.width * 0.30 && cx < viewport.width * 0.42
          : cx > viewport.width * 0.58 && cx < viewport.width * 0.72;
      if (!inBandY || !inBandX) continue;
      const area = box.width * box.height;
      if (area > bestArea) {
        bestArea = area;
        bestLocator = nth;
      }
    }
  }

  if (!bestLocator) throw new Error(`No ${key} shape found`);
  return bestLocator;
}

async function clickBet(page: Page, bet: BetSide) {
  const viewport = page.viewportSize() ?? VIEWPORT;

  let clicked = false;
  // Single fixed click only to prevent dual/pair bets.
  const xFrac = bet === 'PLAYER' ? BET_PLAYER_X : BET_BANKER_X;
  const yFrac = BET_Y;
  const coords = {
    x: Math.round(viewport.width * xFrac),
    y: Math.round(viewport.height * yFrac)
  };
  await page.mouse.click(coords.x, coords.y, { button: 'left', clickCount: 1, delay: 35 });
  log(`clicked bet area: ${bet} (fixed coords ${coords.x},${coords.y} frac=${xFrac.toFixed(3)},${yFrac.toFixed(3)})`);
}

async function clickMute(page: Page) {
  const selectorLocators = [
    page.getByRole('button', { name: /mute|sound|volume|음소거|소리|음량/i }),
    page.getByRole('img', { name: /mute|sound|volume|음소거|소리|음량/i }),
    page.getByTitle(/mute|sound|volume|음소거|소리|음량/i),
    page.getByAltText(/mute|sound|volume|음소거|소리|음량/i),
    page.locator('[aria-label*="sound" i],[aria-label*="mute" i],[aria-label*="volume" i]'),
    page.locator('button:has-text("음소거"),button:has-text("소리"),button:has-text(/mute/i),button:has-text(/sound/i)')
  ];

  for (const locator of selectorLocators) {
    try {
      await locator.first().waitFor({ state: 'visible', timeout: 3000 });
      const target = locator.first();
      await target.scrollIntoViewIfNeeded();
      await target.click({ force: true, timeout: 2000 });
      log('clicked mute/sound toggle (by selector)');
      return;
    } catch {
      // try next
    }
  }

  const viewport = page.viewportSize() ?? VIEWPORT;
  // Single fallback click to avoid multiple flashes.
  const frac = { x: 0.97, y: 0.07 };
  const coords = {
    x: Math.round(viewport.width * frac.x),
    y: Math.round(viewport.height * frac.y)
  };
  await page.mouse.click(coords.x, coords.y, { button: 'left' });
  log(`clicked mute/sound toggle (fallback single ${coords.x},${coords.y})`);
}

async function openGame(page: Page): Promise<Page> {
  await page.goto('https://www.pokerstars-01.com/casino/', { waitUntil: 'domcontentloaded', timeout: 30000 });
  log('casino lobby opened');

  const clickProsperityCard = async () => {
    const candidates = [
      () => page.getByRole('button', { name: /Prosperity Tree Baccarat/i }).first(),
      () => page.getByRole('link', { name: /Prosperity Tree Baccarat/i }).first(),
      () => page.getByText(/Prosperity Tree Baccarat/i).first(),
      () => page.getByRole('img', { name: /Prosperity Tree Baccarat/i }).first().locator('xpath=ancestor::button[1]'),
      () => page.getByRole('img', { name: /Prosperity Tree Baccarat/i }).first().locator('xpath=ancestor::a[1]'),
      () => page.getByRole('img', { name: /Prosperity Tree Baccarat/i }).first()
    ];

    for (const get of candidates) {
      const locator = get();
      try {
        await locator.waitFor({ state: 'visible', timeout: 8000 });
        await locator.scrollIntoViewIfNeeded();
        await locator.click({ timeout: 8000, force: true });
        log('clicked Prosperity Tree Baccarat card');
        return;
      } catch {
        // Try next candidate.
      }
    }

    throw new Error('Unable to click Prosperity Tree Baccarat card');
  };

  const [popup] = await Promise.all([
    page.context().waitForEvent('page').catch(() => null),
    clickProsperityCard()
  ]);

  const gamePage = popup ?? page;
  await gamePage.waitForLoadState('domcontentloaded', { timeout: 30000 });
  log('game page opened');

  return gamePage;
}

async function waitForGameUi(page: Page) {
  await page.waitForTimeout(4000);
  await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => undefined);
  // Wait for table labels to ensure layout is rendered.
  await page.waitForSelector('text=PLAYER', { timeout: 15000 }).catch(() => undefined);
  await page.waitForSelector('text=BANKER', { timeout: 15000 }).catch(() => undefined);
}

async function main() {
  const headless = process.env.HEADLESS === '1';
  await fs.promises.mkdir(PROFILE_DIR, { recursive: true });

  // Use persistent profile so login/session stays saved between runs.
  const launchContext = async () =>
    chromium.launchPersistentContext(PROFILE_DIR, {
      headless,
      viewport: VIEWPORT
    });

  let context = await launchContext().catch(async err => {
    log(`persistent profile launch failed: ${err}. profileDir=${PROFILE_DIR}`);
    if (!ALLOW_TEMP_PROFILE) {
      throw new Error(
        `Persistent profile blocked. Close any running Playwright/Chrome using ${PROFILE_DIR} or set PLAYWRIGHT_PROFILE_DIR to a free path. Set ALLOW_TEMP_PROFILE=1 to fall back to a temp profile.`
      );
    }
    const freshProfile = `${PROFILE_DIR}-run-${Date.now()}`;
    log(`falling back to temp profile: ${freshProfile}`);
    await fs.promises.mkdir(freshProfile, { recursive: true });
    return chromium.launchPersistentContext(freshProfile, { headless, viewport: VIEWPORT });
  });
  const page = context.pages()[0] ?? (await context.newPage());

  try {
    let gamePage = await openGame(page);
    if (gamePage.isClosed()) {
      throw new Error('Game page closed before UI loaded (login may be required).');
    }
    await waitForGameUi(gamePage);
    await clickMute(gamePage);
    let chipSelected = false;
    if (CHIP_CLICK_MODE === 'once') {
      try {
        await clickChip(gamePage);
        chipSelected = true;
      } catch (err) {
        log(`chip click (once) failed: ${err}`);
      }
    }

    const maxRoundsEnv = parseInt(process.env.MAX_ROUNDS ?? '', 10);
    const maxRounds = Number.isFinite(maxRoundsEnv) && maxRoundsEnv > 0 ? maxRoundsEnv : Infinity;
    const loopDelayEnv = parseInt(process.env.LOOP_DELAY_MS ?? '', 10);
    const loopDelayMs = Number.isFinite(loopDelayEnv) && loopDelayEnv >= 0 ? loopDelayEnv : 6000;
    let round = 0;
    let lastBet: BetSide | null = null;
    let sameBetCount = 0;

    while (round < maxRounds) {
      round++;
      try {
        if (gamePage.isClosed()) {
          log('game page closed; reopening...');
          gamePage = await openGame(await context.newPage());
          await waitForGameUi(gamePage);
          await clickMute(gamePage);
        }

        log(`round ${round}: waiting for timer tick...`);
        const ticked = await waitForTimerTick(gamePage);
        if (!ticked) {
          await gamePage.waitForTimeout(loopDelayMs);
          continue;
        }

        log(`round ${round}: capturing roadmap area...`);
        // Skip betting if green clock (dealing) is on screen.
        const viewport = gamePage.viewportSize() ?? VIEWPORT;
        const centerClip = {
          x: Math.floor(viewport.width * 0.4),
          y: Math.floor(viewport.height * 0.3),
          width: Math.floor(viewport.width * 0.2),
          height: Math.floor(viewport.height * 0.3)
        };
        const centerBuf = await gamePage.screenshot({ clip: centerClip });
        const { greenCount } = detectGreenClock(centerBuf);
        if (greenCount >= MIN_GREEN_CLOCK_PIXELS) {
          log(`green clock detected (greenCount=${greenCount}, min=${MIN_GREEN_CLOCK_PIXELS}) - skipping bet this round`);
          await gamePage.waitForTimeout(loopDelayMs);
          continue;
        }

        const roadmap = await captureRoadmap(gamePage);

        const totalPixels = roadmap.redPixels + roadmap.bluePixels;
        if (roadmap.history.length === 0 || totalPixels < MIN_PIXELS) {
          log(
            `roadmap empty or weak (historyLen=${roadmap.history.length}, red=${roadmap.redPixels}, blue=${roadmap.bluePixels}, minPixels=${MIN_PIXELS}) - skipping bet this round`
          );
          await gamePage.waitForTimeout(loopDelayMs);
          continue;
        }

        log(
          `roadmap parsed: history=${roadmap.history.join('') || 'none'} redPixels=${roadmap.redPixels} bluePixels=${roadmap.bluePixels}`
        );
        if (roadmap.derived) {
      log(
        `derived region: red=${roadmap.derived.redPixels} blue=${roadmap.derived.bluePixels} redRatio=${roadmap.derived.redRatio} majority=${roadmap.derived.majority}`
      );
    }

    const decision = recommendBet(roadmap.history, roadmap.redPixels, roadmap.bluePixels, roadmap.derived);
    if (decision.bet === lastBet) sameBetCount += 1;
    else sameBetCount = 1;

    // Anti-banker bias when it's been repeating too much.
    if (ALLOW_OVERRIDE) {
      if (
        decision.bet === 'BANKER' &&
        sameBetCount >= 2 &&
        (
          roadmap.bluePixels > 0 ||
          roadmap.bluePixels > roadmap.redPixels * 0.2 ||
          (roadmap.derived?.majority === 'PLAYER') ||
          (roadmap.derived && roadmap.derived.redRatio < 0.6)
        )
      ) {
        log(
          `override: switching to PLAYER to avoid repeated BANKER (sameBetCount=${sameBetCount}, redRatio=${(
            roadmap.redPixels /
            (roadmap.redPixels + roadmap.bluePixels || 1)
          ).toFixed(2)}, derivedMajority=${roadmap.derived?.majority ?? 'n/a'}, derivedRatio=${roadmap.derived?.redRatio ?? 'n/a'})`
        );
        decision.bet = 'PLAYER';
        decision.reason = `Override from repeated BANKER, blue presence detected (${decision.reason})`;
        decision.method = 'derived';
      }

      // Hard cap: if BANKER repeats too many times, flip once to PLAYER.
      if (decision.bet === 'BANKER' && sameBetCount >= 4) {
        log(`override: forced PLAYER after ${sameBetCount} consecutive BANKER decisions`);
        decision.bet = 'PLAYER';
        decision.reason = `Forced flip after ${sameBetCount} BANKER decisions (${decision.reason})`;
        decision.method = 'derived';
        sameBetCount = 0;
      }
    }

        lastBet = decision.bet;
        // Confidence / history gating
        if (decision.confidence < MIN_CONFIDENCE || roadmap.history.length < MIN_HISTORY) {
          log(
            `skip bet: low signal (confidence=${decision.confidence}, min=${MIN_CONFIDENCE}, historyLen=${roadmap.history.length}, minHistory=${MIN_HISTORY})`
          );
          await gamePage.waitForTimeout(loopDelayMs);
          continue;
        }

        log(
          `bet decision: ${decision.bet} (confidence ${decision.confidence}%, method=${decision.method}) - ${decision.reason}`
        );
        log(
          `decision detail: historyLen=${roadmap.history.length} red=${roadmap.redPixels} blue=${roadmap.bluePixels} derivedMajority=${roadmap.derived?.majority ?? 'n/a'} derivedRatio=${roadmap.derived?.redRatio ?? 'n/a'}`
        );
        await recordDecision(roadmap.history, roadmap.redPixels, roadmap.bluePixels, decision, roadmap.derived);

        if (CHIP_CLICK_MODE === 'each' || (CHIP_CLICK_MODE === 'once' && !chipSelected)) {
          try {
            await clickChip(gamePage);
            chipSelected = true;
          } catch (err) {
            log(`chip click failed: ${err}`);
          }
        }

        await clickBet(gamePage, decision.bet);

        log(`round ${round} done. waiting ${loopDelayMs}ms before next capture.`);
        await gamePage.waitForTimeout(loopDelayMs);
      } catch (err) {
        log(`round ${round} error: ${err}`);
        if (!gamePage.isClosed()) {
          await gamePage.waitForTimeout(loopDelayMs);
          continue;
        }
        try {
          log('attempting to reopen game after error...');
          gamePage = await openGame(await context.newPage());
          await waitForGameUi(gamePage);
          await clickMute(gamePage);
        } catch (reopenErr) {
          log(`failed to reopen game: ${reopenErr}`);
          await page.waitForTimeout(loopDelayMs);
        }
      }
    }
  } finally {
    await context.close();
  }
}

main().catch(err => {
  console.error('[bot] error:', err);
  process.exit(1);
});
