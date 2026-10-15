# Vital D · Registro, boleto QR y Adi

App de registro de Vital D (Adium · Salud de la Mujer), con una dirección para cada evento:

| Evento | Fecha | Sede | Dirección |
|---|---|---|---|
| Acapulco | Miércoles 28 de octubre, 8:00 am | HS Hotsson Hotel Acapulco | https://polar-multimedia.github.io/vital-d/acapulco/ |
| Querétaro | Jueves 5 de noviembre, 8:00 am | Grand Fiesta Americana Querétaro | https://polar-multimedia.github.io/vital-d/queretaro/ |
| Staff en puerta | — | — | https://polar-multimedia.github.io/vital-d/staff/ |

## Cómo está armada

- **La app** son archivos estáticos publicados en GitHub Pages desde la carpeta `docs/` de `main`. No guarda contraseñas ni claves.
- **El backend** es un Google Apps Script pegado a un Google Sheet (`apps-script/Code.gs`). Se encarga de:
  - Los registros, con una pestaña por sede.
  - El correo con el boleto, que sale desde la cuenta que implementa el script.
  - El acceso del staff al escáner.
  - Los tokens temporales de Gemini para la voz de Adi. La clave de Gemini se queda en el script.

## Lo que se edita

- **`config/sedes.ts`:** fechas, hoteles, agenda, ponentes, líneas, cupo y la URL del Apps Script (`BACKEND_URL`). Adi, el boleto, el correo y el mapa leen de aquí.
- **`apps-script/Code.gs`:** el backend. Después de cambiarlo, usa **Implementar › Administrar implementaciones › Editar › Versión nueva** para que la URL siga igual.

## Publicar un cambio

```
npm install
npm run build      # genera docs/ con /acapulco/, /queretaro/ y /staff/
git add -A && git commit -m "…" && git push
```

GitHub Pages tarda de 1 a 3 minutos en reflejar el cambio.

## Probar localmente

```
npm run dev        # http://localhost:3000/vital-d/acapulco/
```
