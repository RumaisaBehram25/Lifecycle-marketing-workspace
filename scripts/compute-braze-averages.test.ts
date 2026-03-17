import { strict as assert } from "node:assert";
import { readFileSync } from "fs";
import { resolve } from "path";
import {
  aggregateByCampaignVariation,
  computeRates,
  computeWeightedAverage,
  generateCSV,
  processDirectory,
} from "./compute-braze-averages.js";

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

console.log("Running compute-braze-averages tests...\n");

// --- Test: Aggregation ---

console.log("Aggregation:");

const inputDir = resolve(import.meta.dirname ?? ".", "..", "braze-examples");
const { campaigns, average, csv } = processDirectory(inputDir);

test("produces 4 campaign/variation rows", () => {
  assert.equal(campaigns.length, 4);
});

test("Spring Sale Launch Variant A - aggregated counts", () => {
  const varA = campaigns.find((c) =>
    c.campaign_name.includes("Variant A")
  )!;
  assert.ok(varA, "Variant A not found");
  assert.equal(varA.total_sent, 15234);
  assert.equal(varA.total_delivered, 14892);
  assert.equal(varA.total_opens, 6310);
  assert.equal(varA.unique_opens, 5256);
  assert.equal(varA.total_clicks, 1844);
  assert.equal(varA.unique_clicks, 1577);
  assert.equal(varA.bounces, 342);
  assert.equal(varA.unsubscribes, 59);
  assert.equal(varA.spam_reports, 11);
  assert.equal(varA.conversions, 435);
  assert.equal(varA.revenue, 6195.5);
});

test("Spring Sale Launch Variant B - aggregated counts", () => {
  const varB = campaigns.find((c) =>
    c.campaign_name.includes("Variant B")
  )!;
  assert.ok(varB, "Variant B not found");
  assert.equal(varB.total_sent, 15180);
  assert.equal(varB.total_delivered, 14901);
  assert.equal(varB.total_opens, 7502);
  assert.equal(varB.total_clicks, 2357);
});

test("Weekly Newsletter #12 - no variant suffix", () => {
  const nl = campaigns.find((c) => c.campaign_name === "Weekly Newsletter #12")!;
  assert.ok(nl, "Newsletter not found");
  assert.equal(nl.total_sent, 42300);
  assert.equal(nl.total_delivered, 41105);
});

test("Cart Abandonment Reminder - aggregated counts", () => {
  const cart = campaigns.find((c) =>
    c.campaign_name.includes("Cart Abandonment")
  )!;
  assert.ok(cart, "Cart Abandonment not found");
  assert.equal(cart.total_sent, 26805);
  assert.equal(cart.total_delivered, 26245);
  assert.equal(cart.total_opens, 9436);
  assert.equal(cart.total_clicks, 5658);
});

test("date ranges tracked correctly", () => {
  const varA = campaigns.find((c) =>
    c.campaign_name.includes("Variant A")
  )!;
  assert.equal(varA.date_range, "2025-03-01 to 2025-03-03");

  const cart = campaigns.find((c) =>
    c.campaign_name.includes("Cart Abandonment")
  )!;
  assert.equal(cart.date_range, "2025-03-05 to 2025-03-07");
});

// --- Test: Rate Computation ---

console.log("\nRate Computation:");

function assertRate(actual: string, expected: string, label: string) {
  const actualNum = parseFloat(actual);
  const expectedNum = parseFloat(expected);
  assert.ok(
    Math.abs(actualNum - expectedNum) < 0.02,
    `${label}: expected ${expected}, got ${actual}`
  );
}

test("Variant A rates", () => {
  const varA = campaigns.find((c) =>
    c.campaign_name.includes("Variant A")
  )!;
  assertRate(varA.delivery_rate, "97.76%", "delivery_rate");
  assertRate(varA.open_rate, "42.37%", "open_rate");
  assertRate(varA.unique_open_rate, "35.29%", "unique_open_rate");
  assertRate(varA.click_rate, "12.38%", "click_rate");
  assertRate(varA.unique_click_rate, "10.59%", "unique_click_rate");
  assertRate(varA.click_to_open_rate, "29.23%", "click_to_open_rate");
  assertRate(varA.bounce_rate, "2.25%", "bounce_rate");
  assertRate(varA.unsubscribe_rate, "0.40%", "unsubscribe_rate");
  assertRate(varA.spam_rate, "0.07%", "spam_rate");
  assertRate(varA.conversion_rate, "2.92%", "conversion_rate");
});

test("Variant B open_rate = 50.35%", () => {
  const varB = campaigns.find((c) =>
    c.campaign_name.includes("Variant B")
  )!;
  assertRate(varB.open_rate, "50.35%", "open_rate");
});

test("Cart Abandonment click_to_open_rate = 59.96% (5658/9436)", () => {
  const cart = campaigns.find((c) =>
    c.campaign_name.includes("Cart Abandonment")
  )!;
  // Note: the example file says 59.90% but 5658/9436 = 59.96%
  assertRate(cart.click_to_open_rate, "59.96%", "click_to_open_rate");
});

test("Newsletter conversion_rate = 0.00%", () => {
  const nl = campaigns.find((c) => c.campaign_name === "Weekly Newsletter #12")!;
  assert.equal(nl.conversion_rate, "0.00%");
});

// --- Test: Cross-Campaign Weighted Averages ---

console.log("\nCross-Campaign Weighted Averages:");

test("cross-campaign total counts", () => {
  assert.equal(average.total_sent, 99519);
  assert.equal(average.total_delivered, 97143);
  assert.equal(average.total_opens, 39323);
  assert.equal(average.unique_opens, 32834);
  assert.equal(average.total_clicks, 14271);
  assert.equal(average.unique_clicks, 12300);
});

test("weighted average rates (NOT naive averages)", () => {
  assertRate(average.delivery_rate, "97.61%", "delivery_rate");
  assertRate(average.open_rate, "40.48%", "open_rate");
  assertRate(average.unique_open_rate, "33.80%", "unique_open_rate");
  assertRate(average.click_rate, "14.69%", "click_rate");
  assertRate(average.unique_click_rate, "12.66%", "unique_click_rate");
  // Note: the example file says 36.39% but 14271/39323 = 36.29%
  assertRate(average.click_to_open_rate, "36.29%", "click_to_open_rate");
  assertRate(average.bounce_rate, "2.39%", "bounce_rate");
  assertRate(average.unsubscribe_rate, "0.43%", "unsubscribe_rate");
  assertRate(average.spam_rate, "0.07%", "spam_rate");
  assertRate(average.conversion_rate, "2.40%", "conversion_rate");
});

test("cross-campaign date range spans all campaigns", () => {
  assert.equal(average.date_range, "2025-03-01 to 2025-03-07");
});

test("cross-campaign revenue", () => {
  assert.equal(average.revenue, 41115.5);
});

// --- Test: Edge Case - Zero Delivered ---

console.log("\nEdge Cases:");

test("zero delivered produces 0.00% rates", () => {
  const zeroDelivered = computeRates({
    campaign_name: "Test",
    date_range: "2025-01-01 to 2025-01-01",
    channel: "email",
    total_sent: 100,
    total_delivered: 0,
    total_opens: 0,
    unique_opens: 0,
    total_clicks: 0,
    unique_clicks: 0,
    bounces: 100,
    unsubscribes: 0,
    spam_reports: 0,
    conversions: 0,
    revenue: 0,
  });
  assert.equal(zeroDelivered.open_rate, "0.00%");
  assert.equal(zeroDelivered.click_rate, "0.00%");
  assert.equal(zeroDelivered.conversion_rate, "0.00%");
  assert.equal(zeroDelivered.bounce_rate, "100.00%");
});

test("zero sent produces 0.00% delivery and bounce rates", () => {
  const zeroSent = computeRates({
    campaign_name: "Test",
    date_range: "2025-01-01 to 2025-01-01",
    channel: "email",
    total_sent: 0,
    total_delivered: 0,
    total_opens: 0,
    unique_opens: 0,
    total_clicks: 0,
    unique_clicks: 0,
    bounces: 0,
    unsubscribes: 0,
    spam_reports: 0,
    conversions: 0,
    revenue: 0,
  });
  assert.equal(zeroSent.delivery_rate, "0.00%");
  assert.equal(zeroSent.bounce_rate, "0.00%");
});

// --- Test: CSV Output Format ---

console.log("\nCSV Output:");

test("CSV contains header row", () => {
  const firstLine = csv.split("\n")[0];
  assert.ok(firstLine.startsWith("campaign_name,date_range,channel"));
});

test("CSV contains separator row", () => {
  assert.ok(csv.includes("--- CROSS-CAMPAIGN AVERAGES ---"));
});

test("CSV contains 4 campaign rows + header + separator + average = 7 lines", () => {
  const lines = csv.trim().split("\n");
  assert.equal(lines.length, 7);
});

test("CSV output matches expected file", () => {
  const expectedPath = resolve(inputDir, "braze_computed_rates_example.csv");
  const expected = readFileSync(expectedPath, "utf-8").trim();
  const actual = csv.trim();

  const expectedLines = expected.split("\n");
  const actualLines = actual.split("\n");

  assert.equal(actualLines.length, expectedLines.length, "Line count mismatch");

  for (let i = 0; i < expectedLines.length; i++) {
    const expCols = expectedLines[i].split(",");
    const actCols = actualLines[i].split(",");

    // Compare column by column with tolerance for numeric values
    for (let j = 0; j < Math.max(expCols.length, actCols.length); j++) {
      const exp = (expCols[j] ?? "").trim();
      const act = (actCols[j] ?? "").trim();

      // If both are percentage values, compare with tolerance
      // Note: the example file has small rounding errors in click_to_open_rate
      // and bounce_rate columns, so we use a wider tolerance
      if (exp.endsWith("%") && act.endsWith("%")) {
        const expNum = parseFloat(exp);
        const actNum = parseFloat(act);
        assert.ok(
          Math.abs(expNum - actNum) < 0.12,
          `Line ${i + 1}, col ${j + 1}: expected ${exp}, got ${act}`
        );
      } else {
        assert.equal(
          act,
          exp,
          `Line ${i + 1}, col ${j + 1}: expected "${exp}", got "${act}"`
        );
      }
    }
  }
});

// --- Summary ---

console.log(`\n${"=".repeat(40)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
console.log(`${"=".repeat(40)}`);

if (failed > 0) {
  process.exit(1);
}
