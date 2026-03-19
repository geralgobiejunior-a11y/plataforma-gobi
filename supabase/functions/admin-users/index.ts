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

async function resolveCallerRole(adminClient: any, callerId: string): Promise<Role | null> {
  const { data: roleRow, error: roleErr } = await adminClient
    .from("user_roles")
    .select("role")
    .eq("user_id", callerId)
    .maybeSingle();

  if (roleErr) {
    console.error("[admin-users] user_roles lookup error =", roleErr);
    throw new Error(roleErr.message);
  }

  const roleFromUserRoles = (roleRow?.role ?? null) as Role | null;
  if (roleFromUserRoles) return roleFromUserRoles;

  const { data: profileRow, error: profileErr } = await adminClient
    .from("user_profiles")
    .select("role")
    .eq("user_id", callerId)
    .maybeSingle();

  if (profileErr) {
    console.error("[admin-users] user_profiles lookup error =", profileErr);
    throw new Error(profileErr.message);
  }

  return (profileRow?.role ?? null) as Role | null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  try {
    const { url, anon, service } = getSupabaseEnv();

    console.log("[admin-users] method =", req.method);
    console.log("[admin-users] url =", req.url);

    const authHeader =
      req.headers.get("authorization") || req.headers.get("Authorization");

    console.log("[admin-users] authHeader exists =", !!authHeader);
    console.log(
      "[admin-users] authHeader preview =",
      authHeader ? authHeader.slice(0, 60) : null
    );

    if (!authHeader) {
      return json({ error: "Missing Authorization header" }, 401);
    }

    const jwt = extractJwt(authHeader);

    console.log("[admin-users] jwt exists =", !!jwt);
    console.log("[admin-users] jwt length =", jwt ? jwt.length : 0);
    console.log(
      "[admin-users] jwt preview =",
      jwt ? `${jwt.slice(0, 30)}...` : null
    );

    if (!jwt) {
      return json({ error: "Missing JWT" }, 401);
    }

    const callerClient = createClient(url, anon, {
      auth: { persistSession: false },
    });

    const adminClient = createClient(url, service, {
      auth: { persistSession: false },
    });

    const { data: userData, error: userErr } = await callerClient.auth.getUser(jwt);

    console.log("[admin-users] getUser user id =", userData?.user?.id ?? null);
    console.log("[admin-users] getUser email =", userData?.user?.email ?? null);
    console.log("[admin-users] getUser error =", userErr ?? null);

    if (userErr || !userData?.user) {
      console.error("[admin-users] getUser error =", userErr);
      return json({ error: userErr?.message || "Invalid JWT" }, 401);
    }

    const caller = userData.user;
    const callerRole = await resolveCallerRole(adminClient, caller.id);

    console.log("[admin-users] caller.id =", caller.id);
    console.log("[admin-users] caller.email =", caller.email ?? null);
    console.log("[admin-users] callerRole =", callerRole);

    if (callerRole !== "owner" && callerRole !== "admin") {
      return json({ error: "Not allowed" }, 403);
    }

    const body = await req.json().catch(() => ({}));
    const action = String(body?.action || "").trim();

    console.log("[admin-users] action =", action);
    console.log("[admin-users] body =", body);

    if (action === "list") {
      const perPage = 200;
      let page = 1;
      const allUsers: any[] = [];

      while (true) {
        const { data, error } = await adminClient.auth.admin.listUsers({ page, perPage });
        if (error) {
          console.error("[admin-users] listUsers error =", error);
          return json({ error: error.message }, 500);
        }

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

      if (rolesErr) {
        console.error("[admin-users] roles lookup error =", rolesErr);
        return json({ error: rolesErr.message }, 500);
      }

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

      return json({ ok: true, users: out }, 200);
    }

    if (action === "create") {
      const email = String(body?.email || "").trim().toLowerCase();
      const invite = !!body?.invite;
      const role = body?.role;

      if (!email || !email.includes("@")) {
        return json({ error: "Invalid email" }, 400);
      }

      assertRole(role);

      let userId: string | null = null;

      if (invite) {
        const { data, error } = await adminClient.auth.admin.inviteUserByEmail(email);
        if (error) {
          console.error("[admin-users] inviteUserByEmail error =", error);
          return json({ error: error.message }, 500);
        }
        userId = data?.user?.id ?? null;
      } else {
        const password = String(body?.password || "");
        if (!password || password.length < 8) {
          return json({ error: "Password must be at least 8 characters" }, 400);
        }

        const { data, error } = await adminClient.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
        });

        if (error) {
          console.error("[admin-users] createUser error =", error);
          return json({ error: error.message }, 500);
        }

        userId = data?.user?.id ?? null;
      }

      if (!userId) {
        return json({ error: "Failed to create user" }, 500);
      }

      const { error: upErr } = await adminClient
        .from("user_roles")
        .upsert(
          {
            user_id: userId,
            role,
            is_active: true,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "user_id" }
        );

      if (upErr) {
        console.error("[admin-users] user_roles upsert error =", upErr);
        return json({ error: upErr.message }, 500);
      }

      return json({ ok: true, user_id: userId }, 200);
    }

    if (action === "create_colaborador_access") {
      const colaboradorId = String(body?.colaborador_id || "").trim();
      const email = String(body?.email || "").trim().toLowerCase();
      const password = String(body?.password || "");
      const nomeCompleto = String(body?.nome_completo || "").trim();
      const categoria = body?.categoria ? String(body.categoria).trim() : null;
      const idioma = String(body?.idioma || "pt").trim();
      const role = String(body?.role || "operacoes").trim();

      console.log("[admin-users] create_colaborador_access input =", {
        colaboradorId,
        email,
        nomeCompleto,
        categoria,
        idioma,
        role,
      });

      if (!colaboradorId) {
        return json({ error: "Missing colaborador_id" }, 400);
      }

      if (!email || !email.includes("@")) {
        return json({ error: "Invalid email" }, 400);
      }

      if (!password || password.length < 8) {
        return json({ error: "Password must be at least 8 characters" }, 400);
      }

      if (!nomeCompleto) {
        return json({ error: "Missing nome_completo" }, 400);
      }

      if (
        role !== "owner" &&
        role !== "admin" &&
        role !== "operacoes" &&
        role !== "financeiro"
      ) {
        return json({ error: "Invalid role" }, 400);
      }

      const { data: colaborador, error: colabErr } = await adminClient
        .from("colaboradores")
        .select("id,nome_completo,email,status,user_id,categoria")
        .eq("id", colaboradorId)
        .maybeSingle();

      console.log("[admin-users] colaborador lookup data =", colaborador);
      console.log("[admin-users] colaborador lookup error =", colabErr ?? null);

      if (colabErr) {
        console.error("[admin-users] colaborador lookup error =", colabErr);
        return json({ error: colabErr.message }, 500);
      }

      if (!colaborador) {
        return json({ error: "Colaborador not found" }, 400);
      }

      const status = String(colaborador.status || "").trim().toLowerCase();
      console.log("[admin-users] colaborador status =", status);

      if (status !== "ativo" && status !== "active") {
        return json({ error: "Colaborador is not active" }, 400);
      }

      if (colaborador.user_id) {
        return json({ error: "Colaborador already has access" }, 400);
      }

      let existingUserId: string | null = null;
      let page = 1;
      const perPage = 200;

      while (true) {
        const { data, error } = await adminClient.auth.admin.listUsers({ page, perPage });

        if (error) {
          console.error("[admin-users] listUsers during create_colaborador_access error =", error);
          return json({ error: error.message }, 500);
        }

        const users = data?.users || [];
        const found = users.find(
          (u: any) => String(u.email || "").trim().toLowerCase() === email
        );

        if (found) {
          existingUserId = found.id;
          break;
        }

        if (users.length < perPage) break;
        page += 1;
        if (page > 50) break;
      }

      console.log("[admin-users] existingUserId =", existingUserId);

      if (existingUserId) {
        console.error("[admin-users] existing auth user found for email =", email);
        return json({ error: "Já existe um utilizador Auth com este email" }, 400);
      }

      const { data: createData, error: createErr } = await adminClient.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: {
          nome_completo: nomeCompleto,
        },
      });

      console.log("[admin-users] auth createUser data =", createData ?? null);
      console.log("[admin-users] auth createUser error =", createErr ?? null);

      if (createErr) {
        console.error("[admin-users] auth createUser error =", createErr);
        return json({ error: createErr.message }, 500);
      }

      const userId = createData?.user?.id ?? null;

      if (!userId) {
        return json({ error: "Failed to create auth user" }, 500);
      }

      const now = new Date().toISOString();

      const { error: profileErr } = await adminClient
        .from("user_profiles")
        .upsert(
          {
            user_id: userId,
            email,
            nome: nomeCompleto,
            role,
            is_active: true,
            idioma,
            updated_at: now,
          },
          { onConflict: "user_id" }
        );

      console.log("[admin-users] user_profiles upsert error =", profileErr ?? null);

      if (profileErr) {
        console.error("[admin-users] user_profiles upsert error =", profileErr);
        return json({ error: profileErr.message }, 500);
      }

      const { error: roleErr } = await adminClient
        .from("user_roles")
        .upsert(
          {
            user_id: userId,
            role,
            is_active: true,
            updated_at: now,
          },
          { onConflict: "user_id" }
        );

      console.log("[admin-users] user_roles upsert error =", roleErr ?? null);

      if (roleErr) {
        console.error("[admin-users] user_roles upsert during create_colaborador_access error =", roleErr);
        return json({ error: roleErr.message }, 500);
      }

      const { error: updateColabErr } = await adminClient
        .from("colaboradores")
        .update({
          user_id: userId,
          email,
          categoria: categoria ?? colaborador.categoria ?? null,
          updated_at: now,
        })
        .eq("id", colaboradorId);

      console.log("[admin-users] colaboradores update error =", updateColabErr ?? null);

      if (updateColabErr) {
        console.error("[admin-users] colaboradores update error =", updateColabErr);
        return json({ error: updateColabErr.message }, 500);
      }

      return json({ ok: true, user_id: userId }, 200);
    }

    if (action === "set_role") {
      const userId = String(body?.user_id || "").trim();
      const role = body?.role;

      if (!userId) {
        return json({ error: "Missing user_id" }, 400);
      }

      if (role === null || role === "" || role === undefined) {
        const { error } = await adminClient.from("user_roles").delete().eq("user_id", userId);
        if (error) {
          console.error("[admin-users] delete role error =", error);
          return json({ error: error.message }, 500);
        }
        return json({ ok: true }, 200);
      }

      assertRole(role);

      const { error } = await adminClient
        .from("user_roles")
        .upsert(
          {
            user_id: userId,
            role,
            is_active: true,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "user_id" }
        );

      if (error) {
        console.error("[admin-users] set_role upsert error =", error);
        return json({ error: error.message }, 500);
      }

      return json({ ok: true }, 200);
    }

    if (action === "reset_password") {
      const userId = String(body?.user_id || "").trim();

      if (!userId) {
        return json({ error: "Missing user_id" }, 400);
      }

      const { data, error } = await adminClient.auth.admin.getUserById(userId);
      if (error) {
        console.error("[admin-users] getUserById error =", error);
        return json({ error: error.message }, 500);
      }

      const email = data?.user?.email ?? null;
      if (!email) {
        return json({ error: "User has no email" }, 400);
      }

      const { error: resetErr } = await adminClient.auth.resetPasswordForEmail(email);
      if (resetErr) {
        console.error("[admin-users] resetPasswordForEmail error =", resetErr);
        return json({ error: resetErr.message }, 500);
      }

      return json({ ok: true }, 200);
    }

    if (action === "set_active") {
      const userId = String(body?.user_id || "").trim();
      const active = !!body?.active;

      if (!userId) {
        return json({ error: "Missing user_id" }, 400);
      }

      const ban_duration = active ? "none" : "100y";

      const { error } = await adminClient.auth.admin.updateUserById(userId, {
        ban_duration,
      });

      if (error) {
        console.error("[admin-users] updateUserById set_active error =", error);
        return json({ error: error.message }, 500);
      }

      return json({ ok: true }, 200);
    }

    if (action === "delete") {
      const userId = String(body?.user_id || "").trim();

      if (!userId) {
        return json({ error: "Missing user_id" }, 400);
      }

      const { error } = await adminClient.auth.admin.deleteUser(userId);
      if (error) {
        console.error("[admin-users] deleteUser error =", error);
        return json({ error: error.message }, 500);
      }

      await adminClient.from("user_roles").delete().eq("user_id", userId);
      await adminClient.from("user_profiles").delete().eq("user_id", userId);

      return json({ ok: true }, 200);
    }

    return json({ error: "Unknown action" }, 400);
  } catch (e) {
    console.error("[admin-users] fatal error =", e);
    return json({ error: (e as Error).message }, 500);
  }
});