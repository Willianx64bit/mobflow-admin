import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
const digits = (value: unknown) => String(value ?? "").replace(/\D/g, "");

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Método não permitido." }, 405);
  try {
    const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    if (!token) return json({ error: "Sessão necessária." }, 401);
    const url = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    if (!url || !serviceKey || !anonKey) return json({ error: "Serviço indisponível." }, 503);
    const auth = createClient(url, anonKey, { auth: { autoRefreshToken: false, persistSession: false } });
    const { data: userData, error: userError } = await auth.auth.getUser(token);
    if (userError || !userData.user) return json({ error: "Sessão inválida." }, 401);
    const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
    const { data: profile, error: profileError } = await admin.from("profiles").select("role,active").eq("id", userData.user.id).maybeSingle();
    if (profileError || profile?.role !== "admin" || !profile.active) return json({ error: "Acesso administrativo não autorizado." }, 403);

    const body = await req.json();
    const companyName = String(body.companyName ?? "").trim();
    const cnpj = digits(body.cnpj);
    const username = String(body.username ?? "").trim().toUpperCase();
    const password = String(body.password ?? "");
    const email = String(body.email ?? "").trim().toLowerCase();
    const phone = digits(body.phone);
    const monthlyPrice = Number(body.monthlyPrice ?? 79.9);
    if (companyName.length < 2 || companyName.length > 120) return json({ error: "Informe o nome da empresa (2 a 120 caracteres)." }, 400);
    if (cnpj.length !== 14) return json({ error: "Informe um CNPJ com 14 números." }, 400);
    if (!/^[A-Z0-9._-]{3,40}$/.test(username)) return json({ error: "Usuário inválido: use de 3 a 40 letras, números, ponto, hífen ou underline." }, 400);
    if (password.length < 8 || password.length > 128) return json({ error: "A senha deve ter entre 8 e 128 caracteres." }, 400);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: "Informe um e-mail válido." }, 400);
    if (phone.length < 10 || phone.length > 13) return json({ error: "Informe um telefone com DDD." }, 400);
    if (!Number.isFinite(monthlyPrice) || monthlyPrice !== 79.9) return json({ error: "A mensalidade atual do MobFlow é R$ 79,90." }, 400);

    const [{ data: existingCnpj, error: cnpjError }, { data: existingUsername, error: usernameError }, { data: existingEmail, error: emailError }] = await Promise.all([
      admin.from("companies").select("account_id").eq("cnpj", cnpj).maybeSingle(),
      admin.from("profiles").select("id").eq("username", username).maybeSingle(),
      admin.from("companies").select("account_id").ilike("email", email).maybeSingle(),
    ]);
    if (cnpjError || usernameError || emailError) return json({ error: "Não foi possível validar os dados." }, 500);
    if (existingCnpj) return json({ error: "Já existe uma empresa com esse CNPJ." }, 409);
    if (existingUsername) return json({ error: "Esse usuário já está em uso." }, 409);
    if (existingEmail) return json({ error: "Já existe uma empresa com esse e-mail." }, 409);

    const authEmail = username.toLowerCase().replace(/[^a-z0-9._-]/g, "-") + "@accounts.mobflow.local";
    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email: authEmail, password, email_confirm: true,
      user_metadata: { username, cnpj, role: "manager", display_name: companyName, mobflow_signup: "admin_created" },
    });
    if (createError || !created.user) {
      console.error("company auth create failed", createError?.message);
      return json({ error: "Não foi possível criar o acesso. Verifique se o usuário já existe." }, 500);
    }
    const accountId = created.user.id;
    const { error: companyError } = await admin.from("companies").insert({
      account_id: accountId, company_name: companyName, cnpj, username, email, phone,
      plan_code: "complete", monthly_price: monthlyPrice, payment_method: "pix", subscription_status: "pending_payment",
    });
    if (companyError) {
      await admin.auth.admin.deleteUser(accountId);
      console.error("company row insert failed", companyError.message);
      return json({ error: companyError.code === "23505" ? "Já existe cadastro com esse CNPJ ou e-mail." : "Não foi possível salvar a empresa." }, companyError.code === "23505" ? 409 : 500);
    }
    const { error: profileErrorInsert } = await admin.from("profiles").insert({
      id: accountId, username, cnpj, account_id: accountId, role: "manager", active: true,
      display_name: companyName, permissions: ["PDV", "Conferência", "Validade", "Fiado", "Gerência"],
    });
    if (profileErrorInsert) {
      await admin.from("companies").delete().eq("account_id", accountId);
      await admin.auth.admin.deleteUser(accountId);
      console.error("company profile insert failed", profileErrorInsert.message);
      return json({ error: profileErrorInsert.code === "23505" ? "Esse usuário já está em uso." : "Não foi possível preparar o perfil da empresa." }, profileErrorInsert.code === "23505" ? 409 : 500);
    }
    const { error: allowlistError } = await admin.from("account_allowlist").insert({ username, cnpj, active: true });
    if (allowlistError) {
      await admin.from("profiles").delete().eq("id", accountId);
      await admin.from("companies").delete().eq("account_id", accountId);
      await admin.auth.admin.deleteUser(accountId);
      console.error("company allowlist insert failed", allowlistError.message);
      return json({ error: allowlistError.code === "23505" ? "Esse usuário já está autorizado em outra conta." : "Não foi possível autorizar o acesso da empresa." }, allowlistError.code === "23505" ? 409 : 500);
    }
    const initialState = {
      products: [], cart: [], sales: [], conferences: [], receiving: [],
      manualExpiries: [], promotions: [], suppliers: [], settings: { companyName },
    };
    const { error: stateError } = await admin.from("app_state").insert({
      owner_id: accountId, state: initialState, updated_at: new Date().toISOString(),
    });
    if (stateError) {
      console.error("company initial state insert failed", stateError.message);
      return json({ error: "A empresa foi cadastrada, mas o espaço inicial de dados não foi criado. Contate o suporte." }, 500);
    }
    return json({ ok: true, message: "Empresa cadastrada e aguardando ativação da assinatura.", accountId });
  } catch (error) {
    console.error("mobflow-admin-create-company error", error);
    return json({ error: "Não foi possível concluir o cadastro." }, 500);
  }
});