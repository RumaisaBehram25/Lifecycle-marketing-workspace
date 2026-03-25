import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

if (import.meta.env.DEV) {
  const url = import.meta.env.VITE_SUPABASE_URL;
  const key =
    import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY;
  if (!url?.trim() || !key?.trim()) {
    console.warn(
      "[Supabase] Set VITE_SUPABASE_PUBLISHABLE_KEY (or VITE_SUPABASE_ANON_KEY) to the anon JWT from Dashboard → Settings → API — Edge Functions will fail until this is set."
    );
  } else if (key.trim().startsWith("sb_publishable_")) {
    console.warn(
      "[Supabase] Replace the publishable key with the Supabase anon JWT (starts with eyJ). sb_publishable_… breaks functions.invoke."
    );
  }
}

createRoot(document.getElementById("root")!).render(<App />);
