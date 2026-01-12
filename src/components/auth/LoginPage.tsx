// src/components/auth/LoginPage.tsx
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { Check, Eye, EyeOff, Globe, Lock, Mail, ShieldCheck } from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";
import { useLanguage, type Language } from "../../contexts/LanguageContext";
import { Button } from "../ui/Button";
import { createNotification } from "../../lib/notifications";

type LoginMode = "operacoes" | "admin";

export function LoginPage() {
  const { signIn, signOut, user, isAdmin } = useAuth();
  const { t } = useLanguage();

  const [mode, setMode] = useState<LoginMode>("operacoes");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const brand = useMemo(
    () => ({
      blue: "#0B4F8A",
      blue2: "#094070",
      orange: "#F5A623",
    }),
    []
  );

  // Se o utilizador entrou mas escolheu "Administração" sem permissão, força logout
  useEffect(() => {
    if (!user) return;
    if (mode !== "admin") return;

    // Administração exige owner/admin
    if (!isAdmin) {
      setError("Sem permissão para Administração. Entre no modo Operações ou peça acesso.");
      signOut();
    }
  }, [user, mode, isAdmin, signOut]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);

    try {
      const userData = await signIn(email.trim(), password);

      await createNotification(
        userData.id,
        "sucesso",
        "Bem-vindo ao Sistema Diâmetro",
        `Olá ${userData.nome}! Acesso ao sistema realizado com sucesso.`
      );
    } catch (err: any) {
      setError(err?.message || "Erro ao fazer login");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="min-h-screen relative overflow-hidden"
      style={{
        background: `radial-gradient(1200px 600px at 15% 10%, ${brand.blue} 0%, ${brand.blue2} 45%, #071a2a 100%)`,
      }}
    >
      {/* Language (top-right, like your 2nd print) */}
      <div className="absolute top-5 right-5 z-20">
        <CornerLanguageSelector />
      </div>

      {/* Decorative blobs */}
      <div
        className="pointer-events-none absolute -top-24 -left-24 h-80 w-80 rounded-full blur-3xl opacity-25"
        style={{ backgroundColor: brand.orange }}
      />
      <div
        className="pointer-events-none absolute -bottom-40 -right-40 h-[28rem] w-[28rem] rounded-full blur-3xl opacity-20"
        style={{ backgroundColor: brand.blue }}
      />

      <div className="relative z-10 min-h-screen flex items-center justify-center p-4">
        <div className="w-full max-w-5xl grid lg:grid-cols-2 gap-6 items-stretch">
          {/* Left hero panel */}
          <div className="hidden lg:flex relative overflow-hidden rounded-2xl border border-white/10 bg-white/5 shadow-2xl">
            <div
              className="absolute inset-0"
              style={{
                backgroundImage:
                  "linear-gradient(180deg, rgba(11,79,138,0.72), rgba(7,26,42,0.90))",
                backgroundSize: "cover",
                backgroundPosition: "center",
              }}
            />

            <div className="relative z-10 p-10 flex flex-col justify-between">
              <div>
                <div className="inline-flex items-center gap-3">
                  <div className="h-10 w-1 rounded-full" style={{ backgroundColor: brand.orange }} />
                  <div>
                    <p className="text-white font-semibold text-base leading-none">Sistema Diâmetro</p>
                    <p className="text-white/70 text-sm">Gestão de Obras & Colaboradores</p>
                  </div>
                </div>

                <h2 className="mt-10 text-white text-3xl font-bold leading-tight">
                  Canalização profissional <br />
                  <span style={{ color: brand.orange }}>com controlo total</span>
                </h2>

                <p className="mt-4 text-white/80 max-w-md">
                  Presenças, equipas, pagamentos e documentos com validade — num só painel,
                  com auditoria e permissões.
                </p>
              </div>

              <div className="grid gap-3">
                <FeatureRow
                  icon={<ShieldCheck className="h-5 w-5" />}
                  title="Conformidade e validade"
                  desc="Alertas e histórico de documentos críticos."
                />
                <FeatureRow
                  icon={<Lock className="h-5 w-5" />}
                  title="Acesso por perfis"
                  desc="Administração e Operações com permissões."
                />
              </div>
            </div>

            <div
              className="absolute top-0 left-0 right-0 h-1"
              style={{
                background: `linear-gradient(90deg, ${brand.blue} 0%, ${brand.blue} 60%, ${brand.orange} 100%)`,
              }}
            />
          </div>

          {/* Right login card */}
          <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-white shadow-2xl">
            <div
              className="h-1 w-full"
              style={{
                background: `linear-gradient(90deg, ${brand.blue} 0%, ${brand.blue} 65%, ${brand.orange} 100%)`,
              }}
            />

            <div className="p-7 sm:p-10">
              {/* Header */}
              <div className="flex items-start justify-between gap-4 mb-6">
                <div className="flex items-start gap-4">
                  <img
                    src="/logo-diametro.png"
                    alt="Diâmetro"
                    className="h-12 sm:h-14 w-auto object-contain"
                    draggable={false}
                  />

                  <div>
                    <h1 className="text-xl sm:text-2xl font-bold text-slate-900">{t("auth.welcome")}</h1>
                    <p className="text-sm text-slate-500">{t("auth.subtitle")}</p>
                  </div>
                </div>
              </div>

              {/* Mode toggle */}
              <div className="mt-2">
                <div className="inline-flex rounded-xl border border-slate-200 bg-slate-50 p-1">
                  <button
                    type="button"
                    onClick={() => setMode("operacoes")}
                    className={[
                      "px-4 py-2 text-sm rounded-lg transition",
                      mode === "operacoes"
                        ? "bg-white shadow text-slate-900"
                        : "text-slate-600 hover:text-slate-800",
                    ].join(" ")}
                  >
                    Acesso Operações
                  </button>
                  <button
                    type="button"
                    onClick={() => setMode("admin")}
                    className={[
                      "px-4 py-2 text-sm rounded-lg transition",
                      mode === "admin"
                        ? "bg-white shadow text-slate-900"
                        : "text-slate-600 hover:text-slate-800",
                    ].join(" ")}
                  >
                    Acesso Administração
                  </button>
                </div>

                {mode === "admin" ? (
                  <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
                    Apenas utilizadores com perfil <b>Owner</b> ou <b>Admin</b> devem usar este modo.
                  </div>
                ) : null}
              </div>

              {/* Error */}
              {error ? (
                <div className="mt-6 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                  {error}
                </div>
              ) : null}

              <form onSubmit={handleSubmit} className="mt-6 space-y-5">
                {/* Email */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">{t("auth.email")}</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
                      <Mail className="h-5 w-5" />
                    </span>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="seu@email.com"
                      autoComplete="email"
                      required
                      className="w-full rounded-xl border border-slate-200 bg-white px-11 py-3 text-slate-900 placeholder:text-slate-400 focus:outline-none"
                      onFocus={(e) => {
                        e.currentTarget.style.boxShadow = `0 0 0 3px rgba(11,79,138,0.18)`;
                        e.currentTarget.style.borderColor = brand.blue;
                      }}
                      onBlur={(e) => {
                        e.currentTarget.style.boxShadow = "none";
                        e.currentTarget.style.borderColor = "rgb(226 232 240)";
                      }}
                    />
                  </div>
                </div>

                {/* Password */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">{t("auth.password")}</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
                      <Lock className="h-5 w-5" />
                    </span>

                    <input
                      type={showPwd ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      autoComplete="current-password"
                      required
                      className="w-full rounded-xl border border-slate-200 bg-white px-11 py-3 pr-12 text-slate-900 placeholder:text-slate-400 focus:outline-none"
                      onFocus={(e) => {
                        e.currentTarget.style.boxShadow = `0 0 0 3px rgba(11,79,138,0.18)`;
                        e.currentTarget.style.borderColor = brand.blue;
                      }}
                      onBlur={(e) => {
                        e.currentTarget.style.boxShadow = "none";
                        e.currentTarget.style.borderColor = "rgb(226 232 240)";
                      }}
                    />

                    <button
                      type="button"
                      onClick={() => setShowPwd((v) => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-700"
                      aria-label={showPwd ? "Ocultar palavra-passe" : "Mostrar palavra-passe"}
                    >
                      {showPwd ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                    </button>
                  </div>

                  <div className="mt-3 flex items-center justify-between">
                    <label className="inline-flex items-center gap-2 text-xs text-slate-500">
                      <input type="checkbox" className="rounded border-slate-300" />
                      {t("auth.remember")}
                    </label>

                    {mode === "operacoes" ? (
                      <button
                        type="button"
                        className="text-xs font-medium hover:underline"
                        style={{ color: brand.blue }}
                        onClick={() => alert("Fluxo de recuperação ainda não implementado.")}
                      >
                        {t("auth.forgot")}
                      </button>
                    ) : (
                      <span className="text-xs text-slate-400 select-none"> </span>
                    )}
                  </div>
                </div>

                {/* Submit */}
                <div className="pt-1">
                  <Button type="submit" fullWidth loading={submitting}>
                    {t("auth.login")}
                  </Button>

                  <div className="mt-4 text-center text-xs text-slate-500">
                    Sistema interno Diâmetro • Acesso restrito
                  </div>
                </div>
              </form>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function FeatureRow({
  icon,
  title,
  desc,
}: {
  icon: ReactNode;
  title: string;
  desc: string;
}) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-3">
      <div className="mt-0.5 text-white/90">{icon}</div>
      <div>
        <p className="text-white font-medium text-sm">{title}</p>
        <p className="text-white/70 text-xs">{desc}</p>
      </div>
    </div>
  );
}

/**
 * Compact language selector (top-right pill), matching the style of your 2nd screenshot.
 * Uses LanguageContext directly, so it works anywhere (including login).
 */
function CornerLanguageSelector() {
  const { language, setLanguage } = useLanguage();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const items: Array<{ value: Language; label: string; pill: string }> = useMemo(
    () => [
      { value: "pt", label: "Português (PT)", pill: "PT  PT" },
      { value: "pt-BR", label: "Português (BR)", pill: "PT  BR" },
      { value: "en", label: "English", pill: "EN  US" },
      { value: "es", label: "Español", pill: "ES  ES" },
      { value: "fr", label: "Français", pill: "FR  FR" },
      { value: "hi", label: "हिन्दी", pill: "HI  IN" },
      { value: "ar", label: "العربية", pill: "AR  SA" },
    ],
    []
  );

  const current = items.find((i) => i.value === language) ?? items[0];

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!ref.current) return;
      if (!ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onEsc(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }

    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onEsc);
    };
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={[
          "inline-flex items-center gap-2 rounded-full px-3 py-2",
          "border border-white/20 bg-white/10 text-white shadow-lg",
          "backdrop-blur-md hover:bg-white/15 transition",
          "focus:outline-none focus:ring-2 focus:ring-white/30",
        ].join(" ")}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <span className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/15 bg-white/10">
          <Globe className="h-4 w-4 text-white/90" />
        </span>
        <span className="text-sm font-semibold tracking-wide">{current.pill}</span>
      </button>

      {open ? (
        <div
          role="menu"
          className={[
            "absolute right-0 mt-2 w-56 overflow-hidden rounded-2xl",
            "border border-white/15 bg-slate-950/70 shadow-2xl backdrop-blur-md",
          ].join(" ")}
        >
          <div className="px-3 py-2 text-xs text-white/60 border-b border-white/10">
            Idioma
          </div>

          <div className="py-1">
            {items.map((it) => {
              const active = it.value === language;
              return (
                <button
                  key={it.value}
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setLanguage(it.value);
                    setOpen(false);
                  }}
                  className={[
                    "w-full px-3 py-2.5 text-left flex items-center justify-between gap-3",
                    "text-sm transition",
                    active ? "bg-white/10 text-white" : "text-white/85 hover:bg-white/10",
                  ].join(" ")}
                >
                  <div className="flex flex-col">
                    <span className="font-medium">{it.label}</span>
                    <span className="text-xs text-white/55">{it.pill}</span>
                  </div>
                  {active ? <Check className="h-4 w-4 text-white/90" /> : null}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}
