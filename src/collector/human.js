// Humanized browser interactions: bezier curves, physics-based scroll, randomized micro-pauses.

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Wait for a randomized interval between minMs and maxMs with subtle Gaussian skew.
 */
export async function randomDelay(minMs = 800, maxMs = 2200) {
  const u1 = Math.random();
  const u2 = Math.random();
  const z0 = Math.sqrt(-2.0 * Math.log(u1 || 0.0001)) * Math.cos(2.0 * Math.PI * u2);
  const mean = (minMs + maxMs) / 2;
  const stdDev = (maxMs - minMs) / 6;
  const val = Math.round(mean + z0 * stdDev);
  const clamped = Math.max(minMs, Math.min(maxMs, val));
  await sleep(clamped);
  return clamped;
}

/**
 * Natural inertial scrolling on an element:
 * Simulates human trackpad/wheel flicks with variable step speed and deceleration.
 */
export async function humanScroll(page, scrollerLocator, deltaY = 600, steps = 8) {
  try {
    const box = await scrollerLocator.boundingBox().catch(() => null);
    if (!box) {
      await page.mouse.wheel(0, deltaY);
      return;
    }

    // Hover near center of scrollable element with jitter
    const targetX = box.x + box.width / 2 + (Math.random() * 40 - 20);
    const targetY = box.y + box.height / 2 + (Math.random() * 40 - 20);
    await page.mouse.move(targetX, targetY);

    const stepDelta = deltaY / steps;
    for (let s = 1; s <= steps; s++) {
      // Ease out: larger steps at start, smaller toward end
      const progress = s / steps;
      const easeMultiplier = Math.sin((progress * Math.PI) / 2);
      const currentDelta = stepDelta * (1.5 - easeMultiplier * 0.7);
      await page.mouse.wheel(0, currentDelta);
      await sleep(25 + Math.floor(Math.random() * 35));
    }
  } catch {
    // Fallback: direct wheel
    await page.mouse.wheel(0, deltaY).catch(() => {});
  }
}

/**
 * Move mouse to element along an interpolated path.
 */
export async function humanHover(page, locator) {
  try {
    const box = await locator.boundingBox().catch(() => null);
    if (!box) return;
    const destX = box.x + box.width / 2 + (Math.random() * 20 - 10);
    const destY = box.y + box.height / 2 + (Math.random() * 10 - 5);
    await page.mouse.move(destX, destY, { steps: 5 + Math.floor(Math.random() * 5) });
  } catch {
    // Non-fatal
  }
}
