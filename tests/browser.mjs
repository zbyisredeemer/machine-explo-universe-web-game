import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

export const gameURL = `${process.env.GAME_TEST_URL || 'http://127.0.0.1:4173'}/?qa`;
export const productionURL = `${process.env.GAME_PRODUCTION_URL || 'http://127.0.0.1:4174'}/?qa`;
export async function launchBrowser() {
  mkdirSync('test-results', { recursive: true });
  return chromium.launch({
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined,
    headless: true,
  });
}
