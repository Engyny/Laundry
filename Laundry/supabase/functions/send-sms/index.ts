// Supabase Edge Function: send-sms
// Dispatches real SMS via Android SMSGate (Cloud Mode: https://api.sms-gate.app/3rdparty/v1/message)
// Includes strict PH phone validation, 2-minute cooldown per number, and status logging.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SMSGATE_API_URL = Deno.env.get("SMSGATE_API_URL") || "https://api.sms-gate.app/3rdparty/v1/message";
const ALLOWED_AUTO_STATUSES = new Set(["reserved", "ready"]);
const COOLDOWN_MS = 2 * 60 * 1000; // 2 minutes

/**
 * Validates and normalizes Philippine mobile numbers to +639XXXXXXXXX.
 * Accepts 09XXXXXXXXX, 9XXXXXXXXX, 639XXXXXXXXX, +639XXXXXXXXX (with spaces/dashes).
 */
function normalizePhPhone(raw: string): string | null {
  const cleaned = String(raw || "").replace(/[\s\-().]/g, "");
  if (/^09\d{9}$/.test(cleaned)) {
    return "+63" + cleaned.slice(1);
  }
  if (/^9\d{9}$/.test(cleaned)) {
    return "+63" + cleaned;
  }
  if (/^\+?639\d{9}$/.test(cleaned)) {
    return cleaned.startsWith("+") ? cleaned : "+" + cleaned;
  }
  return null;
}

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ ok: false, error: "Method not allowed" }, 405);
  }

  try {
    const payload = await req.json();
    const {
      notificationId,
      orderId = "",
      customerPhone = "",
      customerName = "Customer",
      status = "reserved",
      message = "",
      isResend = false,
    } = payload || {};

    if (!message || !String(message).trim()) {
      return jsonResponse({ ok: false, smsStatus: "failed", error: "Empty SMS message" }, 400);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const supabase = (supabaseUrl && serviceRoleKey)
      ? createClient(supabaseUrl, serviceRoleKey)
      : null;

    const updateNotifLog = async (fields: Record<string, unknown>) => {
      if (!supabase || !notificationId) return;
      await supabase
        .from("laundry_notifications")
        .upsert({
          id: notificationId,
          order_id: orderId,
          customer_phone: customerPhone,
          customer_name: customerName,
          status,
          message,
          type: "sms",
          ...fields,
        });
    };

    // 1. Key-milestone gate (unless staff manually clicked Resend)
    if (!isResend && !ALLOWED_AUTO_STATUSES.has(status)) {
      await updateNotifLog({ sms_status: "local", sms_error: null });
      return jsonResponse({
        ok: true,
        smsStatus: "local",
        info: `Status '${status}' is logged in-app only (no SMS sent).`,
      });
    }

    // 2. Strict PH phone validation
    const normalizedPhone = normalizePhPhone(customerPhone);
    if (!normalizedPhone) {
      const errMsg = "Invalid PH mobile number (expected 09XXXXXXXXX or +639XXXXXXXXX).";
      await updateNotifLog({ sms_status: "failed", sms_error: errMsg });
      return jsonResponse({ ok: false, smsStatus: "failed", error: errMsg }, 400);
    }

    // 3. 2-minute cooldown per phone number (bypassed on manual Resend)
    if (!isResend && supabase) {
      const cutoffIso = new Date(Date.now() - COOLDOWN_MS).toISOString();
      const { data: recent } = await supabase
        .from("laundry_notifications")
        .select("id, sent_at")
        .eq("sms_status", "sent")
        .in("customer_phone", [customerPhone, normalizedPhone])
        .gte("sent_at", cutoffIso)
        .limit(1);

      if (recent && recent.length > 0) {
        const errMsg = "Cooldown active: SMS already sent to this number within the last 2 minutes.";
        await updateNotifLog({ sms_status: "skipped", sms_error: errMsg });
        return jsonResponse({ ok: false, smsStatus: "skipped", error: errMsg }, 429);
      }
    }

    // 4. Verify SMSGate credentials
    const smsUser = Deno.env.get("SMSGATE_USERNAME") || "";
    const smsPass = Deno.env.get("SMSGATE_PASSWORD") || "";
    if (!smsUser || !smsPass) {
      const errMsg = "SMSGATE_USERNAME / SMSGATE_PASSWORD not configured in Supabase Secrets.";
      await updateNotifLog({ sms_status: "failed", sms_error: errMsg });
      return jsonResponse({ ok: false, smsStatus: "failed", error: errMsg }, 500);
    }

    // 5. Call Android SMSGate Cloud API with 10s timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    try {
      const authHeader = "Basic " + btoa(`${smsUser}:${smsPass}`);
      const smsRes = await fetch(SMSGATE_API_URL, {
        method: "POST",
        headers: {
          "Authorization": authHeader,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          textMessage: { text: String(message).trim() },
          phoneNumbers: [normalizedPhone],
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      const rawText = await smsRes.text();
      let smsJson: Record<string, unknown> = {};
      try { smsJson = JSON.parse(rawText); } catch { /* plain text response */ }

      if (!smsRes.ok) {
        const errMsg = `SMSGate HTTP ${smsRes.status}: ${smsJson.message || rawText || "Gateway error"}`;
        await updateNotifLog({ sms_status: "failed", sms_error: errMsg });
        return jsonResponse({ ok: false, smsStatus: "failed", error: errMsg }, 502);
      }

      const providerId = String(smsJson.id || "");
      const sentAt = new Date().toISOString();
      await updateNotifLog({
        sms_status: "sent",
        sms_error: null,
        provider_message_id: providerId || null,
        sent_at: sentAt,
      });

      return jsonResponse({
        ok: true,
        smsStatus: "sent",
        phone: normalizedPhone,
        providerMessageId: providerId,
        sentAt,
      });
    } catch (fetchErr) {
      clearTimeout(timeoutId);
      const errMsg = fetchErr instanceof Error && fetchErr.name === "AbortError"
        ? "Shop Android phone timed out (check Wi-Fi / SMSGate app)."
        : `Gateway unreachable: ${fetchErr instanceof Error ? fetchErr.message : String(fetchErr)}`;
      await updateNotifLog({ sms_status: "failed", sms_error: errMsg });
      return jsonResponse({ ok: false, smsStatus: "failed", error: errMsg }, 504);
    }
  } catch (err) {
    return jsonResponse({
      ok: false,
      smsStatus: "failed",
      error: err instanceof Error ? err.message : "Unexpected error",
    }, 500);
  }
});

