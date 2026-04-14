/**
 * Run: `npx tsx src/lib/campaignDisplay.heroImage.test.ts`
 */
import { strict as assert } from 'node:assert';
import {
  extractHeroImageFromHtml,
  extractStripocdnImgSrcFromHtml,
  isLikelyLogo,
  resolveCampaignCardThumbnailUrl,
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

test('resolveCampaignCardThumbnailUrl reads channels.email.image_url', () => {
  const u = resolveCampaignCardThumbnailUrl({
    rawDetails: {
      channels: {
        email: {
          image_url: 'https://cdn.example.com/campaign/hero-from-channel.jpg',
        },
      },
    },
  });
  assert.equal(u, 'https://cdn.example.com/campaign/hero-from-channel.jpg');
});

test('resolveCampaignCardThumbnailUrl reads creatives[0].url', () => {
  const u = resolveCampaignCardThumbnailUrl({
    rawDetails: {
      creatives: [{ url: 'https://cdn.example.com/creative-asset.png' }],
    },
  });
  assert.equal(u, 'https://cdn.example.com/creative-asset.png');
});

test('Stripo CDN hero <img> src extracted from HTML (regex path)', () => {
  const html = `<table><tr><td><img src="https://uijpgh.stripocdn.email/content/guids/xxx/images/hero.png" width="600" height="400" /></td></tr></table>`;
  assert.equal(
    extractHeroImageFromHtml(html),
    'https://uijpgh.stripocdn.email/content/guids/xxx/images/hero.png',
  );
});

test('resolveCampaignCardThumbnailUrl prefers brcg-campaigns-assets column over HTML hero', () => {
  const html = `<img width="600" height="400" src="https://stripo.example/other.jpg" />`;
  const u = resolveCampaignCardThumbnailUrl({
    imageUrlColumn:
      'https://x.supabase.co/storage/v1/object/public/brcg-campaigns-assets/foo/bar.png',
    rawDetails: { email_html_preview: html },
  });
  assert.equal(u, 'https://x.supabase.co/storage/v1/object/public/brcg-campaigns-assets/foo/bar.png');
});

test('resolveCampaignCardThumbnailUrl prefers image_url column over Stripo in email_html_preview', () => {
  const html = `<img width="600" height="400" src="https://uijpgh.stripocdn.email/content/guids/xxx/images/hero.png" />`;
  const u = resolveCampaignCardThumbnailUrl({
    imageUrlColumn: 'https://braze-old-cdn.com/some-preview.jpg',
    rawDetails: { email_html_preview: html },
  });
  assert.equal(u, 'https://braze-old-cdn.com/some-preview.jpg');
});

test('extractStripocdnImgSrcFromHtml matches src with stripocdn', () => {
  const html = `<img src="https://uijpgh.stripocdn.email/content/guids/x/images/01_hero_desktop.png" />`;
  assert.equal(
    extractStripocdnImgSrcFromHtml(html),
    'https://uijpgh.stripocdn.email/content/guids/x/images/01_hero_desktop.png',
  );
});

test('resolveCampaignCardThumbnailUrl uses Stripo regex on email_html_preview when image_url empty', () => {
  const html = `<img src="https://uijpgh.stripocdn.email/content/guids/x/images/01_hero_desktop.png" />`;
  const u = resolveCampaignCardThumbnailUrl({
    imageUrlColumn: null,
    rawDetails: { email_html_preview: html },
  });
  assert.equal(u, 'https://uijpgh.stripocdn.email/content/guids/x/images/01_hero_desktop.png');
});

test('resolveCampaignCardThumbnailUrl uses Stripo regex on messages.*.body when earlier steps empty', () => {
  const body = `<img src="https://uijpgh.stripocdn.email/content/guids/x/images/01_hero_mobile_1.png" />`;
  const u = resolveCampaignCardThumbnailUrl({
    imageUrlColumn: null,
    rawDetails: { messages: { m1: { body } } },
  });
  assert.equal(u, 'https://uijpgh.stripocdn.email/content/guids/x/images/01_hero_mobile_1.png');
});

console.log(`\nDone: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
