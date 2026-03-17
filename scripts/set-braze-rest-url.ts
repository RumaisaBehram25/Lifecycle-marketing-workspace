import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in environment");
  process.exit(1);
}

const restUrl = process.argv[2] || "https://rest.iad-06.braze.com";

const supabase = createClient(supabaseUrl, supabaseKey);

const { data, error } = await supabase
  .from("client_platforms")
  .update({
    additional_config: { rest_endpoint: restUrl },
  })
  .eq("platform", "braze")
  .select("id, platform, additional_config");

if (error) {
  console.error("Error:", error.message);
  process.exit(1);
}

if (!data?.length) {
  console.log("No Braze platform row found. Connect Braze on the Platforms page first, then re-run this.");
} else {
  console.log(`Set rest_endpoint to ${restUrl} for ${data.length} row(s)`);
  console.log(data);
}
