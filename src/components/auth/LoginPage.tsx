// src/components/auth/LoginPage.tsx
import {
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
  useEffect,
} from "react";
import {
  Check,
  Eye,
  EyeOff,
  Globe,
  Lock,
  Mail,
  ShieldCheck,
  X,
  Phone,
  MessageCircle,
} from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";
import { useLanguage, type Language } from "../../contexts/LanguageContext";
import { Button } from "../ui/Button";
import { createNotification } from "../../lib/notifications";
import { AUTH_STORAGE_KEY, AUTH_STORAGE_PREF_KEY } from "../../lib/supabase";

type LoginMode = "operacoes" | "admin";

// Preferências do login
const LOGIN_REMEMBER_KEY = "login-remember"; // "1" | "0"
const LOGIN_EMAIL_KEY = "login-email"; // email salvo

export function LoginPage() {
  const { signIn, authError, clearAuthError } = useAuth();
  const { t } = useLanguage();

  const [mode, setMode] = useState<LoginMode>("operacoes");
  const modeRef = useRef<LoginMode>("operacoes");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // erro local (UX imediata)
  const [error, setError] = useState("");

  // ✅ lembrar-me (funcional)
  const [rememberMe, setRememberMe] = useState(true);

  // ✅ modal “esqueceu a palavra-passe”
  const [supportOpen, setSupportOpen] = useState(false);

  const brand = useMemo(
    () => ({
      blue: "#0B4F8A",
      blue2: "#094070",
      orange: "#F5A623",
    }),
    []
  );

  // manter ref sincronizada
  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  // carregar preferências (remember + email)
  useEffect(() => {
    try {
      const pref = localStorage.getItem(LOGIN_REMEMBER_KEY);
      const remember = pref !== "0";
      setRememberMe(remember);

      const savedEmail = localStorage.getItem(LOGIN_EMAIL_KEY);
      if (remember && savedEmail) setEmail(savedEmail);
    } catch {}
  }, []);

  // se AuthContext setar authError, refletir no estado local (opcional)
  useEffect(() => {
    if (authError) setError(authError);
  }, [authError]);

  const clearAllErrors = () => {
    if (error) setError("");
    clearAuthError();
  };

  const setModeSafe = (next: LoginMode) => {
    modeRef.current = next;
    setMode(next);
    clearAllErrors();
    setSupportOpen(false);
  };

  const visibleError = (error || authError || "").trim();

  const applyRememberPreference = (nextRemember: boolean, nextEmail: string) => {
    try {
      // 1) define onde o Supabase vai persistir a sessão
      //    - true  => localStorage (persistente)
      //    - false => sessionStorage (some ao fechar o browser)
      localStorage.setItem(AUTH_STORAGE_PREF_KEY, nextRemember ? "local" : "session");

      // 2) salva preferência do checkbox
      localStorage.setItem(LOGIN_REMEMBER_KEY, nextRemember ? "1" : "0");

      // 3) salva/remover email
      const cleanEmail = (nextEmail || "").trim();
      if (nextRemember && cleanEmail) localStorage.setItem(LOGIN_EMAIL_KEY, cleanEmail);
      else localStorage.removeItem(LOGIN_EMAIL_KEY);

      // 4) evita “sessão fantasma” (limpa APENAS o storage oposto)
      if (nextRemember) {
        sessionStorage.removeItem(AUTH_STORAGE_KEY);
      } else {
        localStorage.removeItem(AUTH_STORAGE_KEY);
      }
    } catch {}
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    clearAllErrors();

    // ✅ importante: define storage ANTES do signIn (token será salvo no lugar correto)
    applyRememberPreference(rememberMe, email);

    setSubmitting(true);

    try {
      const selectedMode = modeRef.current;
      console.log("[LOGIN] submit mode=", selectedMode);

      const userData = await signIn(email.trim(), password, selectedMode);

      // notificação é opcional; se falhar não deve “mascarar” login
      try {
        await createNotification(
          userData.id,
          "sucesso",
          t("auth.notification.title"),
          t("auth.notification.body").replace("{nome}", userData.nome)
        );
      } catch (notifyErr) {
        console.warn("[LOGIN] createNotification failed:", notifyErr);
      }
    } catch (err: any) {
      const msg = String(err?.message || "").trim();
      setError(msg || t("auth.loginErrorGeneric"));
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
      <div className="absolute top-5 right-5 z-20">
        <CornerLanguageSelector />
      </div>

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
                  <div
                    className="h-10 w-1 rounded-full"
                    style={{ backgroundColor: brand.orange }}
                  />
                  <div>
                    <p className="text-white font-semibold text-base leading-none">
                      {t("auth.hero.brandTitle")}
                    </p>
                    <p className="text-white/70 text-sm">
                      {t("auth.hero.brandSubtitle")}
                    </p>
                  </div>
                </div>

                <h2 className="mt-10 text-white text-3xl font-bold leading-tight">
                  {t("auth.hero.headlineA")} <br />
                  <span style={{ color: brand.orange }}>
                    {t("auth.hero.headlineB")}
                  </span>
                </h2>

                <p className="mt-4 text-white/80 max-w-md">
                  {t("auth.hero.description")}
                </p>
              </div>

              <div className="grid gap-3">
                <FeatureRow
                  icon={<ShieldCheck className="h-5 w-5" />}
                  title={t("auth.hero.feature1.title")}
                  desc={t("auth.hero.feature1.desc")}
                />
                <FeatureRow
                  icon={<Lock className="h-5 w-5" />}
                  title={t("auth.hero.feature2.title")}
                  desc={t("auth.hero.feature2.desc")}
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
              <div className="flex items-start justify-between gap-4 mb-6">
                <div className="flex items-start gap-4">
                  <img
                    src="/logo-diametro.png"
                    alt="Diâmetro"
                    className="h-12 sm:h-14 w-auto object-contain"
                    draggable={false}
                  />

                  <div>
                    <h1 className="text-xl sm:text-2xl font-bold text-slate-900">
                      {t("auth.welcome")}
                    </h1>
                    <p className="text-sm text-slate-500">{t("auth.subtitle")}</p>
                  </div>
                </div>
              </div>

              <div className="mt-2">
                <div className="inline-flex rounded-xl border border-slate-200 bg-slate-50 p-1">
                  <button
                    type="button"
                    onClick={() => setModeSafe("operacoes")}
                    className={[
                      "px-4 py-2 text-sm rounded-lg transition",
                      mode === "operacoes"
                        ? "bg-white shadow text-slate-900"
                        : "text-slate-600 hover:text-slate-800",
                    ].join(" ")}
                  >
                    {t("auth.mode.operacoes")}
                  </button>

                  <button
                    type="button"
                    onClick={() => setModeSafe("admin")}
                    className={[
                      "px-4 py-2 text-sm rounded-lg transition",
                      mode === "admin"
                        ? "bg-white shadow text-slate-900"
                        : "text-slate-600 hover:text-slate-800",
                    ].join(" ")}
                  >
                    {t("auth.mode.admin")}
                  </button>
                </div>

                {mode === "admin" ? (
                  <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
                    {t("auth.mode.adminNotice")}
                  </div>
                ) : null}
              </div>

              {/* ✅ Error robusto */}
              {visibleError ? (
                <div className="mt-6 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                  {visibleError}
                </div>
              ) : null}

              <form onSubmit={handleSubmit} className="mt-6 space-y-5">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    {t("auth.email")}
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
                      <Mail className="h-5 w-5" />
                    </span>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => {
                        const nextEmail = e.target.value;
                        setEmail(nextEmail);
                        clearAllErrors();
                        if (rememberMe) applyRememberPreference(true, nextEmail);
                      }}
                      placeholder={t("auth.emailPlaceholder")}
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

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    {t("auth.password")}
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
                      <Lock className="h-5 w-5" />
                    </span>

                    <input
                      type={showPwd ? "text" : "password"}
                      value={password}
                      onChange={(e) => {
                        setPassword(e.target.value);
                        clearAllErrors();
                      }}
                      placeholder={t("auth.passwordPlaceholder")}
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
                      aria-label={showPwd ? t("auth.passwordHide") : t("auth.passwordShow")}
                    >
                      {showPwd ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                    </button>
                  </div>

                  <div className="mt-3 flex items-center justify-between">
                    {/* ✅ lembrar-me funcional */}
                    <label className="inline-flex items-center gap-2 text-xs text-slate-500">
                      <input
                        type="checkbox"
                        className="rounded border-slate-300"
                        checked={rememberMe}
                        onChange={(e) => {
                          const next = e.target.checked;
                          setRememberMe(next);
                          applyRememberPreference(next, email);
                        }}
                      />
                      {t("auth.remember")}
                    </label>

                    {mode === "operacoes" ? (
                      <button
                        type="button"
                        className="text-xs font-medium hover:underline"
                        style={{ color: brand.blue }}
                        onClick={() => setSupportOpen(true)}
                      >
                        {t("auth.forgot")}
                      </button>
                    ) : (
                      <span className="text-xs text-slate-400 select-none"> </span>
                    )}
                  </div>
                </div>

                <div className="pt-1">
                  <Button type="submit" fullWidth loading={submitting} disabled={submitting}>
                    {t("auth.login")}
                  </Button>

                  <div className="mt-4 text-center text-xs text-slate-500">
                    {t("auth.footer")}
                  </div>
                </div>
              </form>
            </div>
          </div>
        </div>
      </div>

      {/* ✅ Modal de Apoio (Esqueceu a palavra-passe) */}
      <SupportModal
        open={supportOpen && mode === "operacoes"}
        onClose={() => setSupportOpen(false)}
        brandBlue={brand.blue}
        phoneDisplay="+351 936 178 415"
        phoneE164="+351936178415"
      />
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

function SupportModal({
  open,
  onClose,
  brandBlue,
  phoneDisplay,
  phoneE164,
}: {
  open: boolean;
  onClose: () => void;
  brandBlue: string;
  phoneDisplay: string;
  phoneE164: string;
}) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const t = window.setTimeout(() => {
      panelRef.current?.focus();
    }, 0);

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);

    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      window.clearTimeout(t);
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;

  const waLink = `https://wa.me/${phoneE164.replace(/\D/g, "")}`;
  const telLink = `tel:${phoneE164}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm"
        aria-label="Fechar"
        onClick={onClose}
      />

      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label="Apoio"
        className="relative w-full max-w-md overflow-hidden rounded-2xl border border-white/10 bg-white shadow-2xl outline-none"
      >
        <div
          className="h-1 w-full"
          style={{
            background: `linear-gradient(90deg, ${brandBlue} 0%, ${brandBlue} 65%, #F5A623 100%)`,
          }}
        />

        <div className="p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-semibold text-slate-900">
                Precisa de ajuda para recuperar o acesso?
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Fale com o suporte e informaremos o procedimento correto.
              </p>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
              aria-label="Fechar modal"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-xs text-slate-600">Contacto de apoio</p>
            <p className="mt-1 text-base font-bold text-slate-900">{phoneDisplay}</p>

            <div className="mt-4 grid grid-cols-2 gap-3">
              <a
                href={telLink}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50"
              >
                <Phone className="h-4 w-4" />
                Ligar
              </a>

              <a
                href={waLink}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm font-medium text-white"
                style={{ backgroundColor: brandBlue }}
              >
                <MessageCircle className="h-4 w-4" />
                WhatsApp
              </a>
            </div>

            <p className="mt-3 text-[11px] text-slate-500">
              Se preferir, copie o número e contacte pelo canal que usa no dia a dia.
            </p>
          </div>

          <div className="mt-5 flex justify-end">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Fechar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function CornerLanguageSelector() {
  const { language, setLanguage, t } = useLanguage();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const items: Array<{ value: Language; label: string; pill: string }> = useMemo(
    () => [
      { value: "pt", label: t("language.pt"), pill: "PT  PT" },
      { value: "pt-BR", label: t("language.pt-BR"), pill: "PT  BR" },
      { value: "en", label: t("language.en"), pill: "EN  US" },
      { value: "es", label: t("language.es"), pill: "ES  ES" },
      { value: "fr", label: t("language.fr"), pill: "FR  FR" },
      { value: "hi", label: t("language.hi"), pill: "HI  IN" },
      { value: "ar", label: t("language.ar"), pill: "AR  SA" },
    ],
    [t]
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
            {t("language.menuTitle")}
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
