import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

type Company = {
  account_id: string;
  company_name: string;
  cnpj: string;
  username: string;
  email: string | null;
  phone: string | null;
  plan_code: string;
  monthly_price: number;
  subscription_status: "pending_payment" | "active" | "past_due" | "suspended" | "cancelled";
  created_at: string;
  payment_submitted_at?: string | null;
  payment_confirmed_at?: string | null;
  payment_notes?: string | null;
};

type LegacyAccount = { account_id: string; company_name: string; cnpj: string; usernames: string[]; user_count: number; status: "active" };
type AdminProfile = { username: string; role: "admin"; display_name?: string };
type FunctionError = { error?: string; message?: string };
type NewCompanyForm = { companyName: string; cnpj: string; username: string; password: string; email: string; phone: string; monthlyPrice: string };
const emptyCompanyForm: NewCompanyForm = { companyName: "", cnpj: "", username: "", password: "", email: "", phone: "", monthlyPrice: "79,90" };


export const Route = createFileRoute("/")({ component: Index });

const statusLabels: Record<Company["subscription_status"], string> = {
  pending_payment: "Aguardando pagamento",
  active: "Ativa",
  past_due: "Pagamento atrasado",
  suspended: "Suspensa",
  cancelled: "Cancelada",
};

function Index() {
  const [username, setUsername] = useState("");
  const [cnpj, setCnpj] = useState("");
  const [password, setPassword] = useState("");
  const [profile, setProfile] = useState<AdminProfile | null>(null);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [legacyAccounts, setLegacyAccounts] = useState<LegacyAccount[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingCompanies, setLoadingCompanies] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [updatingId, setUpdatingId] = useState("");
  const [showNewCompany, setShowNewCompany] = useState(false);
  const [newCompany, setNewCompany] = useState<NewCompanyForm>(emptyCompanyForm);
  const [creatingCompany, setCreatingCompany] = useState(false);

  const loadCompanies = useCallback(async () => {
    setLoadingCompanies(true);
    setError("");
    try {
      const { data, error: invokeError } = await supabase.functions.invoke("mobflow-admin-subscriptions", {
        body: { action: "list" },
      });
      if (invokeError) {
        setError(invokeError.message || "Não foi possível consultar as empresas.");
        return;
      }
      const result = data as (FunctionError & { companies?: Company[]; subscriptions?: Company[]; data?: Company[]; activeAccounts?: LegacyAccount[]; ok?: boolean }) | null;
      if (!result || result.error) {
        setError(result?.error || "Resposta inválida do servidor.");
        return;
      }
      const rows = result.companies ?? result.subscriptions ?? result.data;
      if (Array.isArray(rows)) {
        setCompanies(rows);
        setLegacyAccounts(Array.isArray(result.activeAccounts) ? result.activeAccounts : []);
      } else {
        setError("O servidor respondeu, mas não retornou a lista esperada de empresas.");
      }
    } catch (cause) {
      console.error("Falha ao carregar empresas", cause);
      setError("Falha inesperada ao consultar empresas. Verifique a conexão e tente novamente.");
    } finally {
      setLoadingCompanies(false);
    }
  }, []);

  useEffect(() => {
    let alive = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!alive || !data.session) return;
      setProfile({ username: data.session.user.user_metadata?.username ?? "Administrador", role: "admin" });
      void loadCompanies();
    });
    return () => { alive = false; };
  }, [loadCompanies]);

  const login = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setError("");
    const cleanCnpj = cnpj.replace(/\D/g, "");
    const { data, error: invokeError } = await supabase.functions.invoke("mobflow-login", {
      body: { username: username.trim().toUpperCase(), password, cnpj: cleanCnpj, expectedRole: "admin" },
    });
    if (invokeError) {
      setError(invokeError.message || "Falha ao conectar com o servidor.");
      setLoading(false);
      return;
    }
    const result = data as (FunctionError & { session?: { access_token: string; refresh_token: string }; profile?: AdminProfile }) | null;
    if (!result?.session || result.error) {
      setError(result?.error || "Não foi possível entrar.");
      setLoading(false);
      return;
    }
    const { error: sessionError } = await supabase.auth.setSession({
      access_token: result.session.access_token,
      refresh_token: result.session.refresh_token,
    });
    if (sessionError) {
      setError("Login validado, mas não foi possível iniciar a sessão: " + sessionError.message);
      setLoading(false);
      return;
    }
    setProfile(result.profile ?? { username: username.trim().toUpperCase(), role: "admin" });
    setPassword("");
    setLoading(false);
    await loadCompanies();
  };

  const logout = async () => {
    await supabase.auth.signOut();
    setProfile(null);
    setCompanies([]);
    setLegacyAccounts([]);
    setError("");
  };

  const updateStatus = async (company: Company, status: Company["subscription_status"]) => {
    const actionText = status === "active" ? "ativar" : status === "suspended" ? "suspender" : status === "cancelled" ? "cancelar" : "alterar";
    if (!window.confirm(`Deseja ${actionText} a empresa "${company.company_name}"?`)) return;
    setUpdatingId(company.account_id);
    setError("");
    const { data, error: invokeError } = await supabase.functions.invoke("mobflow-admin-subscriptions", {
      body: { action: "update", accountId: company.account_id, status, note: company.payment_notes ?? "" },
    });
    const result = data as FunctionError | null;
    if (invokeError || result?.error) setError(result?.error || invokeError?.message || "Não foi possível atualizar a empresa.");
    else await loadCompanies();
    setUpdatingId("");
  };


  const createCompany = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (creatingCompany) return;
    setCreatingCompany(true);
    setError("");
    try {
      const price = Number(newCompany.monthlyPrice.replace(",", "."));
      const { data, error: invokeError } = await supabase.functions.invoke("mobflow-admin-create-company", {
        body: {
          companyName: newCompany.companyName.trim(),
          cnpj: newCompany.cnpj.replace(/\D/g, ""),
          username: newCompany.username.trim().toUpperCase(),
          password: newCompany.password,
          email: newCompany.email.trim(),
          phone: newCompany.phone.replace(/\D/g, ""),
          monthlyPrice: price,
        },
      });
      const result = data as FunctionError | null;
      if (invokeError || result?.error) {
        setError(result?.error || invokeError?.message || "Não foi possível cadastrar a empresa.");
        return;
      }
      setNewCompany(emptyCompanyForm);
      setShowNewCompany(false);
      await loadCompanies();
      window.alert(result?.message || "Empresa cadastrada.");
    } catch (cause) {
      console.error("Falha ao cadastrar empresa", cause);
      setError("Falha inesperada ao cadastrar a empresa. Verifique a conexão e tente novamente.");
    } finally {
      setCreatingCompany(false);
    }
  };

  const filtered = companies.filter((company) =>
    [company.company_name, company.cnpj, company.username, company.email ?? ""].some((value) =>
      value.toLocaleLowerCase("pt-BR").includes(search.toLocaleLowerCase("pt-BR"))
    )
  );
  const countActive = companies.filter((c) => c.subscription_status === "active").length + legacyAccounts.length;
  const countSuspended = companies.filter((c) => c.subscription_status === "suspended").length;
  const totalAccounts = companies.length + legacyAccounts.length;

  if (!profile) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-950 px-4 py-10 text-slate-100">
        <section className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl sm:p-8">
          <div className="mb-7 flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-cyan-400 font-black text-slate-950">MF</div>
            <div><p className="text-xs font-semibold uppercase tracking-[0.22em] text-cyan-300">MobFlow</p><h1 className="text-2xl font-bold">Admin</h1><p className="text-sm text-slate-400">Gestão central de empresas</p></div>
          </div>
          <form className="space-y-4" onSubmit={login}>
            <label className="block text-sm font-medium">Usuário administrador<input required autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} className="mt-1.5 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-3 outline-none focus:border-cyan-400" placeholder="Seu usuário" /></label>
            <label className="block text-sm font-medium">CNPJ administrativo<input required inputMode="numeric" autoComplete="off" value={cnpj} onChange={(e) => setCnpj(e.target.value)} className="mt-1.5 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-3 outline-none focus:border-cyan-400" placeholder="14 números" maxLength={18} /></label>
            <label className="block text-sm font-medium">Senha<input required type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} className="mt-1.5 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-3 outline-none focus:border-cyan-400" placeholder="Sua senha" /></label>
            {error && <p role="alert" className="rounded-lg border border-red-900 bg-red-950/60 p-3 text-sm text-red-200">{error}</p>}
            <button disabled={loading} className="w-full rounded-lg bg-cyan-400 px-4 py-3 font-bold text-slate-950 transition hover:bg-cyan-300 disabled:opacity-60">{loading ? "Conectando..." : "Entrar no Admin"}</button>
          </form>
          <p className="mt-5 text-xs leading-5 text-slate-500">Acesso protegido pelo Supabase. Use as credenciais de administrador do MobFlow.</p>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <header className="border-b border-slate-800 bg-slate-900/80">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <div className="flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-lg bg-cyan-400 font-black text-slate-950">MF</div><div><h1 className="text-xl font-bold">MobFlow Admin</h1><p className="text-xs text-slate-400">Conectado ao banco do MobFlow PDV</p></div></div>
          <div className="flex items-center gap-3"><span className="text-sm text-slate-300">{profile.username}</span><button onClick={logout} className="rounded-lg border border-slate-700 px-3 py-2 text-sm hover:bg-slate-800">Sair</button></div>
        </div>
      </header>
      <div className="mx-auto max-w-7xl px-4 py-7 sm:px-6">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-3"><div><h2 className="text-2xl font-bold">Visão geral</h2><p className="mt-1 text-sm text-slate-400">Empresas e assinaturas registradas no Supabase.</p></div><button onClick={() => void loadCompanies()} disabled={loadingCompanies} className="rounded-lg border border-slate-700 px-4 py-2 text-sm hover:bg-slate-800 disabled:opacity-60">{loadingCompanies ? "Atualizando..." : "Atualizar dados"}</button></div>
        <div className="mb-6 flex justify-end"><button onClick={() => setShowNewCompany((value) => !value)} className="rounded-lg bg-cyan-400 px-4 py-2.5 text-sm font-bold text-slate-950 hover:bg-cyan-300">{showNewCompany ? "Fechar cadastro" : "+ Cadastrar nova empresa"}</button></div>
        {showNewCompany && <section className="mb-6 rounded-2xl border border-slate-800 bg-slate-900 p-5">
          <h3 className="text-lg font-semibold">Cadastrar nova empresa</h3>
          <p className="mb-4 mt-1 text-sm text-slate-400">O cadastro cria um espaço de dados separado. A assinatura começa aguardando ativação.</p>
          <form onSubmit={createCompany} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <label className="text-sm">Nome da empresa<input required minLength={2} maxLength={120} value={newCompany.companyName} onChange={(e) => setNewCompany({ ...newCompany, companyName: e.target.value })} className="mt-1 block w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5" /></label>
            <label className="text-sm">CNPJ<input required maxLength={18} value={newCompany.cnpj} onChange={(e) => setNewCompany({ ...newCompany, cnpj: e.target.value })} placeholder="00.000.000/0000-00" className="mt-1 block w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5" /></label>
            <label className="text-sm">Usuário gerente<input required minLength={3} maxLength={40} value={newCompany.username} onChange={(e) => setNewCompany({ ...newCompany, username: e.target.value.toUpperCase() })} className="mt-1 block w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5" /></label>
            <label className="text-sm">Senha inicial<input required type="password" minLength={8} maxLength={128} autoComplete="new-password" value={newCompany.password} onChange={(e) => setNewCompany({ ...newCompany, password: e.target.value })} className="mt-1 block w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5" /></label>
            <label className="text-sm">E-mail<input required type="email" value={newCompany.email} onChange={(e) => setNewCompany({ ...newCompany, email: e.target.value })} className="mt-1 block w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5" /></label>
            <label className="text-sm">Telefone com DDD<input required inputMode="tel" value={newCompany.phone} onChange={(e) => setNewCompany({ ...newCompany, phone: e.target.value })} className="mt-1 block w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5" /></label>
            <label className="text-sm">Mensalidade (R$)<input required inputMode="decimal" value={newCompany.monthlyPrice} onChange={(e) => setNewCompany({ ...newCompany, monthlyPrice: e.target.value })} className="mt-1 block w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5" /></label>
            <div className="flex items-end"><button disabled={creatingCompany} className="w-full rounded-lg bg-cyan-400 px-4 py-2.5 font-bold text-slate-950 disabled:opacity-60">{creatingCompany ? "Cadastrando..." : "Criar empresa"}</button></div>
          </form>
        </section>
        {error && <p role="alert" className="mb-5 rounded-lg border border-red-900 bg-red-950/60 p-3 text-sm text-red-200">{error}</p>}
        <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Metric label="Empresas / contas encontradas" value={totalAccounts} />
          <Metric label="Empresas ativas" value={countActive} />
          <Metric label="Empresas suspensas" value={countSuspended} />
          <Metric label="Aguardando pagamento" value={companies.filter((c) => c.subscription_status === "pending_payment").length} />
        </div>
        <section className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900">
          <div className="flex flex-col gap-3 border-b border-slate-800 p-4 sm:flex-row sm:items-center sm:justify-between"><div><h3 className="font-semibold">Empresas</h3><p className="text-sm text-slate-400">Dados consultados no banco compartilhado.</p></div><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por nome, CNPJ ou usuário..." className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-cyan-400 sm:max-w-sm" /></div>
          {loadingCompanies ? <p className="p-8 text-center text-slate-400">Carregando empresas...</p> : filtered.length === 0 && legacyAccounts.filter((a) => [a.company_name, a.cnpj, ...a.usernames].some((v) => v.toLocaleLowerCase("pt-BR").includes(search.toLocaleLowerCase("pt-BR")))).length === 0 ? <p className="p-8 text-center text-slate-400">{totalAccounts ? "Nenhuma empresa corresponde à busca." : "Nenhuma empresa ou conta cadastrada encontrada."}</p> : (
            <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm"><thead className="bg-slate-950/70 text-xs uppercase tracking-wide text-slate-400"><tr><th className="px-4 py-3">Empresa</th><th className="px-4 py-3">Usuário / CNPJ</th><th className="px-4 py-3">Mensalidade</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Ações</th></tr></thead><tbody className="divide-y divide-slate-800">{filtered.map((company) => <tr key={company.account_id} className="hover:bg-slate-800/40"><td className="px-4 py-4"><p className="font-semibold">{company.company_name}</p><p className="mt-1 text-xs text-slate-400">{company.email || "Sem e-mail"}{company.phone ? " · " + company.phone : ""}</p></td><td className="px-4 py-4"><p>{company.username}</p><p className="mt-1 text-xs text-slate-400">{company.cnpj}</p></td><td className="px-4 py-4">R$ {Number(company.monthly_price || 79.9).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</td><td className="px-4 py-4"><span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${company.subscription_status === "active" ? "bg-emerald-950 text-emerald-300" : company.subscription_status === "suspended" || company.subscription_status === "cancelled" ? "bg-red-950 text-red-300" : "bg-amber-950 text-amber-300"}`}>{statusLabels[company.subscription_status] || company.subscription_status}</span></td><td className="px-4 py-4"><div className="flex flex-wrap gap-2">{company.subscription_status !== "active" && <button disabled={updatingId === company.account_id} onClick={() => void updateStatus(company, "active")} className="rounded-md bg-emerald-700 px-3 py-1.5 text-xs font-semibold hover:bg-emerald-600 disabled:opacity-50">Ativar</button>}{company.subscription_status !== "suspended" && <button disabled={updatingId === company.account_id} onClick={() => void updateStatus(company, "suspended")} className="rounded-md border border-red-900 px-3 py-1.5 text-xs hover:bg-red-950 disabled:opacity-50">Suspender</button>}</div></td></tr>)}</tbody></table></div>
          )}
          {legacyAccounts.filter((a) => [a.company_name, a.cnpj, ...a.usernames].some((v) => v.toLocaleLowerCase("pt-BR").includes(search.toLocaleLowerCase("pt-BR")))).length > 0 && <div className="border-t border-slate-800 p-4">
            <h4 className="font-semibold">Contas antigas do PDV</h4>
            <p className="mb-3 mt-1 text-sm text-slate-400">Contas existentes antes do cadastro de assinaturas. Elas são exibidas sem criar registros duplicados nem alterar o estoque.</p>
            <div className="space-y-3">{legacyAccounts.filter((a) => [a.company_name, a.cnpj, ...a.usernames].some((v) => v.toLocaleLowerCase("pt-BR").includes(search.toLocaleLowerCase("pt-BR")))).map((account) => <div key={account.account_id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-800 bg-slate-950/50 p-3">
              <div><p className="font-semibold">{account.company_name}</p><p className="mt-1 text-xs text-slate-400">Usuários: {account.usernames.join(", ") || "—"} · CNPJ: {account.cnpj || "não informado"}</p></div>
              <span className="rounded-full bg-emerald-950 px-2.5 py-1 text-xs font-semibold text-emerald-300">Conta existente · {account.user_count} usuário(s)</span>
            </div>)}</div>
          </div>}
        </section>
        <p className="mt-5 text-xs text-slate-500">Contas antigas são apenas identificadas nesta tela; para gerenciar assinatura é necessário cadastrá-las corretamente no registro de empresas. O navegador não recebe a chave de serviço.</p>
      </div>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return <section className="rounded-xl border border-slate-800 bg-slate-900 p-5"><p className="text-sm text-slate-400">{label}</p><p className="mt-2 text-3xl font-bold tracking-tight">{value}</p></section>;
}
