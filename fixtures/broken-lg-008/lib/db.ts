import { createClient } from '@supabase/supabase-js';

// A Supabase client reading its config from the environment. The DATABASE_URL
// mixing that LG-008 flags lives in the env files, not here.
export const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.SUPABASE_ANON_KEY as string,
);
