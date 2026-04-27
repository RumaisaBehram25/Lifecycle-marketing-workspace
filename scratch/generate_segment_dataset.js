
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://bdavazygbtoosegncfgi.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

function getSegmentCategory(name) {
  if (!name) return 'UNCATEGORIZED';
  const match = name.match(/\[(.*?)\]/);
  if (match && match[1]) {
    return match[1].trim().toUpperCase();
  }
  const n = name.toUpperCase();
  if (n.includes('SOCO')) return 'SOCO';
  if (n.includes('TEST')) return 'TEST';
  if (n.includes('VERTICAL')) return 'VERTICALS';
  if (n.includes('MARKETING')) return 'MARKETING';
  if (n.includes('AUDIENCE')) return 'AUDIENCE';
  if (n.includes('VALIDITY')) return 'VALIDATION';
  if (n.includes('NEW')) return 'NEW_USER_WARMUP';
  if (n.includes('ACCOUNT TIER')) return 'ACCOUNT_TIER';
  return 'UNCATEGORIZED';
}

function getSegmentSubcategory(name) {
  if (!name) return 'General';
  const n = name.toUpperCase();
  if (n.includes('WAVE')) return 'Wave';
  if (n.includes('DAY')) return 'Day';
  if (n.includes('USERS')) return 'Users';
  if (n.includes('AUDIENCE')) return 'Audience';
  if (n.includes('BATCH')) return 'Batch';
  return 'General';
}

async function run() {
  const { data, error } = await supabase
    .from('braze_segments_sync')
    .select('name');

  if (error) {
    console.error(error);
    return;
  }

  const names = [...new Set(data.map(r => String(r.name || '').trim()).filter(Boolean))];
  
  const dataset = names.map(name => ({
    segment_name: name,
    category: getSegmentCategory(name),
    subcategory: getSegmentSubcategory(name)
  }));

  console.log(JSON.stringify(dataset, null, 2));
}

run();
