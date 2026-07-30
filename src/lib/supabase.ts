/**
 * src/lib/supabase.ts
 *
 * Typed Supabase client singleton.
 * Import this wherever you need to call Supabase (auth, database, etc.).
 *
 * Keys are read from Vite env vars — both must be set in .env:
 *   VITE_SUPABASE_URL=https://xxx.supabase.co
 *   VITE_SUPABASE_ANON_KEY=eyJ...
 *
 * The anon key is safe to expose to the browser — it grants only the
 * permissions defined by your Supabase RLS policies.
 */

import { createClient } from "@supabase/supabase-js";

const supabaseUrl  = import.meta.env.VITE_SUPABASE_URL  as string;
const supabaseKey  = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!supabaseUrl || !supabaseKey) {
  throw new Error(
    "[supabase] Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in .env. " +
    "Check your .env file and restart the dev server.",
  );
}

export const supabase = createClient(supabaseUrl, supabaseKey);
