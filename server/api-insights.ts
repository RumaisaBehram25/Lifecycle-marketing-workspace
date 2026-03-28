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

          const apiKey = env.OPENAI_API_KEY;
          if (!apiKey) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'OPENAI_API_KEY not set in .env' }));
            return;
          }

          const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              model: 'gpt-4o-mini',
              messages: [
                {
                  role: 'system',
                  content: `You are a lifecycle marketing analytics expert. Analyze campaign data and return exactly 3-4 actionable insights.

Return ONLY valid JSON — an array of objects with these fields:
- "title": short insight heading (5-10 words)
- "body": 1-2 sentence explanation with specific numbers from the data
- "tag": one of "High Priority", "Strategy", "Growth", "Benchmark", "Warning", "Opportunity"
- "tagColor": matching Tailwind classes:
  - "High Priority" -> "bg-red-500/10 text-red-600"
  - "Strategy" -> "bg-amber-500/10 text-amber-600"
  - "Growth" -> "bg-green-500/10 text-green-600"
  - "Benchmark" -> "bg-purple-500/10 text-purple-600"
  - "Warning" -> "bg-orange-500/10 text-orange-600"
  - "Opportunity" -> "bg-cyan-500/10 text-cyan-600"

Focus on: performance patterns, underperforming flows, engagement gaps, and growth opportunities.`,
                },
                {
                  role: 'user',
                  content: `Analyze these ${campaigns.length} campaigns/flows:\n${JSON.stringify(campaigns, null, 2)}`,
                },
              ],
              temperature: 0.7,
            }),
          });

          if (!response.ok) {
            const errorText = await response.text();
            console.error('OpenAI error:', errorText);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'AI generation failed' }));
            return;
          }

          const data = await response.json();
          const content = data.choices[0].message.content;
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
