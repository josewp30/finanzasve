# FinanzasVE — Notas de mantenimiento

Instrucciones rápidas para validar, formatear y auditar el proyecto.

1. Instalar dependencias de desarrollo (opcional para lint/format):

```bash
npm install
```

2. Formatear todo con Prettier:

```bash
npm run format
```

3. Ejecutar ESLint:

```bash
npm run lint
```

4. Probar PWA localmente (ejemplo con http-server):

```bash
npx http-server -c-1 . -p 5000
# luego abre http://localhost:5000
```

5. Ejecutar auditoría Lighthouse (requiere servidor local y Chrome instalado):

```bash
npm run audit
```

6. Configurar la clave de Supabase sin commitearla:
- Crea `config.json` en la raíz con: `{ "SB_KEY": "tu_anon_key" }`
- O inyecta mediante `window.__FVE_CONFIG__ = { SB_KEY: '...' }` en tu servidor.
- Nunca subas la clave al repositorio.

7. Offline page: `offline.html` está incluida para fallback del Service Worker.

Si quieres, puedo ejecutar las refactorizaciones restantes (retirar evals y crear listeners explícitos), o preparar un PR con los cambios listos.
