// ─────────────────────────────────────────────────────────────
// VITAL D EXPRESS · Configuración por sede
// Todo lo que el equipo puede necesitar cambiar vive aquí.
// Adi (la anfitriona de voz), el boleto, el correo y el mapa
// leen estos datos. Cambie un dato aquí y cambia en todos lados.
// ─────────────────────────────────────────────────────────────

export type SedeId = 'acapulco' | 'queretaro';

export interface BloqueAgenda {
  hora: string;      // "8:00"
  titulo: string;    // "Recepción y registro"
  quien?: string;    // ponente o responsable del bloque
}

export interface Ponente {
  nombre: string;          // "Dra. Nombre Apellido"
  especialidad?: string;   // "Psiquiatría"; vacío si no se conoce
  tema?: string;           // título de la plática, si se conoce
}

export interface Sede {
  id: SedeId;
  ciudad: string;
  prefijoId: string;       // prefijo del código de boleto: VDA-XXXXXX
  fechaISO: string;        // fecha del evento (AAAA-MM-DD), hora local de México
  fechaTexto: string;      // como se muestra y se dice
  hora: string;            // hora de cita
  horaFin: string;         // hora aproximada de término
  hotel: string;
  direccion: string;
  mapaQuery: string;       // texto para Google Maps
  cupo: number;            // tope real: el registro se cierra aquí (lo aplica el Apps Script)
  cupoPublico: number;     // lo que se muestra y se comunica a médicos y representantes
  lineas: string[];        // líneas terapéuticas del Salón 2; vacío = por anunciar
  ponentes: Ponente[];     // vacío = Adi no menciona nombres
  estacionamiento: string | null; // null = por confirmar (Adi lo dice así)
  agenda: BloqueAgenda[];
  formato: string;         // cómo se mueve el grupo entre salones (Adi lo explica)
}

// Agenda base de la propuesta de espacios (horarios aproximados, 2 oct 2026).
// Se usa mientras Adium no comparta la agenda final de la sede.
const AGENDA_BASE: BloqueAgenda[] = [
  { hora: '8:00', titulo: 'Recepción y registro' },
  { hora: '8:30', titulo: 'Bienvenida y primera plática durante el desayuno' },
  { hora: '9:30', titulo: 'Plática por línea terapéutica en el Salón 2' },
  { hora: '10:30', titulo: 'Panel de expertos, preguntas y coffee break' },
];
const FORMATO_BASE =
  'Son dos salones: en el Salón 1 es el desayuno, la primera plática y el cierre con panel, preguntas y coffee break. En el Salón 2 es la plática por línea terapéutica; el equipo los acompaña en el traslado.';

// Agenda final de Acapulco compartida por Adium (14 oct 2026).
const AGENDA_ACAPULCO: BloqueAgenda[] = [
  { hora: '8:00', titulo: 'Registro' },
  { hora: '8:30', titulo: 'Bienvenida general', quien: 'Staff Adium' },
  { hora: '8:35', titulo: 'Desayuno plenaria: Mitos y realidades de una hormona vital', quien: 'Wendy Calderón, nutrióloga clínica' },
  { hora: '8:55', titulo: 'Preguntas y respuestas' },
  { hora: '9:10', titulo: 'Cambio de salones' },
  { hora: '9:30', titulo: 'Breakout 1: ¿Y si no es solo psiquiátrico?', quien: 'Dr. Luis Díaz, psiquiatra' },
  { hora: '10:10', titulo: 'Breakout 2: El punto de quiebre metabólico', quien: 'Dr. Manuel Mirassou, internista' },
  { hora: '10:50', titulo: 'Coffee break y cambio de salones' },
  { hora: '11:00', titulo: 'Conclusiones', quien: 'Todos los ponentes' },
  { hora: '11:20', titulo: 'Mensaje final y cierre', quien: 'Staff Adium' },
];

// Agenda final de Querétaro compartida por Adium (14 oct 2026).
const AGENDA_QUERETARO: BloqueAgenda[] = [
  { hora: '8:00', titulo: 'Registro' },
  { hora: '8:30', titulo: 'Bienvenida general', quien: 'Medical Adium' },
  { hora: '8:35', titulo: 'Desayuno plenaria: Mitos y realidades de una hormona vital', quien: 'Wendy Calderón, nutrióloga clínica' },
  { hora: '8:55', titulo: 'Preguntas y respuestas' },
  { hora: '9:10', titulo: 'Cambio de salones' },
  { hora: '9:30', titulo: 'Breakout 1: El punto de quiebre metabólico', quien: 'Dr. Jorge Yamamoto, endocrinólogo' },
  { hora: '10:10', titulo: 'Breakout 2: El rol silencioso de una hormona vital en oncología', quien: 'Dr. Daniel García, oncólogo' },
  { hora: '10:50', titulo: 'Coffee break y cambio de salones' },
  { hora: '11:00', titulo: 'Conclusiones', quien: 'Todos los ponentes' },
  { hora: '11:20', titulo: 'Mensaje final y cierre', quien: 'Medical Adium' },
];

export const SEDES: Record<SedeId, Sede> = {
  acapulco: {
    id: 'acapulco',
    ciudad: 'Acapulco',
    prefijoId: 'VDA',
    fechaISO: '2026-10-28',
    fechaTexto: 'Miércoles 28 de octubre de 2026',
    hora: '8:00 am',
    horaFin: '11:30 am',
    hotel: 'HS Hotsson Hotel Acapulco',
    direccion: 'Av. Costera Miguel Alemán 1803, Fracc. Magallanes, 39670 Acapulco, Gro.',
    mapaQuery: 'HS Hotsson Smart Hotel Acapulco, Costera Miguel Alemán 1803, Acapulco',
    cupo: 60,
    cupoPublico: 50,
    lineas: ['Salud mental', 'Salud metabólica'],
    ponentes: [
      { nombre: 'Wendy Calderón', especialidad: 'Nutrióloga clínica', tema: 'Mitos y realidades de una hormona vital (plenaria durante el desayuno)' },
      { nombre: 'Dr. Luis Díaz', especialidad: 'Psiquiatra', tema: '¿Y si no es solo psiquiátrico? (breakout 1)' },
      { nombre: 'Dr. Manuel Mirassou', especialidad: 'Internista', tema: 'El punto de quiebre metabólico (breakout 2)' },
    ],
    estacionamiento: null,
    agenda: AGENDA_ACAPULCO,
    formato:
      'La plenaria es durante el desayuno. Después hay dos breakouts de 40 minutos, uno de salud mental y otro metabólico; los grupos cambian de salón entre uno y otro, así que todos los médicos escuchan las dos pláticas. El equipo los guía en cada cambio. Al final todos regresan para las conclusiones con los tres ponentes y el cierre.',
  },
  queretaro: {
    id: 'queretaro',
    ciudad: 'Querétaro',
    prefijoId: 'VDQ',
    fechaISO: '2026-11-05',
    fechaTexto: 'Jueves 5 de noviembre de 2026',
    hora: '8:00 am',
    horaFin: '11:30 am',
    hotel: 'Grand Fiesta Americana Querétaro',
    direccion: 'Blvd. Bernardo Quintana Arrioja 4050, Álamos 3a Secc., 76160 Querétaro, Qro.',
    mapaQuery: 'Grand Fiesta Americana Querétaro, Bernardo Quintana 4050',
    cupo: 60,
    cupoPublico: 50,
    lineas: ['Salud metabólica', 'Oncología'],
    ponentes: [
      { nombre: 'Wendy Calderón', especialidad: 'Nutrióloga clínica', tema: 'Mitos y realidades de una hormona vital (plenaria durante el desayuno)' },
      { nombre: 'Dr. Jorge Yamamoto', especialidad: 'Endocrinólogo', tema: 'El punto de quiebre metabólico (breakout 1)' },
      { nombre: 'Dr. Daniel García', especialidad: 'Oncólogo', tema: 'El rol silencioso de una hormona vital en oncología (breakout 2)' },
    ],
    estacionamiento: null,
    agenda: AGENDA_QUERETARO,
    formato:
      'La plenaria es durante el desayuno. Después hay dos breakouts de 40 minutos, uno metabólico y otro de oncología; los grupos cambian de salón entre uno y otro, así que todos los médicos escuchan las dos pláticas. El equipo los guía en cada cambio. Al final todos regresan para las conclusiones con los tres ponentes y el cierre.',
  },
};

// URL del Apps Script publicado (termina en /exec). Ver apps-script/INSTRUCCIONES.md
export const BACKEND_URL = 'https://script.google.com/macros/s/AKfycbwr0coRLteaiR0XK4sI_PfuCZaTVrR_8ss3cbSuF9IhHIc2raTvhbiveR0sjNxf_z0c/exec';

export const EVENTO = {
  nombre: 'Vital D',
  marca: 'Adium · Salud de la Mujer',
  concepto: 'La hormona de la luz, contada en tres tiempos',
  anfitriona: 'Adi',
};

export const getSede = (id?: string | null): Sede | null => {
  if (!id) return null;
  const key = id.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '') as SedeId;
  return SEDES[key] ?? null;
};

// El evento ya pasó si hoy (hora de CDMX) es posterior a la fecha del evento.
export const eventoTerminado = (sede: Sede): boolean => {
  const hoy = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Mexico_City' }).format(new Date());
  return hoy > sede.fechaISO;
};
