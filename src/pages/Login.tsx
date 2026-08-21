import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Activity, Mail, Lock, AlertCircle, Eye, EyeOff } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';

export function Login() {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const { error } = await signIn(email.trim(), password);
    setLoading(false);
    if (error) {
      setError('Credenciales inválidas. Verifica tu correo y contraseña.');
    } else {
      navigate('/dashboard');
    }
  }

  return (
    <div className="min-h-screen flex bg-rich-black">
      {/* Left panel — branding */}
      <div className="hidden lg:flex lg:w-1/2 flex-col justify-between p-12 bg-gradient-to-br from-dark-green via-rich-black to-rich-black relative overflow-hidden">
        <div className="absolute top-20 right-20 w-72 h-72 bg-caribbean-green/10 rounded-full blur-3xl" />
        <div className="absolute bottom-20 left-10 w-96 h-96 bg-bangladesh-green/15 rounded-full blur-3xl" />

        <div className="relative flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-caribbean-green/15 flex items-center justify-center">
            <Activity className="w-6 h-6 text-caribbean-green" strokeWidth={2.5} />
          </div>
          <span className="text-2xl font-bold text-anti-flash-white tracking-tight">Pulsesoft</span>
        </div>

        <div className="relative space-y-6">
          <h1 className="text-4xl font-bold text-anti-flash-white leading-tight max-w-md">
            Gestión de proyectos para tu PMO
          </h1>
          <p className="text-lg text-pistachio max-w-md leading-relaxed">
            Reemplaza el Excel manual. Controla proyectos, tareas, tiempos y costos en un solo lugar.
          </p>
          <div className="flex items-center gap-6 pt-4">
            <div>
              <p className="text-3xl font-bold text-caribbean-green">100%</p>
              <p className="text-sm text-pistachio">Visibilidad</p>
            </div>
            <div className="w-px h-12 bg-pistachio/20" />
            <div>
              <p className="text-3xl font-bold text-caribbean-green">Tiempo</p>
              <p className="text-sm text-pistachio">Real</p>
            </div>
            <div className="w-px h-12 bg-pistachio/20" />
            <div>
              <p className="text-3xl font-bold text-caribbean-green">ROI</p>
              <p className="text-sm text-pistachio">Medible</p>
            </div>
          </div>
        </div>

        <p className="relative text-sm text-stone">© 2026 Pulsesoft. Herramienta interna.</p>
      </div>

      {/* Right panel — form */}
      <div className="flex-1 flex items-center justify-center p-6 sm:p-12">
        <div className="w-full max-w-sm space-y-8">
          {/* Mobile logo */}
          <div className="lg:hidden flex items-center gap-3 justify-center mb-4">
            <div className="w-11 h-11 rounded-2xl bg-caribbean-green/15 flex items-center justify-center">
              <Activity className="w-6 h-6 text-caribbean-green" strokeWidth={2.5} />
            </div>
            <span className="text-2xl font-bold text-anti-flash-white tracking-tight">Pulsesoft</span>
          </div>

          <div>
            <h2 className="text-2xl font-bold text-anti-flash-white">Iniciar sesión</h2>
            <p className="text-sm text-pistachio mt-1">Accede a tu cuenta de Pulsesoft</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-anti-flash-white">Correo electrónico</label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-stone" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="nombre@empresa.com"
                  className="w-full bg-dark-green border border-pine rounded-xl pl-10 pr-4 py-3 text-anti-flash-white placeholder:text-stone/60 focus:outline-none focus:border-caribbean-green focus:ring-2 focus:ring-caribbean-green/20 transition-all"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-anti-flash-white">Contraseña</label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-stone" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full bg-dark-green border border-pine rounded-xl pl-10 pr-10 py-3 text-anti-flash-white placeholder:text-stone/60 focus:outline-none focus:border-caribbean-green focus:ring-2 focus:ring-caribbean-green/20 transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-stone hover:text-anti-flash-white transition-colors"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {error && (
              <div className="flex items-center gap-2 text-sm text-danger bg-danger/10 border border-danger/20 rounded-xl px-4 py-3 animate-fade-in">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-caribbean-green hover:bg-caribbean-green/90 disabled:opacity-60 text-rich-black font-semibold rounded-xl py-3 transition-all hover:shadow-lg hover:shadow-caribbean-green/30 disabled:cursor-not-allowed"
            >
              {loading ? 'Iniciando sesión…' : 'Iniciar sesión'}
            </button>

            <div className="text-center">
              <a href="#" className="text-sm text-pistachio hover:text-caribbean-green transition-colors">
                ¿Olvidaste tu contraseña?
              </a>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
