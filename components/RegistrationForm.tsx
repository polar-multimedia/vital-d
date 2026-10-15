import React, { useState } from 'react';
import { ArrowRight, Loader2 } from 'lucide-react';
import type { Sede } from '../config/sedes';

interface Props {
  sede: Sede;
  closed: boolean;
  closedReason: 'full' | 'past';
  onRegister: (data: { nombre: string; correo: string; especialidad: string }) => Promise<void>;
  onLookup: (correo: string) => Promise<void>;
}

const RegistrationForm: React.FC<Props> = ({ sede, closed, closedReason, onRegister, onLookup }) => {
  const [view, setView] = useState<'register' | 'lookup'>(closed ? 'lookup' : 'register');
  const [nombre, setNombre] = useState('');
  const [correo, setCorreo] = useState('');
  const [especialidad, setEspecialidad] = useState('');
  const [loading, setLoading] = useState(false);

  const submitRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (closed || loading) return;
    setLoading(true);
    try {
      await onRegister({ nombre: nombre.trim(), correo: correo.trim(), especialidad: especialidad.trim() });
    } finally {
      setLoading(false);
    }
  };

  const submitLookup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    setLoading(true);
    try {
      await onLookup(correo.trim());
    } finally {
      setLoading(false);
    }
  };

  const tab = (id: 'register' | 'lookup', label: string) => (
    <button
      type="button"
      onClick={() => setView(id)}
      aria-pressed={view === id}
      className={`flex-1 py-2.5 text-[13px] font-extrabold rounded-[10px] transition ${
        view === id ? 'bg-white text-ink shadow-sm' : 'text-muted hover:text-ink'
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="w-full max-w-md mx-auto lg:mx-0">
      <div className="flex p-1 bg-cream border border-line rounded-xl mb-4">
        {tab('register', 'Registro')}
        {tab('lookup', 'Ya tengo boleto')}
      </div>

      <div className="card rounded-2xl p-6 sm:p-7 relative overflow-hidden">
        <div className="spectrum-bar absolute top-0 inset-x-0 h-1" />

        {view === 'register' && closed && (
          <div className="text-center py-4">
            <h2 className="text-xl font-extrabold">{closedReason === 'past' ? 'Este evento ya se realizó' : 'Cupo completo'}</h2>
            <p className="text-muted font-semibold mt-2">
              {closedReason === 'past'
                ? `Gracias por su interés en ${sede.ciudad}.`
                : `Los ${sede.cupo} lugares de ${sede.ciudad} ya están asignados. Si ya se registró, consulte su boleto.`}
            </p>
            <button type="button" onClick={() => setView('lookup')} className="mt-5 text-plum font-extrabold text-sm hover:underline">
              Consultar mi boleto
            </button>
          </div>
        )}

        {view === 'register' && !closed && (
          <form onSubmit={submitRegister} className="space-y-4">
            <div>
              <h2 className="text-xl font-extrabold">Confirmar asistencia</h2>
              <p className="text-muted font-semibold text-sm mt-1">Recibirá su boleto con código QR por correo.</p>
            </div>
            <label className="block">
              <span className="block text-xs font-extrabold uppercase tracking-wider text-muted mb-1.5">Nombre completo</span>
              <input className="field" value={nombre} onChange={(e) => setNombre(e.target.value)}
                placeholder="Dra. Nombre Apellido" autoComplete="name" required minLength={3} disabled={loading} />
            </label>
            <label className="block">
              <span className="block text-xs font-extrabold uppercase tracking-wider text-muted mb-1.5">Correo electrónico</span>
              <input className="field" type="email" value={correo} onChange={(e) => setCorreo(e.target.value)}
                placeholder="correo@ejemplo.com" autoComplete="email" inputMode="email" required disabled={loading} />
            </label>
            <label className="block">
              <span className="block text-xs font-extrabold uppercase tracking-wider text-muted mb-1.5">Especialidad <span className="normal-case tracking-normal font-semibold">(opcional)</span></span>
              <input className="field" value={especialidad} onChange={(e) => setEspecialidad(e.target.value)}
                placeholder="Ginecología, medicina general…" disabled={loading} />
            </label>
            <button type="submit" disabled={loading} className="btn-primary w-full py-4 flex items-center justify-center gap-2">
              {loading ? <><Loader2 size={18} className="animate-spin" /> Generando su boleto…</> : <>Confirmar asistencia <ArrowRight size={18} /></>}
            </button>
            <p className="text-[12px] font-semibold text-muted text-center">Registro personal e intransferible.</p>
          </form>
        )}

        {view === 'lookup' && (
          <form onSubmit={submitLookup} className="space-y-4">
            <div>
              <h2 className="text-xl font-extrabold">Consultar mi boleto</h2>
              <p className="text-muted font-semibold text-sm mt-1">Escriba el correo con el que se registró para {sede.ciudad}.</p>
            </div>
            <label className="block">
              <span className="block text-xs font-extrabold uppercase tracking-wider text-muted mb-1.5">Correo electrónico</span>
              <input className="field" type="email" value={correo} onChange={(e) => setCorreo(e.target.value)}
                placeholder="correo@ejemplo.com" autoComplete="email" inputMode="email" required disabled={loading} />
            </label>
            <button type="submit" disabled={loading} className="btn-primary w-full py-4 flex items-center justify-center gap-2">
              {loading ? <><Loader2 size={18} className="animate-spin" /> Buscando…</> : <>Ver mi boleto <ArrowRight size={18} /></>}
            </button>
          </form>
        )}
      </div>
    </div>
  );
};

export default RegistrationForm;
