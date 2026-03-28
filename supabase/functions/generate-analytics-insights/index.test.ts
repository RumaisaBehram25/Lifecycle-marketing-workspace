import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";

Deno.test("insight card structure matches expected format", () => {
  const insight = {
    title: "Revenue Concentration Risk",
    body: "Welcome Series accounts for 52% of all flow revenue.",
    tag: "High Priority",
    tagColor: "bg-red-500/10 text-red-600",
  };

  assertEquals(typeof insight.title, "string");
  assertEquals(typeof insight.body, "string");
  assertEquals(typeof insight.tag, "string");
  assertEquals(typeof insight.tagColor, "string");

  const validTags = ["High Priority", "Strategy", "Growth", "Benchmark", "Warning", "Opportunity"];
  assertEquals(validTags.includes(insight.tag), true);
});

Deno.test("tagColor mapping is consistent", () => {
  const tagColorMap: Record<string, string> = {
    "High Priority": "bg-red-500/10 text-red-600",
    "Strategy": "bg-amber-500/10 text-amber-600",
    "Growth": "bg-green-500/10 text-green-600",
    "Benchmark": "bg-purple-500/10 text-purple-600",
    "Warning": "bg-orange-500/10 text-orange-600",
    "Opportunity": "bg-cyan-500/10 text-cyan-600",
  };

  for (const [tag, color] of Object.entries(tagColorMap)) {
    assertEquals(typeof tag, "string");
    assertEquals(color.includes("bg-"), true);
    assertEquals(color.includes("text-"), true);
  }
});

Deno.test("campaign summary transformation", () => {
  const rawCanvas = {
    name: "Welcome Series",
    sends_last_30d: 1200,
    entries_last_30d: 500,
    entries_last_60d: 900,
    tags: ["lifecycle", "welcome"],
    enabled: true,
    schedule_type: "triggered",
    conversion_events: [{ event_name: "purchase" }],
    archived: false,
  };

  const summary = {
    name: rawCanvas.name,
    sends_30d: rawCanvas.sends_last_30d || 0,
    entries_30d: rawCanvas.entries_last_30d || 0,
    entries_60d: rawCanvas.entries_last_60d || 0,
    tags: rawCanvas.tags || [],
    enabled: rawCanvas.enabled,
    schedule_type: rawCanvas.schedule_type,
    conversion_events: rawCanvas.conversion_events || [],
  };

  assertEquals(summary.name, "Welcome Series");
  assertEquals(summary.sends_30d, 1200);
  assertEquals(summary.entries_30d, 500);
  assertEquals(summary.tags.length, 2);
});
