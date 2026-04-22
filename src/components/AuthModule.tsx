import { useState } from "react";
import { Lock, User, ArrowRight, Eye, EyeOff, Phone } from "lucide-react";

interface AuthModuleProps {
  onLogin: (user: any) => void;
}

export default function AuthModule({ onLogin }: AuthModuleProps) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [showPassword, setShowPassword] = useState(false);
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const endpoint = mode === "login" ? "/api/auth/login" : "/api/auth/register";
    const body = mode === "login" 
      ? { identifier, password } 
      : { name, whatsapp: identifier, password };

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Ocorreu um erro inesperado.");
      }

      onLogin(data);
    } catch (err: any) {
      alert(err.message);
    }
  };

  return (
    <div className="flex flex-col min-h-screen bg-[var(--color-bg)] px-6 py-12">
      {/* Logo / Brand */}
      <div className="flex flex-col items-center mb-12">
        <div className="w-16 h-16 bg-[var(--color-primary)] rounded-2xl flex items-center justify-center mb-4 shadow-lg shadow-black/10">
          <span className="text-white text-3xl font-[800]">M</span>
        </div>
        <h1 className="text-[24px] font-[800] tracking-tight text-[var(--color-primary)]">Moneed</h1>
        <p className="text-[14px] text-[var(--color-text-muted)]">Sua gestão financeira inteligente</p>
      </div>

      {/* Card */}
      <div className="bg-[var(--color-card)] rounded-[24px] p-8 shadow-sm border border-[var(--color-border)]">
        <div className="mb-8 text-center">
          <h2 className="text-[20px] font-[700] text-[var(--color-text-main)] mb-1">
            {mode === "login" ? "Bem-vindo de volta" : "Criar uma conta"}
          </h2>
          <p className="text-[13px] text-[var(--color-text-muted)]">
            {mode === "login" 
              ? "Entre com seus dados para acessar sua conta" 
              : "Comece sua jornada financeira hoje mesmo"}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          {mode === "register" && (
            <div className="space-y-1.5">
              <label className="text-[12px] font-[600] text-[var(--color-text-muted)] ml-1 uppercase tracking-wider">
                Nome Completo
              </label>
              <div className="relative flex items-center text-[var(--color-text-muted)] focus-within:text-[var(--color-primary)] transition-colors">
                <User size={18} className="absolute left-4" />
                <input
                  type="text"
                  required
                  placeholder="Seu nome"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-[14px] py-3.5 pl-12 pr-4 text-[14px] outline-none focus:border-[var(--color-primary)] transition-all"
                />
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <label className="text-[12px] font-[600] text-[var(--color-text-muted)] ml-1 uppercase tracking-wider">
              WhatsApp
            </label>
            <div className="relative flex items-center text-[var(--color-text-muted)] focus-within:text-[var(--color-primary)] transition-colors">
              <Phone size={18} className="absolute left-4" />
              <input
                type="tel"
                required
                placeholder="(00) 0 0000-0000"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-[14px] py-3.5 pl-12 pr-4 text-[14px] outline-none focus:border-[var(--color-primary)] transition-all"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="flex justify-between items-center px-1">
              <label className="text-[12px] font-[600] text-[var(--color-text-muted)] uppercase tracking-wider">
                Senha
              </label>
              {mode === "login" && (
                <button type="button" className="text-[11px] font-[600] text-[var(--color-primary)] hover:underline">
                  Esqueci minha senha
                </button>
              )}
            </div>
            <div className="relative flex items-center text-[var(--color-text-muted)] focus-within:text-[var(--color-primary)] transition-colors">
              <Lock size={18} className="absolute left-4" />
              <input
                type={showPassword ? "text" : "password"}
                required
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-[14px] py-3.5 pl-12 pr-12 text-[14px] outline-none focus:border-[var(--color-primary)] transition-all"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-4 hover:text-[var(--color-primary)] transition-colors"
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            className="w-full bg-[var(--color-primary)] text-white rounded-[16px] py-4 font-[700] text-[15px] flex items-center justify-center gap-2 hover:opacity-90 active:scale-[0.98] transition-all shadow-md mt-4"
          >
            {mode === "login" ? "Entrar" : "Criar Conta"}
            <ArrowRight size={18} />
          </button>
        </form>

        <div className="mt-8 text-center pt-6 border-t border-[var(--color-border)]">
          <p className="text-[13px] text-[var(--color-text-muted)]">
            {mode === "login" ? "Não tem uma conta?" : "Já possui uma conta?"}
            <button
              onClick={() => setMode(mode === "login" ? "register" : "login")}
              className="ml-1.5 font-[700] text-[var(--color-primary)] hover:underline"
            >
              {mode === "login" ? "Registre-se agora" : "Fazer login"}
            </button>
          </p>
        </div>
      </div>

      {/* Footer */}
      <div className="mt-auto text-center pt-8">
        <p className="text-[11px] text-[var(--color-text-muted)] uppercase tracking-widest font-[600]">
          © 2026 Moneed — Organização Financeira
        </p>
      </div>
    </div>
  );
}
