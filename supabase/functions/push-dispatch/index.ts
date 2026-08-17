import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.95.0";
import webpush from "npm:web-push@3.6.7";

const APP_ORIGIN = "https://fitnest.reflectace.workers.dev";
const JSON_HEADERS = { "Content-Type": "application/json", "Access-Control-Allow-Origin": APP_ORIGIN, "Access-Control-Allow-Headers": "authorization, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };

type Prefs = {
  training_enabled: boolean; training_time: string; training_weekdays: number[];
  weigh_enabled: boolean; weigh_time: string; weigh_weekdays: number[];
  water_enabled: boolean; water_time: string;
  steps_enabled: boolean; steps_time: string;
  evening_enabled: boolean; evening_time: string;
  quiet_start: string; quiet_end: string;
};

const defaults: Prefs = {
  training_enabled: true, training_time: "18:00", training_weekdays: [1,3,5],
  weigh_enabled: true, weigh_time: "08:00", weigh_weekdays: [1,5],
  water_enabled: true, water_time: "14:00",
  steps_enabled: true, steps_time: "19:30",
  evening_enabled: true, evening_time: "21:00",
  quiet_start: "22:00", quiet_end: "07:00"
};

function response(body: unknown, status = 200) { return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS }); }
function adminClient() {
  const secretMap = Deno.env.get("SUPABASE_SECRET_KEYS");
  const secret = secretMap ? JSON.parse(secretMap).default : Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!secret) throw new Error("Missing Supabase server key");
  return createClient(Deno.env.get("SUPABASE_URL")!, secret, { auth: { persistSession: false, autoRefreshToken: false } });
}
async function sha256(value: string) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes)).map(x => x.toString(16).padStart(2,"0")).join("");
}
function validUuid(v: unknown) { return typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v); }
function safeTime(v: unknown, fallback: string) { return typeof v === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(v) ? v : fallback; }
function safeDays(v: unknown, fallback: number[]) { const a = Array.isArray(v) ? [...new Set(v.map(Number).filter(n => n >= 1 && n <= 7))] : []; return a.length ? a : fallback; }
function cleanPrefs(raw: any = {}): Prefs {
  return {
    training_enabled: raw.training_enabled !== false, training_time: safeTime(raw.training_time, defaults.training_time), training_weekdays: safeDays(raw.training_weekdays, defaults.training_weekdays),
    weigh_enabled: raw.weigh_enabled !== false, weigh_time: safeTime(raw.weigh_time, defaults.weigh_time), weigh_weekdays: safeDays(raw.weigh_weekdays, defaults.weigh_weekdays),
    water_enabled: raw.water_enabled !== false, water_time: safeTime(raw.water_time, defaults.water_time),
    steps_enabled: raw.steps_enabled !== false, steps_time: safeTime(raw.steps_time, defaults.steps_time),
    evening_enabled: raw.evening_enabled !== false, evening_time: safeTime(raw.evening_time, defaults.evening_time),
    quiet_start: safeTime(raw.quiet_start, defaults.quiet_start), quiet_end: safeTime(raw.quiet_end, defaults.quiet_end)
  };
}
async function serverConfig(admin: any) {
  const { data, error } = await admin.rpc("fitnest_push_server_config");
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.vapid_public_key || !row?.vapid_private_key || !row?.scheduler_token) throw new Error("Push secrets not configured");
  return row;
}
async function optionalUser(admin: any, req: Request) {
  const auth = req.headers.get("Authorization");
  if (!auth?.startsWith("Bearer ")) return null;
  const { data } = await admin.auth.getUser(auth.slice(7));
  return data?.user || null;
}
async function verifyDevice(admin: any, deviceId: string, deviceSecret: string) {
  const { data } = await admin.from("push_devices").select("*").eq("device_id", deviceId).maybeSingle();
  if (!data || data.secret_hash !== await sha256(deviceSecret)) return null;
  return data;
}
function platform(req: Request) { const ua = req.headers.get("user-agent") || ""; if (/iphone|ipad|ipod/i.test(ua)) return "ios"; if (/android/i.test(ua)) return "android"; return "desktop"; }
function localParts(now: Date, tz: string) {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year:"numeric", month:"2-digit", day:"2-digit", weekday:"short", hour:"2-digit", minute:"2-digit", hourCycle:"h23" }).formatToParts(now);
    const get=(t:string)=>parts.find(p=>p.type===t)?.value||"";
    const wd:any={Mon:1,Tue:2,Wed:3,Thu:4,Fri:5,Sat:6,Sun:7};
    return { date:`${get("year")}-${get("month")}-${get("day")}`, weekday:wd[get("weekday")]||1, minutes:Number(get("hour"))*60+Number(get("minute")) };
  } catch { return localParts(now, "Europe/Berlin"); }
}
function toMinutes(t: string) { const [h,m]=String(t).slice(0,5).split(":").map(Number); return h*60+m; }
function due(nowMin: number, t: string) { const d=Math.abs(nowMin-toMinutes(t)); return Math.min(d,1440-d)<=5; }
function quiet(nowMin:number,start:string,end:string){const a=toMinutes(start),b=toMinutes(end);return a<=b?nowMin>=a&&nowMin<b:nowMin>=a||nowMin<b;}
function slotTime(t:string){return `${String(t).slice(0,5)}:00`;}

async function sendPush(device: any, cfg: any, payload: any) {
  try {
    const result = await webpush.sendNotification({ endpoint: device.endpoint, keys: { p256dh: device.p256dh, auth: device.auth_secret } }, JSON.stringify(payload), {
      vapidDetails: { subject: APP_ORIGIN, publicKey: cfg.vapid_public_key, privateKey: cfg.vapid_private_key }, TTL: 3600, urgency: "normal"
    });
    return { ok:true, code:result.statusCode || 201 };
  } catch (e:any) {
    return { ok:false, code:Number(e?.statusCode||500), message:String(e?.body||e?.message||"push failed").slice(0,300) };
  }
}

async function register(admin:any, req:Request, body:any) {
  const { deviceId, deviceSecret, subscription } = body;
  if (!validUuid(deviceId) || typeof deviceSecret !== "string" || deviceSecret.length < 32 || !subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) return response({ok:false,code:"invalid_registration"},400);
  const existing = await admin.from("push_devices").select("secret_hash").eq("device_id",deviceId).maybeSingle();
  const hash = await sha256(deviceSecret);
  if (existing.data && existing.data.secret_hash !== hash) return response({ok:false,code:"device_secret_mismatch"},403);
  const user = await optionalUser(admin,req);
  const timezone = typeof body.timezone === "string" ? body.timezone.slice(0,64) : "Europe/Berlin";
  const row = { user_id:user?.id||null, device_id:deviceId, secret_hash:hash, endpoint:String(subscription.endpoint), p256dh:String(subscription.keys.p256dh), auth_secret:String(subscription.keys.auth), timezone, platform:platform(req), enabled:true, last_seen_at:new Date().toISOString(), updated_at:new Date().toISOString() };
  const { error } = await admin.from("push_devices").upsert(row,{onConflict:"device_id"});
  if (error) throw error;
  const prefs=cleanPrefs(body.preferences);
  const p = await admin.from("reminder_preferences").upsert({device_id:deviceId,...prefs,updated_at:new Date().toISOString()},{onConflict:"device_id"});
  if (p.error) throw p.error;
  return response({ok:true,linkedToAccount:!!user});
}

async function updatePrefs(admin:any, body:any) {
  if (!validUuid(body.deviceId) || typeof body.deviceSecret !== "string") return response({ok:false},400);
  const device=await verifyDevice(admin,body.deviceId,body.deviceSecret); if(!device)return response({ok:false,code:"device_not_found"},403);
  const prefs=cleanPrefs(body.preferences); const {error}=await admin.from("reminder_preferences").upsert({device_id:body.deviceId,...prefs,updated_at:new Date().toISOString()},{onConflict:"device_id"}); if(error)throw error;
  await admin.from("push_devices").update({timezone:typeof body.timezone==="string"?body.timezone.slice(0,64):device.timezone,last_seen_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq("device_id",body.deviceId);
  return response({ok:true});
}

async function testPush(admin:any, body:any) {
  const device=await verifyDevice(admin,body.deviceId,body.deviceSecret); if(!device)return response({ok:false,code:"device_not_found"},403);
  const cfg=await serverConfig(admin); const sent=await sendPush(device,cfg,{title:"Fitnest",body:"Push funktioniert auch im Hintergrund.",tag:"fitnest-test",url:"./",badgeCount:1});
  if(!sent.ok&&(sent.code===404||sent.code===410))await admin.from("push_devices").update({enabled:false}).eq("device_id",device.device_id);
  return response(sent,sent.ok?200:502);
}

async function disable(admin:any, body:any) {
  const device=await verifyDevice(admin,body.deviceId,body.deviceSecret); if(!device)return response({ok:false},403);
  await admin.from("push_devices").update({enabled:false,updated_at:new Date().toISOString()}).eq("device_id",device.device_id); return response({ok:true});
}

async function userState(admin:any,userId:string,date:string){
  const [w,b,c,p,m]=await Promise.all([
    admin.from("workout_sessions").select("id").eq("user_id",userId).eq("planned_date",date).eq("completed",true).limit(1),
    admin.from("body_metrics").select("weight_kg").eq("user_id",userId).eq("measured_on",date).limit(1),
    admin.from("daily_checkins").select("steps,water_l").eq("user_id",userId).eq("checkin_date",date).maybeSingle(),
    admin.from("profiles").select("step_goal,water_goal_l").eq("user_id",userId).maybeSingle(),
    admin.from("meal_logs").select("id").eq("user_id",userId).eq("eaten_on",date)
  ]);
  return { workoutDone:!!w.data?.length, weightDone:!!b.data?.length, steps:Number(c.data?.steps||0), water:Number(c.data?.water_l||0), stepGoal:Number(p.data?.step_goal||8000), waterGoal:Number(p.data?.water_goal_l||2.5), meals:Number(m.data?.length||0) };
}

async function schedule(admin:any, req:Request) {
  const cfg=await serverConfig(admin); if(req.headers.get("x-fitnest-scheduler-token")!==cfg.scheduler_token)return response({ok:false,code:"scheduler_unauthorized"},401);
  const {data:devices,error}=await admin.from("push_devices").select("*").eq("enabled",true); if(error)throw error; if(!devices?.length)return response({ok:true,checked:0,sent:0});
  const ids=devices.map((d:any)=>d.device_id); const {data:prefsRows}=await admin.from("reminder_preferences").select("*").in("device_id",ids); const prefMap=new Map((prefsRows||[]).map((p:any)=>[p.device_id,p]));
  let sentCount=0,checked=0;
  for(const device of devices){
    const pref={...defaults,...(prefMap.get(device.device_id)||{})} as Prefs; const lp=localParts(new Date(),device.timezone||"Europe/Berlin"); if(quiet(lp.minutes,pref.quiet_start,pref.quiet_end))continue;
    const state=device.user_id?await userState(admin,device.user_id,lp.date):null;
    const candidates:any[]=[];
    if(pref.training_enabled&&pref.training_weekdays.includes(lp.weekday)&&due(lp.minutes,pref.training_time)&&!state?.workoutDone)candidates.push(["training",pref.training_time,"Training wartet",state?"Dein Training für heute ist noch offen.":"Dein geplantes Training wartet."]);
    if(pref.weigh_enabled&&pref.weigh_weekdays.includes(lp.weekday)&&due(lp.minutes,pref.weigh_time)&&!state?.weightDone)candidates.push(["weigh",pref.weigh_time,"Kurzer Check-in","Gewicht eintragen und den Trend aktuell halten."]);
    if(pref.water_enabled&&due(lp.minutes,pref.water_time)&&(!state||state.water<state.waterGoal))candidates.push(["water",pref.water_time,"Wasser-Check",state?`${state.water.toFixed(1)} von ${state.waterGoal.toFixed(1)} l erfasst.`:"Kurzer Wasser-Check für heute."]);
    if(pref.steps_enabled&&due(lp.minutes,pref.steps_time)&&(!state||state.steps<state.stepGoal))candidates.push(["steps",pref.steps_time,"Schrittziel",state?`${state.steps.toLocaleString("de-DE")} von ${state.stepGoal.toLocaleString("de-DE")} Schritten.`:"Schrittziel für heute kurz prüfen."]);
    if(pref.evening_enabled&&due(lp.minutes,pref.evening_time))candidates.push(["evening",pref.evening_time,"Tagescheck",state?`Training ${state.workoutDone?"✓":"offen"} · ${state.meals} Mahlzeiten geloggt.`:"Schritte, Wasser und Essen kurz abschließen."]);
    for(const [type,time,title,body] of candidates){checked++; const scheduled=slotTime(time); const {data:existing}=await admin.from("push_delivery_log").select("status").eq("device_id",device.device_id).eq("reminder_type",type).eq("local_date",lp.date).eq("scheduled_time",scheduled).maybeSingle(); if(existing?.status==="sent")continue;
      await admin.from("push_delivery_log").upsert({device_id:device.device_id,reminder_type:type,local_date:lp.date,scheduled_time:scheduled,status:"pending",updated_at:new Date().toISOString()},{onConflict:"device_id,reminder_type,local_date,scheduled_time"});
      const result=await sendPush(device,cfg,{title,body,tag:`fitnest-${type}`,url:"./",badgeCount:1});
      const status=result.ok?"sent":((result.code===404||result.code===410)?"expired":"failed");
      await admin.from("push_delivery_log").update({status,response_code:result.code,detail:result.ok?{}:{message:result.message},updated_at:new Date().toISOString()}).eq("device_id",device.device_id).eq("reminder_type",type).eq("local_date",lp.date).eq("scheduled_time",scheduled);
      if(result.ok)sentCount++; if(status==="expired")await admin.from("push_devices").update({enabled:false,updated_at:new Date().toISOString()}).eq("device_id",device.device_id);
    }
  }
  return response({ok:true,devices:devices.length,checked,sent:sentCount});
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: JSON_HEADERS });
  if (req.method !== "POST") return response({ok:false,code:"method_not_allowed"},405);
  try {
    const admin=adminClient(); const body=await req.json().catch(()=>({}));
    if(body.mode==="public-key"){const cfg=await serverConfig(admin);return response({ok:true,publicKey:cfg.vapid_public_key});}
    if(body.mode==="register")return await register(admin,req,body);
    if(body.mode==="preferences")return await updatePrefs(admin,body);
    if(body.mode==="test")return await testPush(admin,body);
    if(body.mode==="disable")return await disable(admin,body);
    if(body.mode==="schedule")return await schedule(admin,req);
    return response({ok:false,code:"unknown_mode"},400);
  } catch (e:any) {
    console.error("push-dispatch",e); return response({ok:false,code:"push_error",message:String(e?.message||e)},500);
  }
});
