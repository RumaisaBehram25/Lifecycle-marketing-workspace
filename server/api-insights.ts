import type { Plugin } from 'vite';
import { loadEnv } from 'vite';
import { resolve } from 'path';

export function insightsApi(): Plugin {
  return {
    name: 'insights-api',
    configureServer(server) {
      const env = loadEnv('', resolve(__dirname, '..'), '');

      server.middlewares.use('/api/generate-insights', async (req, res) => {
        if (req.method === 'OPTIONS') {
          res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'content-type' });
          res.end();
          return;
        }

        if (req.method !== 'POST') {
          res.writeHead(405, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Method not allowed' }));
          return;
        }

        try {
          const body = await new Promise<string>((resolve) => {
            let data = '';
            req.on('data', (chunk: Buffer) => { data += chunk; });
            req.on('end', () => resolve(data));
          });

          const { campaigns } = JSON.parse(body);

          if (!campaigns || !Array.isArray(campaigns)) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'campaigns array is required' }));
            return;
          }

          const apiKey = env.ANTHROPIC_API_KEY;
          if (!apiKey) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'ANTHROPIC_API_KEY not set in .env' }));
            return;
          }

          const response = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
              'x-api-key': apiKey,
              'anthropic-version': '2023-06-01',
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              model: 'claude-haiku-4-5-20251001',
              max_tokens: 1024,
              system: `You are a lifecycle marketing analytics expert. Analyze the specific campaign data provided and return exactly 3-4 actionable insights.

CRITICAL RULES:
- Every insight MUST reference specific campaigns or flows BY NAME from the data.
- Use actual numbers from the data (sends, entries, conversion events) to support each insight.
- Do NOT give generic marketing advice. If you cannot tie an insight to a specific campaign in the data, do not include it.
- Compare campaigns against each other — highlight outliers (best and worst performers).
- Bad example: "Campaigns targeting reactivation are failing to reach users effectively." (too generic, no campaign names)
- Good example: "Welcome Series has 342 entries in 30d but Cart Abandon only has 12 — consider reviewing Cart Abandon trigger conditions or audience filters."

Return ONLY valid JSON — an array of objects with these fields:
- "title": short insight heading that names the specific campaign/flow (5-10 words)
- "body": 1-2 sentences with specific campaign names and numbers from the data. Compare against other campaigns when relevant.
- "tag": one of "High Priority", "Strategy", "Growth", "Benchmark", "Warning", "Opportunity"
- "tagColor": matching Tailwind classes:
  - "High Priority" -> "bg-red-500/10 text-red-600"
  - "Strategy" -> "bg-amber-500/10 text-amber-600"
  - "Growth" -> "bg-green-500/10 text-green-600"
  - "Benchmark" -> "bg-purple-500/10 text-purple-600"
  - "Warning" -> "bg-orange-500/10 text-orange-600"
  - "Opportunity" -> "bg-cyan-500/10 text-cyan-600"`,
              messages: [
                {
                  role: 'user',
                  content: `Analyze these ${campaigns.length} campaigns/flows:\n${JSON.stringify(campaigns, null, 2)}`,
                },
              ],
            }),
          });

          if (!response.ok) {
            const errorText = await response.text();
            console.error('Anthropic error:', errorText);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'AI generation failed' }));
            return;
          }

          const data = await response.json();
          const content = data.content[0].text;
          const jsonMatch = content.match(/\[[\s\S]*\]/);

          if (!jsonMatch) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Failed to parse AI response' }));
            return;
          }

          const insights = JSON.parse(jsonMatch[0]);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ insights }));
        } catch (err) {
          console.error('Insights API error:', err);
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: err instanceof Error ? err.message : 'Unknown error' }));
        }
      });
    },
  };
}
