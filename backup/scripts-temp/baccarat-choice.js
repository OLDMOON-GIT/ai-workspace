#!/usr/bin/env node
/**
 * Detect the rightmost bead-road color (red/green/blue) in a baccarat screenshot
 * and click the corresponding bet area with Playwright.
 *
 * Requirements: npm i playwright sharp
 *
 * Usage:
 *   node baccarat-choice.js --image images/1764858596623.jpg --url https://your-baccarat-table
 */

const { chromium } = require('playwright');
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
function getArg(name, fallback) {
  const idx = args.indexOf(`--${name}`);
  if (idx !== -1 && args[idx + 1]) return args[idx + 1];
  return fallback;
}

const imagePath = getArg('image', path.join(__dirname, 'images', '1764858596623.jpg'));
const tableUrl = getArg('url', 'https://example.com'); // put the live table URL here

async function detectBetFromImage(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Image not found: ${filePath}`);
  }

  // The bead-road is at the bottom-right of the provided screenshot.
  // Crop a tight box around it to reduce noise. (Assumes 1280x720 screenshot.)
  const cropRegion = { left: 880, top: 500, width: 400, height: 180 };

  const { data, info } = await sharp(filePath)
    .extract(cropRegion)
    .raw()
    .toBuffer({ resolveWithObject: true });

  const toColor = (r, g, b) => {
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const sat = max === 0 ? 0 : (max - min) / max;
    if (sat < 0.25 || max < 60) return null; // ignore near-gray/black
    if (r > g * 1.2 && r > b * 1.2) return 'red';
    if (g > r * 1.2 && g > b * 1.2) return 'green';
    if (b > r * 1.2 && b > g * 1.2) return 'blue';
    return null;
  };

  // Scan from right to left, top to bottom to find the most recent bead.
  for (let x = info.width - 1; x >= 0; x--) {
    for (let y = 0; y < info.height; y++) {
      const idx = (y * info.width + x) * 3;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];
      const color = toColor(r, g, b);
      if (color) {
        if (color === 'red') return 'banker';
        if (color === 'blue') return 'player';
        if (color === 'green') return 'tie';
      }
    }
  }

  return 'tie'; // fallback
}

async function main() {
  const bet = await detectBetFromImage(imagePath);
  console.log(`Detected bet: ${bet}`);

  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await page.goto(tableUrl, { waitUntil: 'networkidle' });

  // Approximate positions of bet areas (PLAYER/TIE/BANKER) on a 1280x720 table UI.
  // Adjust if your layout differs.
  const targets = {
    player: { x: 440, y: 620 },
    tie: { x: 640, y: 620 },
    banker: { x: 840, y: 620 },
  };

  const pos = targets[bet];
  if (!pos) throw new Error(`No click target for bet: ${bet}`);

  await page.mouse.click(pos.x, pos.y);
  console.log(`Clicked ${bet} at (${pos.x}, ${pos.y})`);

  // keep browser open for inspection
  await page.waitForTimeout(3000);
  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
