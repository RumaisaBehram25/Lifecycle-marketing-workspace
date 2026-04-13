/**
 * Run: `npx tsx src/lib/campaignDisplay.heroImage.test.ts`
 */
import { strict as assert } from 'node:assert';
import {
  extractHeroImageFromHtml,
  isLikelyLogo,
  resolveLifecycleMessageCardImageUrl,
} from './campaignDisplay';

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`  PASS: ${name}`);
    passed++;
  } catch (e) {
    console.error(`  FAIL: ${name}`);
    console.error(`    ${(e as Error).message}`);
    failed++;
  }
}

console.log('campaignDisplay hero image tests\n');

test('isLikelyLogo detects path segments', () => {
  assert.equal(isLikelyLogo('https://cdn.example.com/assets/wordmark-v2.png'), true);
  assert.equal(isLikelyLogo('https://cdn.example.com/hero/banner-main.jpg'), false);
  assert.equal(isLikelyLogo('https://cdn.example.com/icons/social.png'), true);
});

test('logo-only HTML returns null', () => {
  const html = `
    <table><tr><td>
      <img width="40" height="40" src="https://cdn.example.com/brand/logo.png" alt="logo" />
    </td></tr></table>`;
  assert.equal(extractHeroImageFromHtml(html), null);
});

test('hero+logo HTML picks large hero', () => {
  const html = `
    <div class="header"><img width="32" height="32" src="https://cdn.example.com/nav/icon.png" /></div>
    <div class="email-hero">
      <img width="600" height="400" src="https://cdn.example.com/campaign/hero-main.jpg" alt="feature" />
    </div>`;
  const u = extractHeroImageFromHtml(html);
  assert.equal(u, 'https://cdn.example.com/campaign/hero-main.jpg');
});

test('no-images HTML returns null', () => {
  assert.equal(extractHeroImageFromHtml('<p>Hello plain text</p>'), null);
  assert.equal(extractHeroImageFromHtml(''), null);
});

test('large-width-attr HTML wins over small asset', () => {
  const html = `
    <img src="https://cdn.example.com/small.png" width="24" height="24" />
    <div class="banner"><img src="https://cdn.example.com/big-promo.webp" width="640" height="360" /></div>`;
  const u = extractHeroImageFromHtml(html);
  assert.equal(u, 'https://cdn.example.com/big-promo.webp');
});

test('resolveLifecycleMessageCardImageUrl prefers HTML hero over logo image_url', () => {
  const html = `<div class="email-hero"><img width="500" height="300" src="https://cdn.example.com/promo.jpg" /></div>`;
  const u = resolveLifecycleMessageCardImageUrl({
    html_content: html,
    image_url: 'https://cdn.example.com/brand/wordmark.png',
  });
  assert.equal(u, 'https://cdn.example.com/promo.jpg');
});

test('resolveLifecycleMessageCardImageUrl skips logo image_url when no hero in HTML', () => {
  const u = resolveLifecycleMessageCardImageUrl({
    html_content: '<p>No images</p>',
    image_url: 'https://cdn.example.com/assets/logo-v2.png',
  });
  assert.equal(u, undefined);
});

console.log(`\nDone: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
