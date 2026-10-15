/**
 * VITAL D · Backend completo (Google Apps Script)
 *
 * La app vive en GitHub Pages (solo archivos estáticos). Todo lo que necesita
 * secretos vive aquí:
 *   - Registro y boletos: una pestaña por sede en este Google Sheet.
 *   - Correo del boleto: se envía desde la cuenta que implementa el script (MailApp).
 *   - Acceso del staff al escáner: correo + contraseña guardados en Propiedades.
 *   - Voz de Adi: entrega tokens temporales de Gemini Live; la clave nunca sale de aquí.
 *
 * Propiedades del script (Configuración del proyecto › Propiedades del script):
 *   GEMINI_API_KEY   clave de Gemini (AI Studio)
 *   ADMIN_EMAIL      correo del staff para el escáner
 *   ADMIN_PASSWORD   contraseña del staff para el escáner
 *   SESSION_SECRET   texto largo al azar (firma las sesiones del staff)
 *   GEMINI_API_VERSION  opcional, v1alpha por defecto
 */

var HEADERS = ['ID', 'Fecha de registro', 'Nombre', 'Correo', 'Especialidad', 'Check-in', 'Hora de check-in', 'Correo enviado'];
var COL = { id: 1, fecha: 2, nombre: 3, correo: 4, especialidad: 5, checkin: 6, horaCheckin: 7, enviado: 8 };
var TABS = { acapulco: 'Acapulco', queretaro: 'Querétaro' };
var PREFIJOS = { VDA: 'acapulco', VDQ: 'queretaro' };
var CUPO_MAX = 80; // tope de seguridad; el cupo real lo manda la app (50)
var TZ = 'America/Mexico_City';
var LOGO_URL = 'https://polar-multimedia.github.io/vital-d/vitald_logo_email.jpg';

function doPost(e) {
  var req;
  try { req = JSON.parse(e.postData.contents); } catch (err) { return json_({ success: false, message: 'Petición inválida' }); }
  try {
    switch (req.action) {
      // Públicas
      case 'count':      return json_(count_(req.sede));
      case 'register':   return json_(register_(req));
      case 'byEmail':    return json_(byEmail_(req.sede, req.correo));
      case 'byId':       return json_(byId_(req.id));
      case 'sendTicket': return json_(sendTicket_(req));
      case 'liveToken':  return json_(liveToken_(req.id));
      // Staff
      case 'login':      return json_(login_(req.email, req.password));
      case 'checkin':    return json_(requireStaff_(req.token) || checkin_(req.id));
      case 'stats':      return json_(requireStaff_(req.token) || stats_());
      default:           return json_({ success: false, message: 'Acción desconocida' });
    }
  } catch (err) {
    return json_({ success: false, message: 'Error del servidor: ' + err.message });
  }
}

function doGet() {
  return json_({ success: true, message: 'Vital D · backend activo' });
}

// ───────── Registro ─────────

function count_(sede) {
  return { success: true, count: rows_(sheet_(sede)).length };
}

function register_(req) {
  var nombre = clean_(req.nombre, 120);
  var correo = clean_(req.correo, 160).toLowerCase();
  var especialidad = clean_(req.especialidad, 120);
  var cupo = Math.min(Number(req.cupo) || 50, CUPO_MAX);
  var prefijo = prefijoDe_(req.sede);
  if (nombre.length < 3 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) return { success: false, message: 'Revise nombre y correo.' };
  if (!throttle_('reg', 120)) return { success: false, message: 'Demasiados registros en este momento. Intente en un minuto.' };

  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var sh = sheet_(req.sede);
    var rows = rows_(sh);
    for (var i = 0; i < rows.length; i++) {
      if (String(rows[i][COL.correo - 1]).toLowerCase() === correo) {
        return { success: true, existing: true, user: toUser_(rows[i], req.sede) };
      }
    }
    if (rows.length >= cupo) return { success: false, full: true, message: 'Lo sentimos, el cupo de esta sede está completo.' };

    var ids = {};
    var all = allIds_();
    for (var k = 0; k < all.length; k++) ids[all[k]] = true;
    var id;
    do { id = prefijo + '-' + randomCode_(6); } while (ids[id]);

    sh.appendRow([id, Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd HH:mm:ss'), nombre, correo, especialidad, '', '', '']);
    return { success: true, existing: false, user: { id: id, name: nombre, email: correo, specialty: especialidad, sede: req.sede, checkedIn: false } };
  } finally {
    lock.releaseLock();
  }
}

function byEmail_(sede, correo) {
  correo = clean_(correo, 160).toLowerCase();
  var rows = rows_(sheet_(sede));
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i][COL.correo - 1]).toLowerCase() === correo) return { success: true, user: toUser_(rows[i], sede) };
  }
  return { success: false, message: 'No encontramos un registro con ese correo en esta sede.' };
}

function byId_(id) {
  var f = find_(id);
  return f ? { success: true, user: toUser_(f.row, f.sede) } : { success: false, message: 'Código no encontrado' };
}

// ───────── Correo del boleto ─────────
// La app manda el QR ya dibujado (PNG) y los datos de la sede. El correo solo
// puede ir al correo registrado de ese boleto, nunca a otra dirección.

function sendTicket_(req) {
  var f = find_(req.id);
  if (!f) return { success: false, message: 'Código no encontrado' };
  if (!throttle_('mail', 60)) return { success: false, message: 'Demasiados envíos en este momento. Intente en un minuto.' };
  var lastSent = f.row[COL.enviado - 1];
  var lastMs = lastSent instanceof Date ? lastSent.getTime() : (lastSent ? new Date(String(lastSent).replace(' ', 'T') + '-06:00').getTime() : 0);
  if (req.resend && lastMs && (Date.now() - lastMs) < 60000) {
    return { success: false, message: 'Su boleto acaba de enviarse. Revise su correo (y la carpeta de spam).' };
  }

  var s = req.sedeInfo || {};
  var user = toUser_(f.row, f.sede);
  var png = Utilities.newBlob(Utilities.base64Decode(String(req.qrPng || '').replace(/^data:image\/png;base64,/, '')), 'image/png', user.id + '.png');
  var lineas = (s.lineas && s.lineas.length) ? s.lineas.join(' · ') : 'Se darán a conocer muy pronto';

  var html =
    '<div style="margin:0;padding:24px 12px;background:#F4EFE7;font-family:Arial,Helvetica,sans-serif;color:#221C33">' +
    '<div style="max-width:520px;margin:0 auto;background:#FFFFFF;border-radius:18px;overflow:hidden;border:1px solid #E6DED0">' +
    '<div style="height:6px;background:#E0531F;background:linear-gradient(90deg,#8E3BA8 0%,#E0531F 40%,#F2B705 70%,#2F9E6B 100%)"></div>' +
    '<div style="padding:28px 28px 8px;text-align:center">' +
    '<img src="' + LOGO_URL + '" alt="Vital D" width="120" style="display:block;margin:0 auto 12px;width:120px;height:auto">' +
    '<div style="font-size:12px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:#8E3BA8">Vital D · ' + esc_(s.ciudad) + '</div>' +
    '<div style="font-size:22px;font-weight:800;margin:10px 0 4px">' + esc_(user.name) + '</div>' +
    '<div style="font-size:14px;color:#5A5370">Su lugar está confirmado.</div></div>' +
    '<div style="padding:16px 28px;text-align:center">' +
    '<img src="cid:qrcode" alt="Código QR ' + user.id + '" width="200" height="200" style="display:block;margin:0 auto;width:200px;height:200px">' +
    '<div style="display:inline-block;margin-top:12px;padding:6px 14px;border-radius:999px;background:#F4EFE7;font-family:Consolas,Menlo,monospace;font-weight:700;letter-spacing:2px;font-size:15px">' + user.id + '</div></div>' +
    '<div style="padding:8px 28px 24px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:14px;line-height:1.5">' +
    row_('Fecha', '<b>' + esc_(s.fechaTexto) + '</b>') +
    row_('Cita', '<b>' + esc_(s.hora) + ' · registro y desayuno</b>') +
    row_('Sede', '<b>' + esc_(s.hotel) + '</b><br><span style="color:#5A5370">' + esc_(s.direccion) + '</span>') +
    row_('Líneas', esc_(lineas)) +
    '</table><p style="margin:16px 0 0;font-size:13px;color:#5A5370;line-height:1.5">Presente este código QR al llegar. El registro es personal e intransferible. Adjuntamos el evento para su calendario.</p></div>' +
    '<div style="padding:14px 28px;background:#FBF7F0;border-top:1px solid #E6DED0;font-size:12px;color:#5A5370;text-align:center">Adium · Salud de la Mujer</div>' +
    '</div></div>';

  var ics = Utilities.newBlob(ics_(s, user.id), 'text/calendar', 'VitalD-' + String(s.ciudad || '').replace(/\s+/g, '') + '.ics');
  MailApp.sendEmail({
    to: user.email,
    subject: 'Su boleto · Vital D ' + (s.ciudad || '') + ' · ' + String(s.fechaTexto || '').replace(/^\S+\s/, ''),
    htmlBody: html,
    name: 'Vital D',
    inlineImages: { qrcode: png },
    attachments: [ics]
  });
  sheet_(f.sede).getRange(f.rowIndex, COL.enviado).setValue(Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd HH:mm:ss'));
  return { success: true, message: 'Boleto enviado a ' + user.email };
}

function row_(k, v) {
  return '<tr><td style="padding:8px 0;color:#5A5370;width:96px;font-weight:600;vertical-align:top">' + k + '</td><td style="padding:8px 0">' + v + '</td></tr>';
}

function ics_(s, id) {
  var d = String(s.fechaISO || '').replace(/-/g, '');
  var toUtc = function (h) {
    var m = String(h || '8:00 am').match(/(\d{1,2}):(\d{2})\s*(am|pm)?/i);
    var hh = parseInt(m[1], 10) % 12;
    if ((m[3] || '').toLowerCase() === 'pm') hh += 12;
    return ('0' + (hh + 6)).slice(-2) + m[2] + '00Z'; // CDMX = UTC-6
  };
  var loc = (String(s.hotel || '') + ', ' + String(s.direccion || '')).replace(/,/g, '\\,');
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Polar Multimedia//Vital D//ES', 'METHOD:PUBLISH', 'BEGIN:VEVENT',
    'UID:' + id + '@vitald', 'DTSTAMP:' + Utilities.formatDate(new Date(), 'UTC', "yyyyMMdd'T'HHmmss'Z'"),
    'DTSTART:' + d + 'T' + toUtc(s.hora), 'DTEND:' + d + 'T' + toUtc(s.horaFin),
    'SUMMARY:Vital D · ' + (s.ciudad || ''), 'LOCATION:' + loc,
    'DESCRIPTION:Boleto ' + id + '. Presente su código QR al llegar.', 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
}

// ───────── Voz de Adi: token temporal de Gemini Live ─────────
// Solo se entrega a quien tiene un boleto válido. Sirve para abrir una sesión
// en los siguientes 2 minutos y caduca a los 30.

function liveToken_(id) {
  if (!find_(id)) return { success: false, message: 'Boleto no válido' };
  if (!throttle_('live', 90)) return { success: false, message: 'Adi está atendiendo a muchas personas. Intente en un minuto.' };
  var props = PropertiesService.getScriptProperties();
  var key = props.getProperty('GEMINI_API_KEY');
  if (!key) return { success: false, message: 'Falta configurar GEMINI_API_KEY' };
  var version = props.getProperty('GEMINI_API_VERSION') || 'v1alpha';
  var now = Date.now();
  var res = UrlFetchApp.fetch('https://generativelanguage.googleapis.com/' + version + '/auth_tokens', {
    method: 'post',
    contentType: 'application/json',
    headers: { 'x-goog-api-key': key },
    payload: JSON.stringify({
      uses: 1,
      expireTime: new Date(now + 30 * 60 * 1000).toISOString(),
      newSessionExpireTime: new Date(now + 2 * 60 * 1000).toISOString()
    }),
    muteHttpExceptions: true
  });
  var body = {};
  try { body = JSON.parse(res.getContentText()); } catch (e) {}
  if (res.getResponseCode() !== 200 || !body.name) {
    return { success: false, message: 'Gemini no entregó el token (' + res.getResponseCode() + ')', detail: String(res.getContentText()).slice(0, 300) };
  }
  return { success: true, token: body.name, apiVersion: version };
}

// ───────── Staff ─────────

function login_(email, password) {
  var props = PropertiesService.getScriptProperties();
  var okEmail = String(props.getProperty('ADMIN_EMAIL') || '').trim().toLowerCase();
  var okPass = String(props.getProperty('ADMIN_PASSWORD') || '');
  if (!okEmail || !okPass) return { success: false, message: 'Falta configurar ADMIN_EMAIL y ADMIN_PASSWORD' };
  if (!throttle_('login', 20)) return { success: false, message: 'Demasiados intentos. Espere un minuto.' };
  if (String(email || '').trim().toLowerCase() !== okEmail || String(password || '') !== okPass) {
    return { success: false, message: 'Credenciales incorrectas' };
  }
  var body = Utilities.base64EncodeWebSafe(JSON.stringify({ e: okEmail, exp: Date.now() + 16 * 3600 * 1000 }));
  return { success: true, token: body + '.' + sign_(body) };
}

function requireStaff_(token) {
  var parts = String(token || '').split('.');
  if (parts.length === 2 && parts[1] === sign_(parts[0])) {
    try {
      var data = JSON.parse(Utilities.newBlob(Utilities.base64DecodeWebSafe(parts[0])).getDataAsString());
      if (Date.now() < data.exp) return null; // válido: sigue la acción
    } catch (e) {}
  }
  return { success: false, expired: true, message: 'Sesión expirada. Ingrese de nuevo.' };
}

function sign_(text) {
  var secret = PropertiesService.getScriptProperties().getProperty('SESSION_SECRET') || 'vital-d-cambiar';
  return Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature(text, secret));
}

function checkin_(id) {
  id = clean_(id, 40).toUpperCase();
  try { var j = JSON.parse(id); if (j && j.ID) id = String(j.ID); } catch (e) {}
  if (!/^VD[AQ]-[A-Z0-9]{6}$/.test(id)) return { success: false, message: 'Este QR no es un boleto de Vital D' };
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var f = find_(id);
    if (!f) return { success: false, id: id, message: 'Código no registrado' };
    var nombre = f.row[COL.nombre - 1];
    var ciudad = TABS[f.sede];
    if (f.row[COL.checkin - 1] === 'SI') {
      return { success: false, alreadyCheckedIn: true, id: id, guestName: nombre, ciudad: ciudad,
               message: 'Este boleto ya se usó a las ' + hhmm_(f.row[COL.horaCheckin - 1]) };
    }
    sheet_(f.sede).getRange(f.rowIndex, COL.checkin, 1, 2).setValues([['SI', Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd HH:mm:ss')]]);
    return { success: true, id: id, guestName: nombre, ciudad: ciudad, message: 'Registro de entrada correcto' };
  } finally {
    lock.releaseLock();
  }
}

function stats_() {
  var out = {};
  for (var sede in TABS) {
    var rows = rows_(sheet_(sede));
    var n = 0;
    for (var i = 0; i < rows.length; i++) if (rows[i][COL.checkin - 1] === 'SI') n++;
    out[sede] = { registrados: rows.length, asistieron: n };
  }
  return { success: true, stats: out };
}

// ───────── Utilidades ─────────

function sheet_(sede) {
  var name = TABS[sede];
  if (!name) throw new Error('Sede no válida');
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.appendRow(HEADERS);
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, HEADERS.length).setFontWeight('bold');
  }
  return sh;
}

function rows_(sh) {
  var last = sh.getLastRow();
  return last < 2 ? [] : sh.getRange(2, 1, last - 1, HEADERS.length).getValues();
}

function allIds_() {
  var ids = [];
  for (var sede in TABS) {
    var rows = rows_(sheet_(sede));
    for (var i = 0; i < rows.length; i++) ids.push(String(rows[i][0]));
  }
  return ids;
}

function find_(id) {
  id = String(id || '').trim().toUpperCase();
  var sede = PREFIJOS[id.split('-')[0]];
  if (!sede) return null;
  var rows = rows_(sheet_(sede));
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i][0]).toUpperCase() === id) return { sede: sede, row: rows[i], rowIndex: i + 2 };
  }
  return null;
}

function prefijoDe_(sede) {
  for (var p in PREFIJOS) if (PREFIJOS[p] === sede) return p;
  throw new Error('Sede no válida');
}

function toUser_(row, sede) {
  return {
    id: String(row[COL.id - 1]),
    name: String(row[COL.nombre - 1]),
    email: String(row[COL.correo - 1]),
    specialty: String(row[COL.especialidad - 1] || ''),
    sede: sede,
    checkedIn: row[COL.checkin - 1] === 'SI'
  };
}

// Límite global por minuto para cada tipo de acción
function throttle_(kind, perMinute) {
  var cache = CacheService.getScriptCache();
  var k = 't_' + kind + '_' + Math.floor(Date.now() / 60000);
  var n = Number(cache.get(k) || 0);
  if (n >= perMinute) return false;
  cache.put(k, String(n + 1), 120);
  return true;
}

function randomCode_(n) {
  var chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  var s = '';
  for (var i = 0; i < n; i++) s += chars.charAt(Math.floor(Math.random() * chars.length));
  return s;
}

function clean_(v, max) { return String(v || '').trim().slice(0, max); }
function esc_(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function hhmm_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, TZ, 'HH:mm');
  var m = String(v).match(/(\d{2}:\d{2})/);
  return m ? m[1] : String(v);
}
function json_(obj) { return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON); }

// Ejecutar una vez desde el editor para autorizar correo, hoja y conexión a Gemini.
function autorizar() {
  sheet_('acapulco'); sheet_('queretaro');
  Logger.log('Cuota de correo restante hoy: ' + MailApp.getRemainingDailyQuota());
  UrlFetchApp.fetch('https://generativelanguage.googleapis.com/', { muteHttpExceptions: true });
}
