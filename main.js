
    // ═══════════════════════════════════════════════════════════
    //  SUPABASE — AUTH + DB
    // ═══════════════════════════════════════════════════════════
    const SB_URL = 'https://tdcpdjhwvpkrxgmnpftv.supabase.co';
    // ⚠️ IMPORTANTE: Reemplaza esto con tu anon key real de Supabase.
    // Encuéntrala en: supabase.com → tu proyecto → Settings → API → "anon public"
    // Debe empezar con "eyJ..." (es un JWT largo)
    const SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRkY3Bkamh3dnBrcnhnbW5wZnR2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMzNTUwMzEsImV4cCI6MjA4ODkzMTAzMX0.YqdHUV2O0ELXd1wJJTzTRvNUA06G6F2xlLJ33T9lMD8';
    const sb = supabase.createClient(SB_URL, SB_KEY, {
      auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true,
        flowType: 'pkce',
      }
    });

    let currentUser = null;

    // ── Auth helpers ──────────────────────────────────────────
    async function signUp(email, password) {
      const { data, error } = await sb.auth.signUp({ email, password });
      if (error) throw new Error(error.message);
      return data;
    }

    async function signIn(email, password) {
      const { data, error } = await sb.auth.signInWithPassword({ email, password });
      if (error) throw new Error(error.message);
      return data;
    }

    async function signInGoogle() {
      // Limpiar URL para el redirect
      const base = window.location.origin + window.location.pathname;

      const { error } = await sb.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: base,
          queryParams: {
            access_type: 'offline',
            prompt: 'consent',
          }
        }
      });
      if (error) throw new Error(error.message);
    }

    async function signOut() {
      localStorage.removeItem(LS_KEY);
      appInitialized = false;
      await sb.auth.signOut();
      currentUser = null;
      showAuthScreen();
    }

    let appInitialized = false;
    let isInitializing = false;

    async function initApp() {
      if (isInitializing) return;
      isInitializing = true;

      // 1. CARGA LOCAL INMEDIATA (Para velocidad total)
      try {
        const uid = currentUser?.id || 'anon';
        const LS_KEY_USER = 'fve4_' + uid;
        const d = localStorage.getItem(LS_KEY_USER) || localStorage.getItem(LS_KEY);

        if (d) {
          const parsed = JSON.parse(d);
          if (parsed) S = { ...S, ...parsed };
        }

        // Sanitizar y asegurar arrays
        ['gastos', 'gastosFijos', 'tasasHistoricas', 'salarios', 'deletedGastos', 'deletedFijos'].forEach(k => { if (!Array.isArray(S[k])) S[k] = []; });

        // Poblar Inputs para que liveCalc funcione
        const setV = (id, v) => { const e = document.getElementById(id); if (e) e.value = v || ''; };
        const hoy = new Date().toISOString().split('T')[0];
        setV('g-f', hoy); setV('inp-dt', hoy); setV('m-dt', hoy); setV('ht-fecha', hoy);
        setV('g-mes-filtro', hoy.slice(0, 7));

        if (S.bcv) setV('inp-bcv', S.bcv);
        if (S.salario) setV('inp-sal', S.salario);
        if (S.b1) setV('inp-b1', S.b1);
        if (S.b2) setV('inp-b2', S.b2);
        if (S.cusd) setV('inp-cu', S.cusd);

        // Render inicial ultra-rápido
        updateHdr();
        liveCalc();
        renderResumen();
        renderSemanal();
        renderGastos();
        renderGastosFijos();
        hideLoading(); // Quitar splash screen YA
      } catch (e) {
        console.error("Error fast load:", e);
        hideLoading();
      }

      // 2. SINCRONIZACIÓN EN SEGUNDO PLANO (Nube)
      setSyncState('loading', 'Sincronizando...');
      try {
        const [resTasas, resFijos, resCfg, resGastos, resSal] = await Promise.all([
          apiGet('getTasas').catch(e => { console.error('getTasas err:', e); return { status: 'err' }; }),
          apiGet('getGastosFijos').catch(e => { console.error('getGastosFijos err:', e); return { status: 'err' }; }),
          apiGet('getConfig').catch(e => { console.error('getConfig err:', e); return { status: 'err' }; }),
          apiGet('getGastos').catch(e => { console.error('getGastos err:', e); return { status: 'err' }; }),
          apiGet('getSalarios').catch(e => { console.error('getSalarios err:', e); return { status: 'err' }; })
        ]);
        console.log("=== DB SYNC RESULTS ===");
        console.log("Tasas:", resTasas);
        console.log("Fijos:", resFijos);
        console.log("Config:", resCfg);
        console.log("Gastos:", resGastos);
        console.log("Salarios:", resSal);
        console.log("CurrentUser ID:", currentUser?.id);
        console.log("=======================");

        if (resTasas.status === 'ok') S.tasasHistoricas = resTasas.data.sort((a, b) => b.fecha.localeCompare(a.fecha));
        if (resFijos.status === 'ok') {
          S.gastosFijos = resFijos.data;
        }
        if (resCfg.status === 'ok' && resCfg.data) {
          if (resCfg.data.bcv) S.bcv = parseFloat(resCfg.data.bcv);
          if (resCfg.data.bcvDate) S.bcvDate = resCfg.data.bcvDate;
        }
        if (resGastos.status === 'ok') {
          S.gastos = resGastos.data;
        }
        if (resSal.status === 'ok') {
          S.salarios = resSal.data.sort((a, b) => String(b.fecha || '').localeCompare(String(a.fecha || '')));

          const ultimo = S.salarios[0];
          if (ultimo) {
            S.salario = parseFloat(ultimo.salario_bs) || S.salario || 0;
            S.b1 = parseFloat(ultimo.bono1_bs) || S.b1 || 0;
            S.b2 = parseFloat(ultimo.bono2_bs) || S.b2 || 0;
            S.cusd = parseFloat(ultimo.cesta_usd) || S.cusd || 0;
            if (ultimo.tasa_dia && (!S.bcv || S.bcv === 0)) {
              S.bcv = parseFloat(ultimo.tasa_dia) || 0;
              S.bcvDate = ultimo.fecha || '';
            }
          }
        }

        // Tasa activa: la más reciente del historial tiene prioridad sobre todo
        if (S.tasasHistoricas.length > 0 && S.tasasHistoricas[0].tasa) {
          S.bcv = parseFloat(S.tasasHistoricas[0].tasa);
          S.bcvDate = S.tasasHistoricas[0].fecha;
        }

        // Repoblar inputs con valores reales de la nube
        const setVcloud = (id, v) => { const e = document.getElementById(id); if (e && v) e.value = v; };
        if (S.bcv) setVcloud('inp-bcv', S.bcv);
        if (S.bcvDate) setVcloud('inp-dt', S.bcvDate);
        if (S.salario) setVcloud('inp-sal', S.salario);
        if (S.b1) setVcloud('inp-b1', S.b1);
        if (S.b2) setVcloud('inp-b2', S.b2);
        if (S.cusd) setVcloud('inp-cu', S.cusd);

        // Guardar lo nuevo y refrescar UI sin bloquear al usuario
        lsSave();
        updateHdr();
        liveCalc();
        renderResumen();
        renderSemanal();
        renderAhorro();
        renderGastos();
        renderGastosFijos();
        setSyncState('ok');
      } catch (err) {
        setSyncState('err', 'Modo local');
      } finally {
        isInitializing = false;
      }
    }

    function onAuthStateChange() {
      sb.auth.onAuthStateChange(async (event, session) => {
        if (session && session.user) {
          currentUser = session.user;
          hideAuthScreen();

          // Mostrar info de usuario
          const name = currentUser.user_metadata?.full_name || currentUser.user_metadata?.name || '';
          const email = currentUser.email || '';
          const avatar = document.getElementById('user-avatar');
          if (avatar) avatar.textContent = name ? name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2) : email.slice(0, 2).toUpperCase();
          setEl('user-email-lbl', email);
          setEl('user-display-name', name || email.split('@')[0]);
          const userInfo = document.getElementById('user-info');
          if (userInfo) userInfo.style.display = 'flex';

          if (!appInitialized) {
            appInitialized = true;
            await initApp();
          }
        } else if (event === 'SIGNED_OUT' || (!session && event !== 'INITIAL_SESSION')) {
          currentUser = null;
          appInitialized = false;
          isInitializing = false;
          showAuthScreen();
        }
      });
    }

    // ── Auth UI ───────────────────────────────────────────────
    function showAuthScreen() {
      document.getElementById('auth-screen').style.display = 'flex';
      document.getElementById('main-app').style.display = 'none';
    }

    function hideAuthScreen() {
      document.getElementById('auth-screen').style.display = 'none';
      document.getElementById('main-app').style.display = 'flex';
    }

    async function handleSignIn() {
      const email = document.getElementById('auth-email').value.trim();
      const pass = document.getElementById('auth-pass').value;
      const btn = document.getElementById('auth-btn-email');
      const err = document.getElementById('auth-err');
      if (!email || !pass) { showAuthErr('Ingresa email y contraseña.'); return; }
      btn.disabled = true; btn.textContent = '⟳ Entrando...';
      try {
        await signIn(email, pass);
      } catch (e) {
        showAuthErr(e.message.includes('Invalid') ? 'Email o contraseña incorrectos.' : e.message);
        btn.disabled = false; btn.textContent = 'Entrar';
      }
    }

    async function handleSignUp() {
      const email = document.getElementById('auth-email').value.trim();
      const pass = document.getElementById('auth-pass').value;
      const btn = document.getElementById('auth-btn-register');
      if (!email || !pass) { showAuthErr('Ingresa email y contraseña.'); return; }
      if (pass.length < 6) { showAuthErr('La contraseña debe tener al menos 6 caracteres.'); return; }
      btn.disabled = true; btn.textContent = '⟳ Creando cuenta...';
      try {
        await signUp(email, pass);
        showAuthErr('✓ Cuenta creada. Revisa tu email para confirmar.', 'ok');
      } catch (e) {
        showAuthErr(e.message.includes('already') ? 'Este email ya tiene cuenta. Usa "Entrar".' : e.message);
      }
      btn.disabled = false; btn.textContent = 'Crear cuenta';
    }

    async function handleGoogleSignIn() {
      const btn = document.getElementById('auth-btn-google');
      const originalHtml = btn.innerHTML;

      btn.disabled = true;
      btn.textContent = '⟳ Conectando con Google...';

      // Timeout por si Google/Supabase no responden rápido
      const authTimeout = setTimeout(() => {
        btn.disabled = false;
        btn.innerHTML = originalHtml;
        showAuthErr("La conexión tardó demasiado. Intenta de nuevo.");
      }, 15000);

      try {
        await signInGoogle();
        // Si la redirección tiene éxito, el navegador cambiará de página y el timeout se limpiará solo
      } catch (e) {
        clearTimeout(authTimeout);
        showAuthErr(e.message);
        btn.disabled = false;
        btn.innerHTML = originalHtml;
      }
    }

    function showAuthErr(msg, type = 'error') {
      const el = document.getElementById('auth-err');
      el.style.cssText = type === 'ok'
        ? 'display:block;background:rgba(68,201,126,.1);border:1px solid rgba(68,201,126,.25);color:#44c97e;padding:.6rem .9rem;border-radius:8px;font-size:.8rem;margin-top:.7rem;'
        : 'display:block;background:rgba(224,92,92,.1);border:1px solid rgba(224,92,92,.25);color:#e05c5c;padding:.6rem .9rem;border-radius:8px;font-size:.8rem;margin-top:.7rem;';
      el.textContent = msg;
    }

    function toggleAuthMode() {
      const mode = document.getElementById('auth-mode').dataset.mode || 'login';
      const newMode = mode === 'login' ? 'register' : 'login';
      document.getElementById('auth-mode').dataset.mode = newMode;
      document.getElementById('auth-title').textContent = newMode === 'login' ? 'Iniciar sesión' : 'Crear cuenta';
      document.getElementById('auth-btn-email').textContent = newMode === 'login' ? 'Entrar' : '';
      document.getElementById('auth-btn-email').style.display = newMode === 'login' ? 'block' : 'none';
      document.getElementById('auth-btn-register').style.display = newMode === 'register' ? 'block' : 'none';
      document.getElementById('auth-toggle-lbl').textContent = newMode === 'login' ? '¿No tienes cuenta?' : '¿Ya tienes cuenta?';
      document.getElementById('auth-toggle-btn').textContent = newMode === 'login' ? 'Crear cuenta gratis' : 'Iniciar sesión';
      document.getElementById('auth-err').style.display = 'none';
    }

    // ═══════════════════════════════════════════════════════════
    //  STATE LOCAL (caché + fallback)
    // ═══════════════════════════════════════════════════════════
    let S = {
      bcv: 0, bcvDate: '',
      salario: 0, b1: 0, b2: 0, cusd: 0,
      gastos: [],         // caché del mes actual
      gastosFijos: [],    // caché
      tasasHistoricas: [], // caché
      salarios: [],       // caché historial
      tasaVista: 0,       // tasa seleccionada para vista histórica
    };
    let CH = {};
    const LS_KEY = 'fve4';

    const lsLoad = () => { try { const d = localStorage.getItem(LS_KEY); if (d) S = { ...S, ...JSON.parse(d) }; } catch { } };
    const lsSave = () => {
      const key = currentUser ? 'fve4_' + currentUser.id : LS_KEY;
      try { localStorage.setItem(key, JSON.stringify(S)); } catch { }
    };
    const lsSaveUser = lsSave;

    // ═══════════════════════════════════════════════════════════
    //  SUPABASE API LAYER — usa el cliente JS oficial (sin fetch manual)
    //  Esto garantiza que el JWT se inyecta siempre correctamente.
    // ═══════════════════════════════════════════════════════════
    function setSyncState(state, msg) {
      const dot = document.getElementById('sync-dot');
      const lbl = document.getElementById('sync-lbl');
      dot.className = 'sync-dot ' + (state === 'ok' ? 'ok' : state === 'err' ? 'err' : 'loading');
      if (lbl) lbl.textContent = msg || (state === 'ok' ? 'Sincronizado' : state === 'err' ? 'Sin conexión' : 'Sincronizando...');
    }

    // Helper para fetch con timeout (solo se usa para las APIs externas de BCV)
    async function fetchWithTimeout(resource, options = {}) {
      const { timeout = 15000 } = options;
      const controller = new AbortController();
      const id = setTimeout(() => controller.abort(), timeout);
      try {
        const response = await fetch(resource, { ...options, signal: controller.signal });
        clearTimeout(id);
        return response;
      } catch (e) {
        clearTimeout(id);
        throw e;
      }
    }

    // ── GET: usa sb.from() con el cliente oficial ──────────────
    async function apiGet(accion, params = {}) {
      const uid = currentUser?.id;
      if (!uid) return { status: 'err', data: [] };

      try {
        if (accion === 'getTasas') {
          const { data, error } = await sb.from('tasas_bcv')
            .select('*')
            .eq('user_id', uid)
            .order('fecha', { ascending: false });
          if (error) throw error;
          return { status: 'ok', data: data || [] };
        }

        if (accion === 'getSalarios') {
          const { data, error } = await sb.from('salarios')
            .select('*')
            .eq('user_id', uid)
            .order('fecha', { ascending: false });
          if (error) throw error;
          return { status: 'ok', data: data || [] };
        }

        if (accion === 'getGastosFijos') {
          const { data, error } = await sb.from('gastos_fijos')
            .select('*')
            .eq('user_id', uid)
            .eq('activo', true);
          if (error) throw error;
          return { status: 'ok', data: data || [] };
        }

        if (accion === 'getConfig') {
          const { data, error } = await sb.from('config')
            .select('*')
            .eq('user_id', uid);
          if (error) throw error;
          const cfg = {};
          (data || []).forEach(r => {
            // Las claves se guardan como "bcv_<uid>", extraemos solo el prefijo
            const clave = (r.clave || '').replace('_' + uid, '');
            cfg[clave] = r.valor;
          });
          return { status: 'ok', data: cfg };
        }

        if (accion === 'getGastos') {
          let query = sb.from('gastos')
            .select('*')
            .eq('user_id', uid)
            .order('fecha', { ascending: false });

          if (params && params.mes) {
            query = query
              .gte('fecha', `${params.mes}-01`)
              .lte('fecha', `${params.mes}-31`);
          }

          const { data, error } = await query;
          if (error) throw error;
          return { status: 'ok', data: data || [] };
        }

        return { status: 'err', data: [] };
      } catch (e) {
        console.error(`apiGet [${accion}] error:`, e.message || e);
        return { status: 'err', data: [] };
      }
    }

    // ── POST/UPSERT/DELETE: usa sb.from() con el cliente oficial ──
    async function apiPost(accion, body = {}) {
      const uid = currentUser?.id;
      if (!uid) throw new Error('No autenticado');

      // ── GUARDAR TASA BCV (upsert por fecha + user_id) ──────
      if (accion === 'saveTasa') {
        const { data, error } = await sb.from('tasas_bcv')
          .upsert(
            { fecha: body.fecha, tasa: parseFloat(body.tasa), fuente: body.fuente || 'BCV Oficial', user_id: uid },
            { onConflict: 'fecha,user_id' }
          )
          .select()
          .single();
        if (error) throw error;
        return { status: 'ok', data: { saved: true, fecha: data.fecha, tasa: data.tasa } };
      }

      // ── GUARDAR SNAPSHOT SALARIO (insert) ──────────────────
      if (accion === 'saveSalario') {
        const { data, error } = await sb.from('salarios')
          .insert({
            fecha: body.fecha, tasa_dia: +body.tasa_dia,
            salario_bs: +body.salario_bs, salario_usd: +body.salario_usd,
            bono1_bs: +body.bono1_bs, bono1_usd: +body.bono1_usd,
            bono2_bs: +body.bono2_bs, bono2_usd: +body.bono2_usd,
            cesta_usd: +body.cesta_usd, cesta_bs: +body.cesta_bs,
            ayuda_bs: +body.ayuda_bs, ayuda_usd: +body.ayuda_usd,
            total_bs: +body.total_bs, total_usd: +body.total_usd,
            notas: body.notas || '', user_id: uid,
          })
          .select()
          .single();
        if (error) throw error;
        return { status: 'ok', data: { saved: true, id: data.id } };
      }

      // ── GUARDAR GASTO VARIABLE (insert) ────────────────────
      if (accion === 'saveGasto') {
        const { data, error } = await sb.from('gastos')
          .insert({
            fecha: body.fecha, descripcion: body.descripcion,
            categoria: body.categoria || 'Otro',
            monto_usd: +body.monto_usd, tasa_dia: +body.tasa_dia,
            monto_bs_dia: +body.monto_bs_dia, tipo: body.tipo || 'variable',
            user_id: uid,
          })
          .select()
          .single();
        if (error) throw error;
        return { status: 'ok', data: { saved: true, id: data.id } };
      }

      // ── ELIMINAR GASTO ──────────────────────────────────────
      if (accion === 'deleteGasto') {
        const { error } = await sb.from('gastos')
          .delete()
          .eq('id', body.id)
          .eq('user_id', uid); // seguridad: solo borra los propios
        if (error) throw error;
        return { status: 'ok', data: { deleted: true, id: body.id } };
      }

      // ── GUARDAR GASTO FIJO (insert) ─────────────────────────
      if (accion === 'saveGastoFijo') {
        const { data, error } = await sb.from('gastos_fijos')
          .insert({
            descripcion: body.descripcion, categoria: body.categoria || 'Hogar',
            monto_usd: +body.monto_usd, activo: true, user_id: uid,
          })
          .select()
          .single();
        if (error) throw error;
        return { status: 'ok', data: { saved: true, id: data.id } };
      }

      // ── ELIMINAR GASTO FIJO ─────────────────────────────────
      if (accion === 'deleteGastoFijo') {
        const { error } = await sb.from('gastos_fijos')
          .delete()
          .eq('id', body.id)
          .eq('user_id', uid);
        if (error) throw error;
        return { status: 'ok', data: { deleted: true, id: body.id } };
      }

      // ── GUARDAR CONFIG (upsert por clave) ───────────────────
      if (accion === 'saveConfig') {
        const { error } = await sb.from('config')
          .upsert(
            {
              clave: body.clave + '_' + uid, valor: String(body.valor),
              actualizado_en: new Date().toISOString(), user_id: uid
            },
            { onConflict: 'clave' }
          );
        if (error) throw error;
        return { status: 'ok', data: { saved: true } };
      }

      throw new Error('apiPost acción desconocida: ' + accion);
    }

    // ═══════════════════════════════════════════════════════════
    //  FORMAT
    // ═══════════════════════════════════════════════════════════
    const N = n => (parseFloat(n) || 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const fBs = n => `Bs. ${N(n)}`;
    const fUSD = n => `$ ${N(n)}`;
    const bsFromUSD = (usd, tasa) => tasa > 0 ? usd * tasa : 0;
    const usdFromBs = (bs, tasa) => tasa > 0 ? bs / tasa : 0;

    function setEl(id, v) { const e = document.getElementById(id); if (e) e.textContent = v; }

    // ═══════════════════════════════════════════════════════════
    //  HEADER
    // ═══════════════════════════════════════════════════════════
    function updateHdr() {
      const rate = document.getElementById('hdr-rate');
      const dt = document.getElementById('hdr-dt');
      if (rate) rate.textContent = S.bcv > 0 ? `Bs. ${N(S.bcv)} / $` : '— Bs./$';
      if (dt) dt.textContent = S.bcvDate ? ` · ${S.bcvDate}` : '';
    }

    // ═══════════════════════════════════════════════════════════
    //  BCV API (dolarapi.com)
    // ═══════════════════════════════════════════════════════════
    async function fetchBCV() {
      try {
        const r = await fetchWithTimeout('https://ve.dolarapi.com/v1/dolares/oficial', { timeout: 10000 });
        if (!r.ok) throw new Error('HTTP ' + r.status);
        const d = await r.json();
        const rate = parseFloat(d.promedio || d.venta || d.compra) || null;
        const fecha = d.fechaActualizacion ? d.fechaActualizacion.split('T')[0] : '';
        return { rate, fecha, fuente: d.nombre || 'BCV Oficial' };
      } catch {
        try {
          const r2 = await fetchWithTimeout('https://ve.dolarapi.com/v1/dolares', { timeout: 10000 });
          const arr = await r2.json();
          const of = arr.find(x => (x.nombre || '').toLowerCase().includes('oficial'));
          if (of) {
            return {
              rate: parseFloat(of.promedio || of.venta || of.compra) || null,
              fecha: of.fechaActualizacion ? of.fechaActualizacion.split('T')[0] : '',
              fuente: of.nombre || 'BCV Oficial',
            };
          }
        } catch { }
        return { rate: null, fecha: '', fuente: '' };
      }
    }

    // Buscar tasa histórica por fecha en la API
    async function fetchTasaHistoricaAPI(fecha) {
      try {
        const r = await fetchWithTimeout('https://ve.dolarapi.com/v1/historicos/dolares/oficial', { timeout: 12000 });
        if (!r.ok) throw new Error('HTTP ' + r.status);
        const arr = await r.json();
        // arr: [{fecha, promedio, compra, venta, fuente}, ...]
        const encontrado = arr.find(x => x.fecha && x.fecha.startsWith(fecha));
        if (encontrado) {
          return {
            rate: parseFloat(encontrado.promedio || encontrado.venta || encontrado.compra),
            fecha: encontrado.fecha ? encontrado.fecha.split('T')[0] : fecha,
            fuente: encontrado.fuente || 'BCV Oficial',
          };
        }
        return null;
      } catch {
        return null;
      }
    }

    async function fetchAction(isModal) {
      const statusEl = document.getElementById(isModal ? 'm-status' : 'cfg-status');
      const inp = document.getElementById(isModal ? 'm-bcv' : 'inp-bcv');
      const dtInp = document.getElementById(isModal ? 'm-dt' : 'inp-dt');
      statusEl.style.display = 'block';
      statusEl.style.cssText += 'background:rgba(41,184,176,.08);color:var(--teal);border:1px solid rgba(41,184,176,.2);';
      statusEl.textContent = '⟳ Consultando ve.dolarapi.com...';
      const { rate, fecha, fuente } = await fetchBCV();
      if (rate) {
        inp.value = rate.toFixed(2);
        dtInp.value = fecha || new Date().toISOString().split('T')[0];
        statusEl.textContent = `✓ ${fuente}: Bs. ${N(rate)} / USD · ${fecha || 'hoy'}`;
        liveCalc();
      } else {
        statusEl.style.cssText += 'background:rgba(200,168,75,.08);color:var(--gold2);border:1px solid rgba(200,168,75,.2);';
        statusEl.textContent = '⚠ No se pudo conectar. Ingresa la tasa manualmente.';
      }
    }

    // ═══════════════════════════════════════════════════════════
    //  GUARDAR TASA BCV → SHEETS
    // ═══════════════════════════════════════════════════════════
    async function saveBCV() {
      const tasa = parseFloat(document.getElementById('inp-bcv').value) || 0;
      const fecha = document.getElementById('inp-dt').value;
      if (!tasa || !fecha) { showStatus('cfg-status', 'error', '⚠ Ingresa tasa y fecha.'); return; }
      S.bcv = tasa; S.bcvDate = fecha; lsSave(); updateHdr(); liveCalc();
      showStatus('cfg-status', 'loading', '⟳ Guardando en Sheets...');
      setSyncState('loading', 'Guardando...');
      try {
        await apiPost('saveTasa', { fecha, tasa, fuente: 'BCV Oficial' });
        showStatus('cfg-status', 'ok', `✓ Tasa Bs. ${N(tasa)} guardada para ${fecha}`);
        setSyncState('ok');
        // Actualizar caché local
        const idx = S.tasasHistoricas.findIndex(t => t.fecha === fecha);
        if (idx >= 0) S.tasasHistoricas[idx].tasa = tasa;
        else S.tasasHistoricas.unshift({ fecha, tasa, fuente: 'BCV Oficial' });
        S.tasasHistoricas.sort((a, b) => b.fecha.localeCompare(a.fecha));
        lsSave();
        poblarSelectorTasas();
      } catch {
        showStatus('cfg-status', 'warn', '⚠ Guardado local. Sin conexión con Sheets.');
        setSyncState('err', 'Sin conexión');
      }
    }

    // ═══════════════════════════════════════════════════════════
    //  MODAL BCV
    // ═══════════════════════════════════════════════════════════
    function openModal(id) {
      document.getElementById(id).classList.add('open');
      if (id === 'modal-bcv') {
        document.getElementById('m-bcv').value = S.bcv || '';
        document.getElementById('m-dt').value = S.bcvDate || '';
        document.getElementById('m-status').style.display = 'none';
      }
    }
    function closeModal(id) { document.getElementById(id).classList.remove('open'); }
    async function saveModal() {
      const r = parseFloat(document.getElementById('m-bcv').value) || 0;
      const d = document.getElementById('m-dt').value;
      if (r > 0) {
        S.bcv = r; S.bcvDate = d; lsSave(); updateHdr(); liveCalc();
        closeModal('modal-bcv');
        try { await apiPost('saveTasa', { fecha: d, tasa: r, fuente: 'BCV Oficial' }); } catch { }
      }
    }
    document.querySelectorAll('.overlay').forEach(el =>
      el.addEventListener('click', e => { if (e.target === el) el.classList.remove('open'); })
    );

    // ═══════════════════════════════════════════════════════════
    //  LIVE CALC
    // ═══════════════════════════════════════════════════════════
    function liveCalc() {
      const bcv = parseFloat(document.getElementById('inp-bcv').value) || 0;
      const sal = parseFloat(document.getElementById('inp-sal').value) || 0;
      const b2 = parseFloat(document.getElementById('inp-b2').value) || 0;
      const cu = parseFloat(document.getElementById('inp-cu').value) || 0;
      const cbs = cu * bcv, ay = cbs * .65;
      setEl('c-q1', fBs(sal / 2)); setEl('c-q1u', fUSD(usdFromBs(sal / 2, bcv)));
      setEl('c-q2', fBs(sal / 2)); setEl('c-q2u', fUSD(usdFromBs(sal / 2, bcv)));
      setEl('c-b2a', fBs(b2 / 2)); setEl('c-b2au', fUSD(usdFromBs(b2 / 2, bcv)));
      setEl('c-b2b', fBs(b2 / 2)); setEl('c-b2bu', fUSD(usdFromBs(b2 / 2, bcv)));
      setEl('c-cbs', fBs(cbs)); setEl('c-cusd', `${N(cu)} USD`);
      setEl('c-ay', fBs(ay)); setEl('c-ayu', fUSD(usdFromBs(ay, bcv)));
      // Actualizar info tasa en gasto
      if (bcv > 0) setEl('g-tasa-info', `Tasa activa: Bs. ${N(bcv)} / USD · ${S.bcvDate || 'sin fecha'}`);
      syncFijo();
    }

    // ═══════════════════════════════════════════════════════════
    //  CALCULAR TODO + GUARDAR SNAPSHOT SALARIO
    // ═══════════════════════════════════════════════════════════
    async function calcularTodo(isBackground = false) {
      S.bcv = parseFloat(document.getElementById('inp-bcv').value) || S.bcv;
      S.bcvDate = document.getElementById('inp-dt').value || S.bcvDate;
      S.salario = parseFloat(document.getElementById('inp-sal').value) || S.salario || 0;
      S.b1 = parseFloat(document.getElementById('inp-b1').value) || S.b1 || 0;
      S.b2 = parseFloat(document.getElementById('inp-b2').value) || S.b2 || 0;
      S.cusd = parseFloat(document.getElementById('inp-cu').value) || S.cusd || 0;
      const notas = document.getElementById('inp-notas').value.trim();
      lsSave(); updateHdr();

      const bcv = S.bcv, sal = S.salario, b1 = S.b1, b2 = S.b2, cu = S.cusd;
      const cbs = cu * bcv, ay = cbs * .65;
      const totalBs = sal + b1 + b2 + cbs + ay;
      const totalUSD = usdFromBs(totalBs, bcv);

      if (!isBackground) showStatus('cfg-status', 'loading', '⟳ Guardando en Google Sheets...');
      setSyncState('loading', 'Guardando...');
      try {
        await apiPost('saveSalario', {
          fecha: S.bcvDate || new Date().toISOString().split('T')[0],
          tasa_dia: bcv,
          salario_bs: sal, salario_usd: usdFromBs(sal, bcv),
          bono1_bs: b1, bono1_usd: usdFromBs(b1, bcv),
          bono2_bs: b2, bono2_usd: usdFromBs(b2, bcv),
          cesta_usd: cu, cesta_bs: cbs,
          ayuda_bs: ay, ayuda_usd: usdFromBs(ay, bcv),
          total_bs: totalBs, total_usd: totalUSD,
          notas,
        });
        await apiPost('saveTasa', { fecha: S.bcvDate, tasa: bcv, fuente: 'BCV Oficial' });
        if (!isBackground) showStatus('cfg-status', 'ok', `✓ Guardado en Sheets · Total: ${fUSD(totalUSD)} / ${fBs(totalBs)}`);
        setSyncState('ok');
        S.configUnsynced = false;
        lsSave();
      } catch {
        if (!isBackground) showStatus('cfg-status', 'warn', '⚠ Guardado local solamente. Sin conexión.');
        setSyncState('err', 'Sin conexión');
        S.configUnsynced = true;
        lsSave();
      }

      if (!isBackground) {
        renderResumen(); renderSemanal(); renderAhorro(); renderGastos();
        nav(document.querySelectorAll('.nav-btn')[1], 'resumen');
      }
    }

    // ═══════════════════════════════════════════════════════════
    //  SELECTOR TASAS HISTÓRICAS (para resumen)
    // ═══════════════════════════════════════════════════════════
    function poblarSelectorTasas() {
      const sel = document.getElementById('sel-tasa-hist');
      const current = sel.value;
      sel.innerHTML = '<option value="">Tasa activa (hoy) — Bs. ' + N(S.bcv) + '</option>';
      S.tasasHistoricas.forEach(t => {
        const opt = document.createElement('option');
        opt.value = t.fecha;
        opt.textContent = `${t.fecha} — Bs. ${N(t.tasa)} / USD`;
        sel.appendChild(opt);
      });
      if (current) sel.value = current;
    }

    function aplicarTasaHistorica() {
      const sel = document.getElementById('sel-tasa-hist');
      const fecha = sel.value;
      if (!fecha) {
        S.tasaVista = S.bcv;
        setEl('sel-tasa-info', '');
      } else {
        const t = S.tasasHistoricas.find(x => x.fecha === fecha);
        if (t) {
          S.tasaVista = parseFloat(t.tasa);
          setEl('sel-tasa-info', `Bs. ${N(t.tasa)} / USD · ${fecha}`);
        }
      }
      renderResumen();
    }

    // ═══════════════════════════════════════════════════════════
    //  RESUMEN
    // ═══════════════════════════════════════════════════════════
    function renderResumen() {
      const tasa = S.tasaVista > 0 ? S.tasaVista : S.bcv;
      const { salario: sal, b1, b2, cusd: cu } = S;
      const cbs = cu * S.bcv, ay = cbs * .65; // Bs. siempre en tasa activa
      // USD: usamos la tasa seleccionada para mostrar equivalencia
      const toUSD = bs => usdFromBs(bs, tasa);
      const total = sal + b1 + b2 + cbs + ay;

      const kpis = [
        { lbl: 'Bono 1', usd: toUSD(b1), bs: b1, ac: 'var(--gold)' },
        { lbl: 'Bono 2', usd: toUSD(b2), bs: b2, ac: 'var(--gold)' },
        { lbl: 'Salario', usd: toUSD(sal), bs: sal, ac: 'var(--blue)' },
        { lbl: 'Cesta Ticket', usd: toUSD(cbs), bs: cbs, ac: 'var(--teal)' },
        { lbl: 'Ayuda 65%', usd: toUSD(ay), bs: ay, ac: 'var(--teal)' },
        { lbl: 'TOTAL MENSUAL', usd: toUSD(total), bs: total, ac: 'var(--green)', big: true },
      ];

      document.getElementById('kpi-grid').innerHTML = kpis.map(k => `
    <div class="kpi" style="--ac:${k.ac};${k.big ? 'grid-column:span 2;' : ''}">
      <div class="kpi-lbl">${k.lbl}</div>
      <div class="kpi-val" style="${k.big ? 'font-size:1.3rem;color:var(--green);' : 'color:var(--teal);'}">${fUSD(k.usd)}</div>
      <div class="kpi-sub">${fBs(k.bs)}</div>
    </div>`).join('');

      const rows = [
        ['Bono 1', toUSD(b1), b1, 'Semana 1 (días 1–6)'],
        ['Salario 1ª quincena', toUSD(sal / 2), sal / 2, 'Día 10'],
        ['Ayuda 65% Cesta', toUSD(ay), ay, 'Semana 2'],
        ['Bono 2 — parte 1', toUSD(b2 / 2), b2 / 2, 'Semana 3'],
        ['Cesta Ticket', toUSD(cbs), cbs, 'Semana 3'],
        ['Salario 2ª quincena', toUSD(sal / 2), sal / 2, 'Día 25'],
        ['Bono 2 — parte 2', toUSD(b2 / 2), b2 / 2, 'Últimos días mes'],
      ];
      document.getElementById('tbl-body').innerHTML = rows.map(r => `
    <tr><td>${r[0]}</td>
    <td class="right mono teal">${fUSD(r[1])}</td>
    <td class="right mono gold xs">${fBs(r[2])}</td>
    <td class="right xs muted">${r[3]}</td></tr>`).join('') + `
    <tr class="tot">
      <td>TOTAL MENSUAL</td>
      <td class="right mono" style="font-size:.98rem;">${fUSD(toUSD(total))}</td>
      <td class="right mono gold">${fBs(total)}</td>
      <td></td>
    </tr>`;

      poblarSelectorTasas();
    }

    // ═══════════════════════════════════════════════════════════
    //  SEMANAL
    // ═══════════════════════════════════════════════════════════
    function renderSemanal() {
      const { bcv: tasa, salario: sal, b1, b2, cusd: cu } = S;
      const cbs = cu * tasa, ay = cbs * .65;
      const toUSD = bs => usdFromBs(bs, tasa);
      const sems = [
        { t: 'Semana 1', r: 'Días 1 – 6', c: '#c8a84b', ps: [{ n: 'Bono 1', v: b1, s: 'Pago mensual completo' }] },
        { t: 'Semana 2', r: 'Días 7 – 14 · cobro día 10', c: '#4a8ff0', ps: [{ n: 'Salario — 1ª quincena', v: sal / 2, s: 'Día 10 del mes' }, { n: 'Ayuda 65% Cesta', v: ay, s: '65% del valor Cesta en Bs.' }] },
        { t: 'Semana 3', r: 'Días 15 – 21', c: '#29b8b0', ps: [{ n: 'Bono 2 — parte 1', v: b2 / 2, s: 'Primera mitad' }, { n: 'Cesta Ticket', v: cbs, s: `${N(cu)} USD a tasa BCV` }] },
        { t: 'Semana 4', r: 'Días 22 – 31 · cobro día 25', c: '#44c97e', ps: [{ n: 'Salario — 2ª quincena', v: sal / 2, s: 'Día 25 del mes' }, { n: 'Bono 2 — parte 2', v: b2 / 2, s: 'Segunda mitad' }] },
      ];
      document.getElementById('week-blocks').innerHTML = sems.map(s => {
        const tot = s.ps.reduce((a, p) => a + p.v, 0);
        return `<div class="week-card" style="--ac:${s.c}">
      <div class="week-head">
        <div><div class="week-name" style="color:${s.c}">${s.t}</div><div class="week-range">${s.r}</div></div>
        <div><div class="wt-bs" style="color:var(--teal);">${fUSD(toUSD(tot))}</div><div class="wt-usd" style="color:var(--gold2);">${fBs(tot)}</div></div>
      </div>
      ${s.ps.map(p => `<div class="pay-row">
        <div class="pay-name"><div class="pay-dot" style="background:${s.c}"></div><div><div>${p.n}</div><div class="pay-sub">${p.s}</div></div></div>
        <div class="pay-amt"><div class="pay-bs" style="color:var(--teal);">${fUSD(toUSD(p.v))}</div><div class="pay-usd" style="color:var(--gold2);">${fBs(p.v)}</div></div>
      </div>`).join('')}
    </div>`;
      }).join('');
    }

    // ═══════════════════════════════════════════════════════════
    //  GASTOS VARIABLES
    // ═══════════════════════════════════════════════════════════
    const semDia = d => d <= 6 ? 1 : d <= 14 ? 2 : d <= 21 ? 3 : 4;
    const semLabels = { 1: 'Sem 1 (1–6)', 2: 'Sem 2 (7–14)', 3: 'Sem 3 (15–21)', 4: 'Sem 4 (22–31)' };
    let gCur = 'usd';

    function setCur(cur) {
      gCur = cur;
      document.getElementById('g-inp-usd-wrap').style.display = cur === 'usd' ? 'block' : 'none';
      document.getElementById('g-inp-bs-wrap').style.display = cur === 'bs' ? 'block' : 'none';
      document.getElementById('g-cur-usd').style.cssText = `flex:1;padding:.55rem;border:none;font-family:'IBM Plex Sans',sans-serif;font-size:.8rem;font-weight:600;cursor:pointer;background:${cur === 'usd' ? 'var(--teal);color:#0b1120' : 'var(--navy3);color:var(--text2)'};transition:all .15s;`;
      document.getElementById('g-cur-bs').style.cssText = `flex:1;padding:.55rem;border:none;font-family:'IBM Plex Sans',sans-serif;font-size:.8rem;font-weight:600;cursor:pointer;background:${cur === 'bs' ? 'var(--gold);color:#0b1120' : 'var(--navy3);color:var(--text2)'};transition:all .15s;`;
    }

    // ═══════════════════════════════════════════════════════════
    //  TASA DEL DÍA — auto lookup al cambiar fecha
    // ═══════════════════════════════════════════════════════════
    let gTasaDiaActual = 0; // tasa confirmada para el gasto en curso

    function setTasaBox(estado, tasa, fecha, msg) {
      // estado: 'ok' | 'api' | 'manual' | 'loading' | 'error'
      const box = document.getElementById('g-tasa-box');
      const lbl = document.getElementById('g-tasa-lbl');
      const val = document.getElementById('g-tasa-val');
      const manW = document.getElementById('g-tasa-manual-wrap');
      const btn = document.getElementById('g-btn-add');
      box.style.display = 'block';

      const estilos = {
        ok: 'background:rgba(68,201,126,.08);border:1px solid rgba(68,201,126,.2);',
        api: 'background:rgba(41,184,176,.08);border:1px solid rgba(41,184,176,.2);',
        loading: 'background:rgba(200,168,75,.06);border:1px solid rgba(200,168,75,.2);',
        manual: 'background:rgba(74,143,240,.08);border:1px solid rgba(74,143,240,.2);',
        error: 'background:rgba(224,92,92,.06);border:1px solid rgba(224,92,92,.2);',
      };
      const colores = { ok: 'var(--green)', api: 'var(--teal)', loading: 'var(--gold2)', manual: 'var(--blue)', error: 'var(--red)' };

      box.style.cssText += estilos[estado] || estilos.ok;
      lbl.style.color = colores[estado] || colores.ok;
      lbl.textContent = msg || '';
      val.style.color = colores[estado] || colores.ok;
      val.textContent = tasa > 0 ? `Bs. ${N(tasa)} / USD · ${fecha || ''}` : '';
      manW.style.display = estado === 'error' ? 'block' : 'none';
      btn.disabled = (estado === 'loading' || estado === 'error');
      gTasaDiaActual = tasa > 0 ? tasa : 0;
      // Refrescar conversión con nueva tasa
      syncCurrency(gCur === 'usd' ? 'usd' : 'bs');
    }

    async function onFechaGastoChange() {
      const fecha = document.getElementById('g-f').value;
      if (!fecha) return;
      const hoy = new Date().toISOString().split('T')[0];

      // Si es hoy → usar tasa activa directamente
      if (fecha === hoy) {
        if (S.bcv > 0) {
          setTasaBox('ok', S.bcv, fecha, '✓ Tasa activa (hoy)');
        } else {
          setTasaBox('error', 0, fecha, '⚠ Sin tasa activa — ingrésala manualmente');
        }
        return;
      }

      // Buscar en caché histórico local
      const local = S.tasasHistoricas.find(t => t.fecha === fecha);
      if (local && parseFloat(local.tasa) > 0) {
        setTasaBox('ok', parseFloat(local.tasa), fecha, '✓ Encontrada en historial');
        return;
      }

      // Buscar en API histórica
      setTasaBox('loading', 0, fecha, '⟳ Buscando tasa en API histórica...');
      const resultado = await fetchTasaHistoricaAPI(fecha);
      if (resultado && resultado.rate > 0) {
        // Guardar automáticamente en historial local y Sheets
        S.tasasHistoricas.unshift({ fecha: resultado.fecha, tasa: resultado.rate, fuente: resultado.fuente });
        S.tasasHistoricas.sort((a, b) => b.fecha.localeCompare(a.fecha));
        lsSave();
        try { await apiPost('saveTasa', { fecha: resultado.fecha, tasa: resultado.rate, fuente: resultado.fuente }); } catch { }
        poblarSelectorTasas();
        setTasaBox('api', resultado.rate, resultado.fecha, '✓ Obtenida de API histórica');
      } else {
        setTasaBox('error', 0, fecha, `⚠ Sin tasa para ${fecha} — ingrésala manualmente:`);
      }
    }

    function onTasaManualInput() {
      const t = parseFloat(document.getElementById('g-tasa-manual').value) || 0;
      if (t > 0) {
        gTasaDiaActual = t;
        document.getElementById('g-btn-add').disabled = false;
        syncCurrency(gCur === 'usd' ? 'usd' : 'bs');
      }
    }

    async function guardarTasaManualGasto() {
      const fecha = document.getElementById('g-f').value;
      const t = parseFloat(document.getElementById('g-tasa-manual').value) || 0;
      if (!t || !fecha) return;
      S.tasasHistoricas.unshift({ fecha, tasa: t, fuente: 'Manual' });
      S.tasasHistoricas.sort((a, b) => b.fecha.localeCompare(a.fecha));
      lsSave(); poblarSelectorTasas();
      try { await apiPost('saveTasa', { fecha, tasa: t, fuente: 'Manual' }); } catch { }
      setTasaBox('manual', t, fecha, '✓ Tasa manual guardada');
    }

    function syncCurrency(from) {
      // Usa la tasa del día actualmente confirmada, no la tasa activa global
      const tasa = gTasaDiaActual > 0 ? gTasaDiaActual : (S.bcv || 0);
      if (from === 'usd') {
        const usd = parseFloat(document.getElementById('g-m-usd').value) || 0;
        setEl('g-conv-bs', tasa > 0 ? `≈ Bs. ${N(usd * tasa)} (tasa ${N(tasa)})` : '≈ — Bs.');
      } else {
        const bs = parseFloat(document.getElementById('g-m-bs').value) || 0;
        setEl('g-conv-usd', tasa > 0 ? `≈ $ ${N(bs / tasa)}` : '≈ — USD');
      }
    }

    // Obtener tasa del día (para lectura interna)
    function getTasaDia(fecha) {
      if (!fecha) return S.bcv;
      const t = S.tasasHistoricas.find(x => x.fecha === fecha);
      if (t) return parseFloat(t.tasa) || S.bcv;
      return S.bcv;
    }

    async function addGasto() {
      const desc = document.getElementById('g-desc').value.trim();
      const cat = document.getElementById('g-c').value;
      const fecha = document.getElementById('g-f').value;
      if (!desc || !fecha) { alert('Completa descripción y fecha.'); return; }

      const tasaDia = gTasaDiaActual > 0 ? gTasaDiaActual : getTasaDia(fecha);
      if (!tasaDia) { alert('No hay tasa disponible para esa fecha.'); return; }

      let montoUSD = 0, montoBsDia = 0;
      if (gCur === 'usd') {
        montoUSD = parseFloat(document.getElementById('g-m-usd').value) || 0;
        montoBsDia = montoUSD * tasaDia;
      } else {
        const bs = parseFloat(document.getElementById('g-m-bs').value) || 0;
        montoUSD = usdFromBs(bs, tasaDia);
        montoBsDia = bs;
      }
      if (!montoUSD) { alert('Ingresa un monto válido.'); return; }

      const gasto = {
        id: 'gto_' + Date.now(), fecha, descripcion: desc, categoria: cat,
        monto_usd: montoUSD, tasa_dia: tasaDia, monto_bs_dia: montoBsDia, tipo: 'variable',
      };

      S.gastos.push(gasto);
      lsSave();

      // Limpiar form y refrescar UI local inmediato
      document.getElementById('g-desc').value = '';
      document.getElementById('g-m-usd').value = '';
      document.getElementById('g-m-bs').value = '';
      document.getElementById('g-conv-bs').textContent = '≈ — Bs. (tasa del día)';
      document.getElementById('g-conv-usd').textContent = '≈ — USD';

      renderGastos();
      // No renderizamos todo lo demás a menos que sea necesario o en el próximo tick
      setTimeout(() => renderAhorro(), 10);

      setSyncState('loading', 'Sincronizando...');

      // Guardado en segundo plano (No bloqueante)
      apiPost('saveGasto', {
        fecha, descripcion: desc, categoria: cat,
        monto_usd: montoUSD, tasa_dia: tasaDia, monto_bs_dia: montoBsDia, tipo: 'variable',
      }).then(res => {
        if (res && res.status === 'ok' && res.data && res.data.id) {
          const idxLocal = S.gastos.findIndex(g => g.id === gasto.id);
          if (idxLocal >= 0) S.gastos[idxLocal].id = res.data.id;
          lsSave();
          setSyncState('ok');
        }
      }).catch(err => {
        console.error("Fallo sincro gasto:", err);
        setSyncState('err', 'Pendiente de subir');
      });
    }

    function showGastoSyncStatus(type, msg) {
      let el = document.getElementById('g-sync-status');
      if (!el) {
        el = document.createElement('div');
        el.id = 'g-sync-status';
        el.style.cssText = 'margin-top:.6rem;font-size:.75rem;padding:.55rem .8rem;border-radius:7px;font-family:IBM Plex Mono,monospace;word-break:break-all;';
        const btn = document.getElementById('g-btn-add');
        if (btn && btn.parentNode) btn.parentNode.insertBefore(el, btn.nextSibling);
      }
      const styles = {
        ok: 'background:rgba(68,201,126,.1);border:1px solid rgba(68,201,126,.25);color:#44c97e;',
        loading: 'background:rgba(41,184,176,.1);border:1px solid rgba(41,184,176,.25);color:#29b8b0;',
        error: 'background:rgba(224,92,92,.1);border:1px solid rgba(224,92,92,.25);color:#e05c5c;',
      };
      el.style.cssText += styles[type] || styles.loading;
      el.textContent = msg;
      el.style.display = 'block';
    }

    async function delGasto(id) {
      if (!confirm('¿Borrar este gasto?')) return;
      // Borrar local primero
      S.gastos = S.gastos.filter(g => g.id !== id);
      if (!String(id).startsWith('gto_')) {
        S.deletedGastos = S.deletedGastos || [];
        S.deletedGastos.push(id);
      }
      lsSave();
      renderGastos(); renderAhorro();
      // Borrar en Sheets
      setSyncState('loading', 'Borrando...');
      try {
        const res = await apiPost('deleteGasto', { id });
        if (res && res.status === 'ok') {
          setSyncState('ok');
        } else {
          // Sheets no encontró el ID — puede que el gasto ya no exista allá
          setSyncState('ok'); // igual está borrado local
        }
      } catch (err) {
        setSyncState('err', 'Sin conexión — borrado solo localmente');
      }
    }

    async function clearG() {
      const mesFiltro = document.getElementById('g-mes-filtro').value || '';
      const label = mesFiltro ? `del mes ${mesFiltro}` : 'de TODOS los periodos';
      if (!confirm(`¿Borrar gastos ${label}? Esta acción no se puede deshacer.`)) return;

      // 1. Identificar y Borrar localmente (Feedback instantáneo)
      const aBorrar = mesFiltro
        ? S.gastos.filter(g => String(g.fecha || '').startsWith(mesFiltro))
        : [...S.gastos];

      const idsABorrar = aBorrar.map(g => g.id).filter(id => !id.startsWith('gto_')); // solo IDs de la nube

      S.gastos = mesFiltro
        ? S.gastos.filter(g => !String(g.fecha || '').startsWith(mesFiltro))
        : [];

      lsSave();
      renderGastos();
      renderAhorro();

      // 2. Borrar en la Nube usando el cliente Supabase oficial
      if (idsABorrar.length === 0) return;

      setSyncState('loading', 'Borrando en nube...');
      try {
        const uid = currentUser?.id;
        let query = sb.from('gastos').delete().eq('user_id', uid);
        if (mesFiltro) {
          query = query.gte('fecha', `${mesFiltro}-01`).lte('fecha', `${mesFiltro}-31`);
        }
        const { error } = await query;
        if (error) throw error;
        setSyncState('ok');
      } catch (err) {
        console.error("Fallo borrado nube:", err);
        setSyncState('err', 'Error al borrar en nube');
      }
    }

    async function cargarGastosMes() {
      // Los gastos ya están todos en memoria desde el init.
      // El selector solo filtra la vista — renderGastos() lee el valor del input.
      renderGastos(); renderAhorro();
    }

    function renderGastos() {
      // Filtrar por el mes seleccionado en el selector — todos los datos están en memoria
      const mesFiltro = (document.getElementById('g-mes-filtro') || {}).value || '';
      const gastosDelMes = mesFiltro
        ? S.gastos.filter(g => String(g.fecha || '').startsWith(mesFiltro))
        : S.gastos;
      const sorted = [...gastosDelMes].sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''));
      const empty = document.getElementById('g-empty'), list = document.getElementById('g-list');
      if (!sorted.length) { empty.style.display = 'block'; list.innerHTML = ''; }
      else {
        empty.style.display = 'none';
        list.innerHTML = sorted.map(g => {
          // USD: INMUTABLE — exactamente como fue cargado
          const usd = parseFloat(g.monto_usd) || 0;
          const bsDia = parseFloat(g.monto_bs_dia) || (usd * (parseFloat(g.tasa_dia) || S.bcv));
          const tasaDia = parseFloat(g.tasa_dia) || S.bcv;
          return `<div style="display:flex;align-items:center;gap:.7rem;background:var(--navy3);border-radius:8px;padding:.65rem .9rem;margin-bottom:.4rem;">
        <div style="flex:1;min-width:0;">
          <div style="font-size:.85rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
            ${g.descripcion || g.desc || ''}
          </div>
          <div style="display:flex;align-items:center;gap:.4rem;flex-wrap:wrap;margin-top:.25rem;">
            <span class="xs muted">${g.fecha}</span>
            <span class="bdg bdg-t">${g.categoria || g.cat || ''}</span>
            <span style="font-size:.65rem;color:var(--text2);font-family:'IBM Plex Mono',monospace;opacity:.6;">
              tasa Bs.${N(tasaDia)}
            </span>
          </div>
        </div>
        <div style="text-align:right;flex-shrink:0;">
          <!-- USD: valor principal, prominente -->
          <div class="mono teal" style="font-size:1rem;font-weight:600;">${fUSD(usd)}</div>
          <!-- Bs: referencia discreta, poco impacto visual -->
          <div style="font-family:'IBM Plex Mono',monospace;font-size:.68rem;color:var(--text2);opacity:.55;margin-top:.1rem;">
            Bs.${N(bsDia)}
          </div>
        </div>
        <button class="btn btn-d btn-sm" onclick="delGasto('${g.id}')">✕</button>
      </div>`;
        }).join('');
      }

      // Resumen semanal — USD como valor, Bs solo en tooltip implícito
      const sems = { 1: 0, 2: 0, 3: 0, 4: 0 };
      // Bs por semana sumando monto_bs_dia real (no recalculado)
      const semsBs = { 1: 0, 2: 0, 3: 0, 4: 0 };
      gastosDelMes.forEach(g => {
        const d = new Date((g.fecha || '') + 'T00:00:00').getDate();
        const s = semDia(d);
        sems[s] += parseFloat(g.monto_usd) || 0;
        semsBs[s] += parseFloat(g.monto_bs_dia) || 0;
      });
      document.getElementById('g-sem').innerHTML = Object.entries(sems).map(([s, v]) => `
    <div style="display:flex;justify-content:space-between;align-items:center;background:var(--navy3);border-radius:7px;padding:.5rem .85rem;">
      <span class="xs muted">${semLabels[s]}</span>
      <div style="text-align:right;">
        <div class="mono teal xs" style="font-weight:600;">${fUSD(v)}</div>
        <div style="font-family:'IBM Plex Mono',monospace;font-size:.65rem;color:var(--text2);opacity:.5;">
          ${semsBs[s] > 0 ? `Bs.${N(semsBs[s])}` : ''}
        </div>
      </div>
    </div>`).join('');

      const totUSD = gastosDelMes.reduce((a, g) => a + (parseFloat(g.monto_usd) || 0), 0);
      const totBs = gastosDelMes.reduce((a, g) => a + (parseFloat(g.monto_bs_dia) || 0), 0);
      setEl('g-tot-usd-main', fUSD(totUSD));
      setEl('g-tot-bs-sub', fBs(totBs));
    }

    // ═══════════════════════════════════════════════════════════
    //  GASTOS FIJOS
    // ═══════════════════════════════════════════════════════════
    function syncFijo() {
      const usd = parseFloat(document.getElementById('gf-monto')?.value) || 0;
      const bcv = S.bcv || 0;
      setEl('gf-conv', bcv > 0 ? `≈ Bs. ${N(usd * bcv)} a tasa activa` : '≈ — Bs. (sin tasa BCV)');
    }

    async function addGastoFijo() {
      const desc = document.getElementById('gf-desc').value.trim();
      const monto = parseFloat(document.getElementById('gf-monto').value) || 0;
      const cat = document.getElementById('gf-cat').value;
      if (!desc || !monto) { alert('Completa descripción y monto.'); return; }

      const fijo = { id: 'fjo_' + Date.now(), descripcion: desc, categoria: cat, monto_usd: monto, activo: true };
      S.gastosFijos.push(fijo); lsSave();
      document.getElementById('gf-desc').value = '';
      document.getElementById('gf-monto').value = '';
      renderGastosFijos(); renderAhorro();

      setSyncState('loading', 'Guardando...');
      try {
        const res = await apiPost('saveGastoFijo', { descripcion: desc, categoria: cat, monto_usd: monto });
        // Confirmar ID real de Sheets
        if (res && res.data && res.data.id) {
          const idx = S.gastosFijos.findIndex(g => g.id === fijo.id);
          if (idx >= 0) S.gastosFijos[idx].id = res.data.id;
          lsSave();
        }
        setSyncState('ok');
      } catch { setSyncState('err', 'Sin conexión'); }
    }

    async function delGastoFijo(id) {
      if (!confirm('¿Borrar este gasto fijo?')) return;
      S.gastosFijos = S.gastosFijos.filter(g => g.id !== id);
      if (!String(id).startsWith('fjo_')) {
        S.deletedFijos = S.deletedFijos || [];
        S.deletedFijos.push(id);
      }
      lsSave();
      renderGastosFijos(); renderAhorro();
      setSyncState('loading', 'Borrando...');
      try {
        const res = await apiPost('deleteGastoFijo', { id });
        if (res && res.status === 'ok') setSyncState('ok');
        else setSyncState('ok');
      } catch { setSyncState('err', 'Sin conexión — borrado solo localmente'); }
    }

    // ═══════════════════════════════════════════════════════════
    //  SYNC GASTOS FIJOS
    // ═══════════════════════════════════════════════════════════
    async function syncGastosFijos() {
      showLoading('Sincronizando gastos fijos...');
      try {
        const res = await apiGet('getGastosFijos');
        if (res && res.status === 'ok' && Array.isArray(res.data)) {
          // Solo sobrescribir si hay datos nuevos o si confirmamos que la nube tiene prioridad
          if (res.data.length > 0 || S.gastosFijos.length === 0) {
            S.gastosFijos = res.data.map(g => ({
              ...g,
              monto_usd: parseFloat(g.monto_usd) || 0,
              activo: true // Por defecto activos si vienen de la nube
            }));
            lsSave();
          }
          setSyncState('ok');
        }
      } catch (e) {
        console.error("Error sync fijos:", e);
        setSyncState('err', 'Error de red');
      } finally {
        renderGastosFijos();
        renderAhorro();
        hideLoading();
      }
    }

    function renderGastosFijos() {
      const fijos = S.gastosFijos || [];
      const empty = document.getElementById('gf-empty');
      const list = document.getElementById('gf-list');
      const bcv = S.bcv || 0;

      if (!list) return;

      if (!fijos.length) {
        if (empty) empty.style.display = 'block';
        list.innerHTML = '';
      } else {
        if (empty) empty.style.display = 'none';
        list.innerHTML = fijos.map(g => {
          const usd = parseFloat(g.monto_usd) || 0;
          const bs = usd * bcv;
          return `<div style="display:flex;align-items:center;gap:.7rem;background:var(--navy3);border-radius:8px;padding:.65rem .9rem;margin-bottom:.4rem;">
        <span style="color:var(--gold2);font-size:1rem;">📌</span>
        <div style="flex:1;">
          <div style="font-size:.85rem;">${g.descripcion || 'Sin descripción'}</div>
          <div class="xs muted"><span class="bdg bdg-gold">${g.categoria || 'Gasto'}</span> · mensual</div>
        </div>
        <div style="text-align:right;">
          <div class="mono teal" style="font-weight:500;">${fUSD(usd)}</div>
          <div class="mono gold xs">Bs. ${N(bs)}</div>
        </div>
        <button class="btn btn-d btn-sm" onclick="delGastoFijo('${g.id}')">✕</button>
      </div>`;
        }).join('');
      }

      const totUSD = fijos.reduce((a, g) => a + (parseFloat(g.monto_usd) || 0), 0);
      setEl('gf-total-usd', fUSD(totUSD));
      setEl('gf-total-bs', `Bs. ${N(totUSD * bcv)} a tasa activa`);
    }

    // ═══════════════════════════════════════════════════════════
    //  AHORRO + GRÁFICAS (todo en USD)
    // ═══════════════════════════════════════════════════════════
    function renderAhorro() {
      const { bcv, salario: sal, b1, b2, cusd: cu } = S;
      const cbs = cu * bcv, ay = cbs * .65, totalBs = sal + b1 + b2 + cbs + ay;
      const totalUSD = usdFromBs(totalBs, bcv);

      const totGasUSD = S.gastos.reduce((a, g) => a + (parseFloat(g.monto_usd) || 0), 0);
      const totGasBsDia = S.gastos.reduce((a, g) => a + (parseFloat(g.monto_bs_dia) || 0), 0);
      const fijosFijos = S.gastosFijos.filter(g => g.activo !== false && g.activo !== 'FALSE');
      const totFijosUSD = fijosFijos.reduce((a, g) => a + (parseFloat(g.monto_usd) || 0), 0);
      const totalGastosUSD = totGasUSD + totFijosUSD;

      const saldoUSD = totalUSD - totalGastosUSD;
      const saldoBs = totalBs - (totGasBsDia + bsFromUSD(totFijosUSD, bcv));
      const metaUSD = totalUSD * .4, metaBs = totalBs * .4;
      const pct = totalUSD > 0 ? Math.min((Math.max(saldoUSD, 0) / totalUSD) * 100, 100) : 0;

      setEl('a-iusd', fUSD(totalUSD)); setEl('a-ibs', fBs(totalBs));
      setEl('a-gusd', fUSD(totalGastosUSD)); setEl('a-gbs', fBs(totGasBsDia + bsFromUSD(totFijosUSD, bcv)));
      setEl('a-susd', fUSD(saldoUSD)); setEl('a-sbs', fBs(saldoBs));
      setEl('a-meta-usd', fUSD(metaUSD)); setEl('a-meta-bs', fBs(metaBs));
      setEl('a-act-usd', fUSD(Math.max(saldoUSD, 0))); setEl('a-act-bs', fBs(Math.max(saldoBs, 0)));
      document.getElementById('a-bar').style.width = pct + '%';
      setEl('a-pct', pct.toFixed(1) + '%');

      const pctG = totalUSD > 0 ? (totalGastosUSD / totalUSD) * 100 : 0;
      let adv;
      if (!totalUSD) adv = 'Configura tus ingresos para ver el análisis.';
      else if (pct >= 40) adv = `✅ Excelente — ahorras ${pct.toFixed(1)}%. Saldo: ${fUSD(Math.max(saldoUSD, 0))}`;
      else if (pct >= 20) adv = `⚠ Ahorras ${pct.toFixed(1)}%. Para llegar al 40% reduce gastos en ${fUSD(metaUSD - Math.max(saldoUSD, 0))}.`;
      else adv = `🔴 Ahorro ${pct.toFixed(1)}%. Gastos = ${pctG.toFixed(1)}% del ingreso. Meta 40% = ${fUSD(metaUSD)}.`;
      if (totFijosUSD > 0) adv += ` · Gastos fijos: ${fUSD(totFijosUSD)}/mes`;
      setEl('a-adv', adv);

      // Chart data — USD INMUTABLE desde monto_usd guardado, nunca recalculado
      const catMap = {};
      S.gastos.forEach(g => {
        const c = g.categoria || g.cat || 'Otro';
        catMap[c] = (catMap[c] || 0) + (parseFloat(g.monto_usd) || 0);  // USD original
      });
      fijosFijos.forEach(g => {
        const c = g.categoria || 'Fijos';
        catMap[c] = (catMap[c] || 0) + (parseFloat(g.monto_usd) || 0);
      });

      // Semanas: acumular USD original + Bs del día (monto_bs_dia, no recalculado)
      const semsUSD = { 1: 0, 2: 0, 3: 0, 4: 0 };
      const semsBsOrig = { 1: 0, 2: 0, 3: 0, 4: 0 };
      S.gastos.forEach(g => {
        const d = new Date((g.fecha || '') + 'T00:00:00').getDate();
        const s = semDia(d);
        semsUSD[s] += parseFloat(g.monto_usd) || 0;
        semsBsOrig[s] += parseFloat(g.monto_bs_dia) || 0;
      });

      const pal = ['#29b8b0', '#c8a84b', '#4a8ff0', '#44c97e', '#e05c5c', '#a78bfa', '#fb923c', '#f472b6', '#94a3b8'];
      const gc = 'rgba(255,255,255,.04)', tc = '#8fa0be';

      // 1. Doughnut categorías — USD inmutable, Bs referencia en tooltip
      if (CH.cat) CH.cat.destroy();
      if (Object.keys(catMap).length) {
        CH.cat = new Chart(document.getElementById('ch-cat'), {
          type: 'doughnut',
          data: {
            labels: Object.keys(catMap),
            datasets: [{ data: Object.values(catMap), backgroundColor: pal, borderWidth: 0, hoverOffset: 6 }]
          },
          options: {
            responsive: true, maintainAspectRatio: false,
            plugins: {
              legend: { position: 'right', labels: { color: tc, font: { size: 11 }, boxWidth: 10, padding: 8 } },
              tooltip: {
                callbacks: {
                  label: ctx => {
                    // USD: valor principal y exacto
                    // Bs: referencia aproximada con tasa activa (solo orientativo)
                    const usd = ctx.raw;
                    const bsRef = bcv > 0 ? usd * bcv : 0;
                    return [
                      `${fUSD(usd)}`,
                      bsRef > 0 ? `ref. Bs.${N(bsRef)}` : '',
                    ].filter(Boolean);
                  }
                }
              }
            }
          }
        });
      }

      // 2. Flujo mensual — USD en eje, Bs solo tooltip referencia
      if (CH.flow) CH.flow.destroy();
      const ingUSD = [b1, b2, sal, cbs, ay].map(v => usdFromBs(v, bcv));
      CH.flow = new Chart(document.getElementById('ch-flow'), {
        type: 'bar',
        data: {
          labels: ['Bono 1', 'Bono 2', 'Salario', 'Cesta', 'Ayuda', 'G.Variable', 'G.Fijos', 'Meta 40%'],
          datasets: [{
            data: [...ingUSD, -totGasUSD, -totFijosUSD, metaUSD],
            backgroundColor: ['#29b8b066', '#29b8b044', '#4a8ff066', '#c8a84b66', '#c8a84b44', '#e05c5c88', '#e05c5c55', '#44c97e88'],
            borderRadius: 5, borderWidth: 0,
          }]
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: {
                label: ctx => {
                  const usd = Math.abs(ctx.raw);
                  const bsRef = bcv > 0 ? usd * bcv : 0;
                  return [fUSD(usd), bsRef > 0 ? `ref. Bs.${N(bsRef)}` : ''].filter(Boolean);
                }
              }
            }
          },
          scales: {
            x: { ticks: { color: tc, font: { size: 11 } }, grid: { color: gc } },
            y: { ticks: { color: tc, callback: v => `$ ${N(Math.abs(v))}` }, grid: { color: gc } }
          }
        }
      });

      // 3. Semanal — barras USD (inmutables), línea Bs del día (no recalculada)
      if (CH.week) CH.week.destroy();
      CH.week = new Chart(document.getElementById('ch-week'), {
        type: 'bar',
        data: {
          labels: ['Sem 1', 'Sem 2', 'Sem 3', 'Sem 4'],
          datasets: [
            {
              label: 'USD (original)',
              data: Object.values(semsUSD),
              backgroundColor: '#e05c5c55', borderColor: '#e05c5c',
              borderWidth: 1.5, borderRadius: 5, yAxisID: 'y',
            },
            {
              // Bs del día real — línea muy discreta, solo referencia
              label: 'Bs. (ref.)',
              data: Object.values(semsBsOrig),
              type: 'line',
              borderColor: 'rgba(200,168,75,.35)',
              backgroundColor: 'rgba(200,168,75,.03)',
              borderWidth: 1, borderDash: [4, 4],
              pointRadius: 2, pointBackgroundColor: 'rgba(200,168,75,.4)',
              tension: .35, fill: false, yAxisID: 'y2',
            }
          ]
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: {
            legend: {
              labels: {
                color: tc, font: { size: 11 }, boxWidth: 10,
                // Bs en leyenda también discreta
                generateLabels: chart => chart.data.datasets.map((ds, i) => ({
                  text: ds.label,
                  fillStyle: i === 0 ? '#e05c5c' : 'rgba(200,168,75,.4)',
                  strokeStyle: i === 0 ? '#e05c5c' : 'rgba(200,168,75,.4)',
                  lineWidth: i === 0 ? 0 : 1,
                  fontColor: i === 0 ? tc : 'rgba(143,160,190,.45)',
                  hidden: false, index: i,
                }))
              }
            },
            tooltip: {
              callbacks: {
                label: ctx =>
                  ctx.datasetIndex === 0
                    ? `${fUSD(ctx.raw)}`           // USD: claro y exacto
                    : `ref. Bs.${N(ctx.raw)}`      // Bs: referencia, prefijo "ref."
              }
            }
          },
          scales: {
            y: { position: 'left', ticks: { color: '#e05c5c', callback: v => `$ ${N(v)}` }, grid: { color: gc } },
            y2: { position: 'right', ticks: { color: 'rgba(200,168,75,.35)', callback: v => `Bs.${N(v)}`, font: { size: 10 } }, grid: { display: false } },
            x: { ticks: { color: tc }, grid: { color: gc } }
          }
        }
      });

      // 4. Composición ingresos
      if (CH.ing) CH.ing.destroy();
      const ingComp = [
        { l: 'Bono 1', v: usdFromBs(b1, bcv) }, { l: 'Bono 2', v: usdFromBs(b2, bcv) },
        { l: 'Salario', v: usdFromBs(sal, bcv) }, { l: 'Cesta', v: usdFromBs(cbs, bcv) }, { l: 'Ayuda', v: usdFromBs(ay, bcv) },
      ].filter(x => x.v > 0);
      if (ingComp.length) {
        const tot = ingComp.reduce((a, x) => a + x.v, 0);
        CH.ing = new Chart(document.getElementById('ch-ing'), {
          type: 'doughnut',
          data: { labels: ingComp.map(x => x.l), datasets: [{ data: ingComp.map(x => x.v), backgroundColor: ['#c8a84b', '#c8a84b88', '#4a8ff0', '#29b8b0', '#29b8b088'], borderWidth: 0, hoverOffset: 6 }] },
          options: {
            responsive: true, maintainAspectRatio: false,
            plugins: {
              legend: { position: 'right', labels: { color: tc, font: { size: 11 }, boxWidth: 10, padding: 8 } },
              tooltip: { callbacks: { label: ctx => [fUSD(ctx.raw) + ` (${((ctx.raw / tot) * 100).toFixed(1)}%)`, `Bs. ${N(ctx.raw * bcv)}`] } }
            }
          }
        });
      }
    }

    // ═══════════════════════════════════════════════════════════
    //  HISTÓRICO TASAS
    // ═══════════════════════════════════════════════════════════
    async function cargarTasasHistoricas() {
      showLoading('Cargando historial de tasas...');
      try {
        const res = await apiGet('getTasas');
        if (res && res.status === 'ok' && Array.isArray(res.data)) {
          S.tasasHistoricas = res.data
            .map(t => ({ fecha: String(t.fecha || ''), tasa: parseFloat(t.tasa) || 0, fuente: t.fuente || 'BCV' }))
            .filter(t => t.fecha && t.tasa > 0)
            .sort((a, b) => b.fecha.localeCompare(a.fecha));
          lsSave();
          setSyncState('ok');
          poblarSelectorTasas();
          renderTasasList();
        }
      } catch (e) {
        console.error("Error cargando tasas:", e);
        setSyncState('err', 'Error al sincronizar');
      } finally {
        hideLoading();
      }
    }

    function renderTasasList() {
      const cont = document.getElementById('ht-list');
      setEl('ht-activa', S.bcv > 0 ? `Bs. ${N(S.bcv)}` : '—');
      setEl('ht-activa-fecha', S.bcvDate || '—');

      if (!S.tasasHistoricas.length) {
        cont.innerHTML = '<div class="muted small" style="text-align:center;padding:1.5rem;">Sin tasas registradas. Guarda tu primera tasa desde Configuración.</div>';
        return;
      }
      cont.innerHTML = S.tasasHistoricas.map(t => {
        const isActive = t.fecha === S.bcvDate;
        return `<div class="tasa-row ${isActive ? 'active-tasa' : ''}">
      <div>
        <div class="mono" style="font-size:.9rem;color:${isActive ? 'var(--gold2)' : 'var(--text)'};">Bs. ${N(t.tasa)} / USD</div>
        <div class="xs muted">${t.fecha} · ${t.fuente || 'BCV'} ${isActive ? '· <span style="color:var(--gold2);">ACTIVA</span>' : ''}</div>
      </div>
      <div style="display:flex;gap:.5rem;">
        <button class="btn btn-t btn-sm" onclick="usarTasaHistorica('${t.fecha}',${t.tasa})">Usar</button>
      </div>
    </div>`;
      }).join('');
    }

    function usarTasaHistorica(fecha, tasa) {
      S.tasaVista = tasa;
      // Navegar a resumen con esa tasa
      const sel = document.getElementById('sel-tasa-hist');
      if (sel) { sel.value = fecha; setEl('sel-tasa-info', `Bs. ${N(tasa)} / USD · ${fecha}`); }
      nav(document.querySelector('.nav-btn:nth-child(2)'), 'resumen');
      renderResumen();
    }

    async function buscarTasaHistorica() {
      const fecha = document.getElementById('ht-fecha').value;
      if (!fecha) { alert('Selecciona una fecha.'); return; }
      showStatus('ht-status', 'loading', '⟳ Buscando en API histórica...');

      // Primero buscar en caché local
      const local = S.tasasHistoricas.find(t => t.fecha === fecha);
      if (local) {
        showStatus('ht-status', 'ok', `✓ Encontrada en historial local: Bs. ${N(local.tasa)} / USD`);
        return;
      }

      // Buscar en API histórica de dolarapi.com
      const resultado = await fetchTasaHistoricaAPI(fecha);
      if (resultado) {
        showStatus('ht-status', 'ok', `✓ Encontrada en API: Bs. ${N(resultado.rate)} / USD · ${resultado.fecha}`);
        // Guardar en Sheets automáticamente
        try {
          await apiPost('saveTasa', { fecha: resultado.fecha, tasa: resultado.rate, fuente: resultado.fuente });
          S.tasasHistoricas.unshift({ fecha: resultado.fecha, tasa: resultado.rate, fuente: resultado.fuente });
          S.tasasHistoricas.sort((a, b) => b.fecha.localeCompare(a.fecha));
          lsSave(); renderTasasList(); poblarSelectorTasas();
          showStatus('ht-status', 'ok', `✓ Tasa ${resultado.fecha}: Bs. ${N(resultado.rate)} guardada automáticamente.`);
        } catch { showStatus('ht-status', 'warn', `⚠ Tasa encontrada (${N(resultado.rate)}) pero no se pudo guardar en Sheets.`); }
      } else {
        showStatus('ht-status', 'error', `⚠ No se encontró tasa para ${fecha} en la API. Intenta otra fecha o ingrésala manualmente.`);
      }
    }

    async function guardarTasaManual() {
      const fecha = document.getElementById('ht-fecha').value;
      const statusEl = document.getElementById('ht-status');
      statusEl.style.display = 'block';
      const tasa = prompt(`Ingresa la tasa BCV manualmente para ${fecha || 'la fecha seleccionada'} (Bs. por USD):`);
      if (!tasa || isNaN(parseFloat(tasa))) return;
      const t = parseFloat(tasa);
      showStatus('ht-status', 'loading', '⟳ Guardando...');
      try {
        await apiPost('saveTasa', { fecha, tasa: t, fuente: 'Manual' });
        S.tasasHistoricas.unshift({ fecha, tasa: t, fuente: 'Manual' });
        S.tasasHistoricas.sort((a, b) => b.fecha.localeCompare(a.fecha));
        lsSave(); renderTasasList(); poblarSelectorTasas();
        showStatus('ht-status', 'ok', `✓ Tasa manual Bs. ${N(t)} para ${fecha} guardada.`);
      } catch { showStatus('ht-status', 'error', '⚠ Error guardando en Sheets.'); }
    }

    // ═══════════════════════════════════════════════════════════
    //  HISTÓRICO SALARIOS
    // ═══════════════════════════════════════════════════════════
    async function cargarHistorialSalarios() {
      showLoading('Cargando historial de salarios...');
      try {
        const res = await apiGet('getSalarios');
        if (res && res.status === 'ok' && Array.isArray(res.data)) {
          S.salarios = res.data.sort((a, b) => String(b.fecha || '').localeCompare(String(a.fecha || '')));
          lsSave();
          setSyncState('ok');
          renderHistorialSalarios();
        }
      } catch (e) {
        console.error("Error cargando salarios:", e);
        setSyncState('err', 'Error al sincronizar');
      } finally {
        hideLoading();
      }
    }

    function renderHistorialSalarios() {
      if (!S.salarios.length) {
        document.getElementById('hs-list').innerHTML = '<div class="muted small" style="text-align:center;padding:1.5rem;">Sin historial. Guarda tu configuración para registrar el primer snapshot.</div>';
        return;
      }

      const ultimo = S.salarios[0];
      setEl('hs-sal-usd', fUSD(parseFloat(ultimo.salario_usd) || 0));
      setEl('hs-sal-bs', fBs(parseFloat(ultimo.salario_bs) || 0));
      setEl('hs-tasa', `Bs. ${N(parseFloat(ultimo.tasa_dia) || 0)}`);
      setEl('hs-tasa-fecha', ultimo.fecha || '—');
      setEl('hs-total-usd', fUSD(parseFloat(ultimo.total_usd) || 0));
      setEl('hs-total-bs', fBs(parseFloat(ultimo.total_bs) || 0));

      document.getElementById('hs-list').innerHTML = S.salarios.map((s, i) => {
        const isLatest = i === 0;
        const salUSD = parseFloat(s.salario_usd) || 0;
        const salBs = parseFloat(s.salario_bs) || 0;
        const totUSD = parseFloat(s.total_usd) || 0;
        const tasaDia = parseFloat(s.tasa_dia) || 0;
        const prev = S.salarios[i + 1];
        const diff = prev ? salUSD - (parseFloat(prev.salario_usd) || 0) : null;

        return `<div class="sal-card ${isLatest ? 'latest' : ''}">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:.6rem;">
        <div>
          <div style="font-size:.85rem;font-weight:600;color:${isLatest ? 'var(--green)' : 'var(--text)'};">${s.fecha || '—'} ${isLatest ? '<span class="bdg bdg-g">ACTUAL</span>' : ''}</div>
          <div class="xs muted">Tasa del día: Bs. ${N(tasaDia)} / USD</div>
          ${s.notas ? `<div class="xs" style="color:var(--text2);margin-top:.2rem;font-style:italic;">"${s.notas}"</div>` : ''}
        </div>
        <div style="text-align:right;">
          ${diff !== null ? `<div class="xs ${diff >= 0 ? 'green' : 'red'}">${diff >= 0 ? '▲' : '▼'} ${fUSD(Math.abs(diff))}</div>` : ''}
        </div>
      </div>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:.5rem;">
        <div><div class="xs muted">Salario</div><div class="mono teal xs">${fUSD(salUSD)}</div><div class="mono gold xs">${fBs(salBs)}</div></div>
        <div><div class="xs muted">Bonos</div><div class="mono teal xs">${fUSD((parseFloat(s.bono1_usd) || 0) + (parseFloat(s.bono2_usd) || 0))}</div></div>
        <div><div class="xs muted">Total c/beneficios</div><div class="mono teal xs">${fUSD(totUSD)}</div><div class="mono gold xs">${fBs(parseFloat(s.total_bs) || 0)}</div></div>
      </div>
    </div>`;
      }).join('');

      // Gráfica evolución
      renderGraficaSalarios();
    }

    function renderGraficaSalarios() {
      if (CH.sal) CH.sal.destroy();
      if (!S.salarios.length) return;
      const sorted = [...S.salarios].reverse();
      const tc = '#8fa0be', gc = 'rgba(255,255,255,.04)';
      CH.sal = new Chart(document.getElementById('ch-sal'), {
        type: 'line',
        data: {
          labels: sorted.map(s => s.fecha || ''),
          datasets: [
            { label: 'Salario USD', data: sorted.map(s => parseFloat(s.salario_usd) || 0), borderColor: '#4a8ff0', backgroundColor: 'rgba(74,143,240,.08)', borderWidth: 2, pointBackgroundColor: '#4a8ff0', tension: .35, fill: true },
            { label: 'Total USD', data: sorted.map(s => parseFloat(s.total_usd) || 0), borderColor: '#44c97e', backgroundColor: 'rgba(68,201,126,.05)', borderWidth: 2, pointBackgroundColor: '#44c97e', tension: .35, fill: false },
          ]
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: {
            legend: { labels: { color: tc, font: { size: 11 }, boxWidth: 10 } },
            tooltip: { callbacks: { label: ctx => [fUSD(ctx.raw), `Bs. ${N(ctx.raw * (sorted[ctx.dataIndex]?.tasa_dia || S.bcv))}`] } }
          },
          scales: {
            x: { ticks: { color: tc, maxRotation: 45 }, grid: { color: gc } },
            y: { ticks: { color: tc, callback: v => `$ ${N(v)}` }, grid: { color: gc } }
          }
        }
      });
    }

    // ═══════════════════════════════════════════════════════════
    //  NAV
    // ═══════════════════════════════════════════════════════════
    function nav(btn, pid) {
      document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById('page-' + pid).classList.add('active');
      // Lazy render on nav
      if (pid === 'htasas') renderTasasList();
      if (pid === 'hsalarios') renderHistorialSalarios();
      if (pid === 'fijos') renderGastosFijos();
    }

    // ═══════════════════════════════════════════════════════════
    //  HELPERS UI
    // ═══════════════════════════════════════════════════════════
    function showStatus(id, type, msg) {
      const el = document.getElementById(id);
      if (!el) return;
      const styles = {
        ok: 'background:rgba(68,201,126,.08);color:var(--green);border:1px solid rgba(68,201,126,.2);',
        loading: 'background:rgba(41,184,176,.08);color:var(--teal);border:1px solid rgba(41,184,176,.2);',
        warn: 'background:rgba(200,168,75,.08);color:var(--gold2);border:1px solid rgba(200,168,75,.2);',
        error: 'background:rgba(224,92,92,.08);color:var(--red);border:1px solid rgba(224,92,92,.2);',
      };
      el.style.cssText = 'display:block;margin-top:.9rem;font-size:.8rem;padding:.7rem 1rem;border-radius:8px;' + (styles[type] || styles.ok);
      el.textContent = msg;
    }
    let loadingTimer = null;
    let forceBtnTimer = null;
    function showLoading(msg) {
      const overlay = document.getElementById('loading-overlay');
      const btn = document.getElementById('btn-force-close');
      if (!overlay) return;
      overlay.classList.add('open');
      if (btn) btn.style.display = 'none';
      setEl('loading-msg', msg || 'Cargando...');

      if (loadingTimer) clearTimeout(loadingTimer);
      if (forceBtnTimer) clearTimeout(forceBtnTimer);

      // Mostrar botón "X" tras 5s
      forceBtnTimer = setTimeout(() => {
        if (btn) btn.style.display = 'inline-block';
      }, 5000);

      // Forzar cierre tras 12s
      loadingTimer = setTimeout(() => {
        hideLoading();
      }, 12000);
    }
    function hideLoading() {
      const overlay = document.getElementById('loading-overlay');
      if (overlay) overlay.classList.remove('open');
      if (loadingTimer) clearTimeout(loadingTimer);
      if (forceBtnTimer) clearTimeout(forceBtnTimer);
    }

    // Ejecutar listener de auth de inmediato para capturar redirect de Supabase
    onAuthStateChange();

    // window.onload para lógica adicional si es necesaria
    window.onload = () => {
      // Ya no se llama aquí onAuthStateChange()
    };

    // ═══════════════════════════════════════════════════════════
    //  PWA — Service Worker externo + Install prompt
    // ═══════════════════════════════════════════════════════════
    // Toggle dropdown usuario
    function toggleUserMenu() {
      const dd = document.getElementById('user-dropdown');
      if (dd) dd.classList.toggle('open');
    }
    document.addEventListener('click', e => {
      const menu = document.getElementById('user-dropdown');
      const btn = document.getElementById('user-avatar');
      if (menu && btn && !menu.contains(e.target) && !btn.contains(e.target)) {
        menu.classList.remove('open');
      }
    });

    // Auto-actualización SW
    let swWaitingWorker = null;
    function applyUpdate() {
      if (swWaitingWorker) {
        swWaitingWorker.postMessage({ type: 'SKIP_WAITING' });
        swWaitingWorker = null;
      }
      document.getElementById('update-banner')?.classList.remove('show');
      setTimeout(() => window.location.reload(), 300);
    }

    (function initPWA() {
      // Ícono canvas para Apple
      function makeIcon(size) {
        const c = document.createElement('canvas');
        c.width = c.height = size;
        const ctx = c.getContext('2d');
        const r = size * 0.18;
        ctx.fillStyle = '#0b1120';
        ctx.beginPath();
        ctx.moveTo(r, 0); ctx.lineTo(size - r, 0);
        ctx.quadraticCurveTo(size, 0, size, r);
        ctx.lineTo(size, size - r); ctx.quadraticCurveTo(size, size, size - r, size);
        ctx.lineTo(r, size); ctx.quadraticCurveTo(0, size, 0, size - r);
        ctx.lineTo(0, r); ctx.quadraticCurveTo(0, 0, r, 0);
        ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#c8a84b';
        ctx.font = `bold ${Math.round(size * 0.3)}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('FVE', size / 2, size / 2);
        return c.toDataURL('image/png');
      }
      const appleIcon = document.getElementById('apple-icon');
      if (appleIcon) appleIcon.href = makeIcon(180);

      // Registrar sw.js — con detección de nueva versión
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('./sw.js').then(reg => {
          // Nueva versión encontrada mientras usas la app
          reg.addEventListener('updatefound', () => {
            const nw = reg.installing;
            nw.addEventListener('statechange', () => {
              if (nw.state === 'installed' && navigator.serviceWorker.controller) {
                swWaitingWorker = nw;
                document.getElementById('update-banner')?.classList.add('show');
              }
            });
          });
          // Ya había una versión esperando al abrir
          if (reg.waiting && navigator.serviceWorker.controller) {
            swWaitingWorker = reg.waiting;
            document.getElementById('update-banner')?.classList.add('show');
          }
          navigator.serviceWorker.addEventListener('controllerchange', () => window.location.reload());
        }).catch(() => { });
      }

      // Prompt de instalación Android Chrome
      let deferredPrompt = null;
      window.addEventListener('beforeinstallprompt', e => {
        e.preventDefault();
        deferredPrompt = e;
        const btn = document.getElementById('pwa-install-btn');
        if (btn) btn.style.display = 'flex';
      });
      window.addEventListener('appinstalled', () => {
        deferredPrompt = null;
        const btn = document.getElementById('pwa-install-btn');
        if (btn) btn.style.display = 'none';
      });
      window.installPWA = async () => {
        if (!deferredPrompt) {
          alert('En iPhone/iPad:\n1. Toca el botón Compartir \u{1F4E4}\n2. Selecciona "Añadir a pantalla de inicio"');
          return;
        }
        await deferredPrompt.prompt();
        deferredPrompt = null;
        const btn = document.getElementById('pwa-install-btn');
        if (btn) btn.style.display = 'none';
      };
    })();
  
