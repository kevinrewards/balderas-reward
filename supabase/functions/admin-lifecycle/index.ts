import { createClient } from "npm:@supabase/supabase-js@2";
import { handleLifecycle } from "./handler.mjs";

const url = Deno.env.get("SUPABASE_URL")!;
const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const options = { auth: { persistSession: false, autoRefreshToken: false } };
Deno.serve((request: Request) => handleLifecycle(request, {
  userClient: (authorization: string) => createClient(url, anonKey, {
    ...options, global: { headers: { Authorization: authorization } },
  }),
  serviceClient: () => createClient(url, serviceKey, options),
}));
