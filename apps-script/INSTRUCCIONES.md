# Backend en Google Sheets: instalación

1. **Sheet:** en la carpeta del proyecto Vital D, crea un Google Sheet llamado **Vital D · Registros**.
2. **Código:** abre **Extensiones › Apps Script**, borra lo que trae, pega todo `Code.gs` y guarda.
3. **Propiedades:** en **Configuración del proyecto** (engrane) › **Propiedades del script**, agrega:

   | Propiedad | Valor |
   |---|---|
   | `GEMINI_API_KEY` | la clave de Gemini de AI Studio |
   | `ADMIN_EMAIL` | el correo con el que el staff entra al escáner |
   | `ADMIN_PASSWORD` | la contraseña del staff para el escáner |
   | `SESSION_SECRET` | un texto largo inventado, por ejemplo `vitald-qz71-…` |

4. **Autorizar:** en el editor elige la función **`autorizar`** y dale **Ejecutar**. Acepta los permisos de hoja, correo y conexión externa.
5. **Implementar:** usa **Implementar › Nueva implementación › Aplicación web** con estas opciones:
   - Ejecutar como: **Yo**
   - Quién tiene acceso: **Cualquier usuario**
6. **Conectar la app:** copia la URL que termina en `/exec`, pégala en `BACKEND_URL` de `config/sedes.ts` y publica el cambio (`npm run build` y luego `git push`).

Los correos salen desde la cuenta que implementa el script. El límite es de 1,500 al día con Google Workspace, y cada sede necesita 50.
