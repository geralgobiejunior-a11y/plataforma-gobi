import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type Role = "owner" | "admin" | "operacoes" | "financeiro";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, sb-access-token, sb-refresh-token",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

function getEnv(name: string) {
  const v = Deno.env.get(name);
  return v && v.trim() ? v.trim() : null;
}

function getSupabaseEnv() {
  const url = getEnv("SUPABASE_URL");
  const anon = getEnv("SUPABASE_ANON_KEY");
  const service = getEnv("SUPABASE_SERVICE_ROLE_KEY");

  if (!url) throw new Error("Missing SUPABASE_URL secret");
  if (!anon) throw new Error("Missing SUPABASE_ANON_KEY secret");
  if (!service) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY secret");

  return { url, anon, service };
}

function assertRole(v: unknown): asserts v is Role {
  if (v !== "owner" && v !== "admin" && v !== "operacoes" && v !== "financeiro") {
    throw new Error("Invalid role");
  }
}

function extractJwt(authHeader: string) {
  return authHeader.replace(/^Bearer\s+/i, "").trim();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  try {
    const { url, anon, service } = getSupabaseEnv();

    const authHeader =
      req.headers.get("authorization") || req.headers.get("Authorization");

    const jwt = authHeader ? extractJwt(authHeader) : "";

    // LOGS (prova objetiva)
    console.log("[admin-users] HIT version=2026-01-19-04");
    console.log("[admin-users] host =", new URL(url).host);
    console.log("[admin-users] has_auth =", !!authHeader);
    console.log("[admin-users] auth_prefix =", (authHeader || "").slice(0, 20));
    console.log("[admin-users] jwt_len =", jwt.length);
    console.log("[admin-users] jwt_prefix =", jwt.slice(0, 10));
    console.log("[admin-users] anon_fp =", anon.slice(0, 8), anon.slice(-4));

    if (!authHeader) return json({ error: "Missing Authorization header" }, 401);
    if (!jwt) return json({ error: "Missing JWT" }, 401);

    const callerClient = createClient(url, anon, { auth: { persistSession: false } });
    const adminClient = createClient(url, service, { auth: { persistSession: false } });

    const { data: userData, error: userErr } = await callerClient.auth.getUser(jwt);
    if (userErr || !userData?.user) {
      console.log("[admin-users] getUser error =", userErr?.message);
      return json({ error: userErr?.message || "Invalid JWT" }, 401);
    }

    const caller = userData.user;

    const { data: roleRow, error: roleErr } = await adminClient
      .from("user_roles")
      .select("role")
      .eq("user_id", caller.id)
      .maybeSingle();

    if (roleErr) return json({ error: roleErr.message }, 500);

    const callerRole = (roleRow?.role ?? null) as Role | null;
    if (callerRole !== "owner" && callerRole !== "admin") {
      return json({ error: "Not allowed" }, 403);
    }

    const body = await req.json().catch(() => ({}));
    const action = String(body?.action || "").trim();

    // ---- ACTIONS (mínimo para o tab funcionar) ----

    if (action === "list") {
      const perPage = 200;
      let page = 1;
      const allUsers: any[] = [];

      while (true) {
        const { data, error } = await adminClient.auth.admin.listUsers({ page, perPage });
        if (error) return json({ error: error.message }, 500);

        const users = (data?.users || []) as any[];
        allUsers.push(...users);

        if (users.length < perPage) break;
        page += 1;
        if (page > 50) break;
      }

      const ids = allUsers.map((u) => u.id).filter(Boolean);

      const { data: roles, error: rolesErr } = await adminClient
        .from("user_roles")
        .select("user_id, role")
        .in("user_id", ids);

      if (rolesErr) return json({ error: rolesErr.message }, 500);

      const roleMap = new Map<string, Role>();
      for (const r of roles || []) {
        if (r?.user_id && r?.role) roleMap.set(String(r.user_id), r.role as Role);
      }

      const out = allUsers.map((u) => ({
        id: u.id,
        email: u.email ?? null,
        created_at: u.created_at ?? null,
        last_sign_in_at: u.last_sign_in_at ?? null,
        banned_until: u.banned_until ?? null,
        email_confirmed_at: u.email_confirmed_at ?? null,
        role: roleMap.get(u.id) ?? null,
      }));

      return json({ users: out }, 200);
    }

    if (action === "create") {
      const email = String(body?.email || "").trim().toLowerCase();
      const invite = !!body?.invite;
      const role = body?.role;

      if (!email || !email.includes("@")) return json({ error: "Invalid email" }, 400);
      assertRole(role);

      let userId: string | null = null;

      if (invite) {
        const { data, error } = await adminClient.auth.admin.inviteUserByEmail(email);
        if (error) return json({ error: error.message }, 500);
        userId = data?.user?.id ?? null;
      } else {
        const password = String(body?.password || "");
        if (!password || password.length < 8) {
          return json({ error: "Password must be at least 8 characters" }, 400);
        }
        const { data, error } = await adminClient.auth.admin.createUser({ email, password });
        if (error) return json({ error: error.message }, 500);
        userId = data?.user?.id ?? null;
      }

      if (!userId) return json({ error: "Failed to create user" }, 500);

      const { error: upErr } = await adminClient
        .from("user_roles")
        .upsert(
          { user_id: userId, role, is_active: true, updated_at: new Date().toISOString() },
          { onConflict: "user_id" }
        );

      if (upErr) return json({ error: upErr.message }, 500);

      return json({ ok: true, user_id: userId }, 200);
    }

    if (action === "set_role") {
      const userId = String(body?.user_id || "").trim();
      const role = body?.role;

      if (!userId) return json({ error: "Missing user_id" }, 400);

      if (role === null || role === "" || role === undefined) {
        const { error } = await adminClient.from("user_roles").delete().eq("user_id", userId);
        if (error) return json({ error: error.message }, 500);
        return json({ ok: true }, 200);
      }

      assertRole(role);

      const { error } = await adminClient
        .from("user_roles")
        .upsert(
          { user_id: userId, role, is_active: true, updated_at: new Date().toISOString() },
          { onConflict: "user_id" }
        );

      if (error) return json({ error: error.message }, 500);
      return json({ ok: true }, 200);
    }

    if (action === "reset_password") {
      const userId = String(body?.user_id || "").trim();
      if (!userId) return json({ error: "Missing user_id" }, 400);

      const { data, error } = await adminClient.auth.admin.getUserById(userId);
      if (error) return json({ error: error.message }, 500);

      const email = data?.user?.email ?? null;
      if (!email) return json({ error: "User has no email" }, 400);

      const { error: resetErr } = await adminClient.auth.resetPasswordForEmail(email);
      if (resetErr) return json({ error: resetErr.message }, 500);

      return json({ ok: true }, 200);
    }

    if (action === "set_active") {
      const userId = String(body?.user_id || "").trim();
      const active = !!body?.active;
      if (!userId) return json({ error: "Missing user_id" }, 400);

      const ban_duration = active ? "none" : "100y";
      const { error } = await adminClient.auth.admin.updateUserById(userId, { ban_duration });
      if (error) return json({ error: error.message }, 500);

      return json({ ok: true }, 200);
    }

    if (action === "delete") {
      const userId = String(body?.user_id || "").trim();
      if (!userId) return json({ error: "Missing user_id" }, 400);

      const { error } = await adminClient.auth.admin.deleteUser(userId);
      if (error) return json({ error: error.message }, 500);

      await adminClient.from("user_roles").delete().eq("user_id", userId);

      return json({ ok: true }, 200);
    }

    return json({ error: "Unknown action" }, 400);
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
