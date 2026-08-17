import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const headers = { "Content-Type": "application/json" };

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "method_not_allowed" }), { status: 405, headers });
  const body = await req.json().catch(() => ({}));
  const current = Number(body.currentWeight);
  const target = Number(body.targetWeight);
  const targetDate = new Date(body.targetDate);
  const now = new Date();
  const weeks = Math.max(1, Math.ceil((targetDate.getTime() - now.getTime()) / (7 * 86400000)));
  const rate = (current - target) / weeks;

  if (!Number.isFinite(current) || !Number.isFinite(target) || !Number.isFinite(targetDate.getTime())) {
    return new Response(JSON.stringify({ error: "invalid_goal" }), { status: 400, headers });
  }

  if (rate > 1) {
    return new Response(JSON.stringify({
      ok: false,
      code: "goal_too_aggressive",
      requestedKgPerWeek: Number(rate.toFixed(2)),
      message: "Für dieses Ziel wird kein aggressiver Crash-Plan erzeugt. Bitte Zeitraum verlängern oder Ziel anpassen."
    }), { status: 422, headers });
  }

  const days = Math.min(5, Math.max(2, Number(body.trainingDays || 3)));
  const templates = [
    { title: "Ganzkörper A", minutes: 28, exercises: ["squat", "pushup", "reverse-lunge", "plank"] },
    { title: "Core & Haltung", minutes: 24, exercises: ["bird-dog", "glute-bridge", "plank"] },
    { title: "Ganzkörper B", minutes: 30, exercises: ["squat", "pushup", "glute-bridge"] }
  ];

  return new Response(JSON.stringify({ ok: true, weeks, rate: Number(rate.toFixed(2)), trainingDays: days, templates }), { headers });
});
