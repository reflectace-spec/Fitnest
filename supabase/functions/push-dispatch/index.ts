import "jsr:@supabase/functions-js/edge-runtime.d.ts";

// Build 1 scaffold. Production dispatch will be wired after the dedicated
// Supabase project and VAPID secrets exist. Keep verify_jwt enabled when deployed.
Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });
  return new Response(JSON.stringify({
    ok: false,
    code: "push_not_configured",
    message: "VAPID and scheduled delivery are not configured yet."
  }), { status: 501, headers: { "Content-Type": "application/json" } });
});
