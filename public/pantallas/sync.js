/* Vital D · Pantallas laterales sincronizadas
   Firebase Realtime Database (mismo proyecto que El Partido de la Evidencia), nodo propio: vitald_pantallas/<sede>
   Estado: { estado: "espera" | "corriendo", inicio: <ms servidor>, cmd: <n> }
   Cada pantalla calcula su posición con el reloj del servidor: pos = ((ahora - inicio) / 1000) mod duración
*/
const firebaseConfig = {
  apiKey: "AIzaSyBdeQdDUVm3ASzv_sLgxY206ori29RrXTQ",
  authDomain: "partido-evidencia.firebaseapp.com",
  databaseURL: "https://partido-evidencia-default-rtdb.firebaseio.com",
  projectId: "partido-evidencia",
  storageBucket: "partido-evidencia.firebasestorage.app",
  messagingSenderId: "974969773341",
  appId: "1:974969773341:web:a8cb9992006600cf2e55f4"
};

const PANTALLAS = {
  mental:     { nombre: "Salud mental",     video: "media/mental.mp4",     poster: "media/mental.jpg" },
  metabolica: { nombre: "Salud metabólica", video: "media/metabolica.mp4", poster: "media/metabolica.jpg" }
};
const SEDES = { acapulco: "Acapulco", queretaro: "Querétaro" };
const ARRANQUE_MS = 3000;   // margen entre "Iniciar" y el primer cuadro, para que ambas reciban la orden

firebase.initializeApp(firebaseConfig);
const db = firebase.database();

let SERVER_OFFSET = 0;
db.ref(".info/serverTimeOffset").on("value", s => { SERVER_OFFSET = s.val() || 0; });
function serverNow() { return Date.now() + SERVER_OFFSET; }

function param(k, def) { return new URLSearchParams(location.search).get(k) || def; }
function sedeActual() { const s = (param("sede", "acapulco") || "").toLowerCase(); return SEDES[s] ? s : "acapulco"; }
function refSede(sede) { return db.ref("vitald_pantallas/" + sede); }

function fmtDur(ms) {
  ms = Math.max(0, ms); const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60;
  return (h ? h + " h " : "") + String(m).padStart(h ? 2 : 1, "0") + " min " + String(x).padStart(2, "0") + " s";
}
