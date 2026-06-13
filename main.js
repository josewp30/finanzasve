// ═══════════════════════════════════════════════════════════
//  SUPABASE — AUTH + DB
// ═══════════════════════════════════════════════════════════
const SB_URL = 'https://tdcpdjhwvpkrxgmnpftv.supabase.co';
const SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRkY3Bkamh3dnBrcnhnbW5wZnR2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMzNTUwMzEsImV4cCI6MjA4ODkzMTAzMX0.YqdHUV2O0ELXd1wJJTzTRvNUA06G6F2xlLJ33T9lMD8';
let sb = null;
if (typeof supabase !== 'undefined') {
  try {
    sb = supabase.createClient(SB_URL, SB_KEY, {
      auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true,
        flowType: 'pkce',
      }
    });
  } catch (err) {
    console.error("Error al inicializar Supabase:", err);
  }
} else {
  console.warn("Supabase no está disponible (ejecutando en modo offline).");
}

let currentUser = null;

// ── Auth helpers ──────────────────────────────────────────
async function signUp(email, password) {
  if (!sb) throw new Error('El servicio de base de datos no está disponible.');
  const { data, error } = await sb.auth.signUp({ email, password });
  if (error) throw new Error(error.message);
  return data;
}

async function signIn(email, password) {
  if (!sb) throw new Error('El servicio de base de datos no está disponible.');
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error) throw new Error(error.message);
  return data;
}

async function signOut() {
  // 1. Limpiar local primero
  if (currentUser && currentUser.id) {
    localStorage.removeItem('fve4_' + currentUser.id);
  }
  localStorage.removeItem(LS_KEY);

  // 2. Limpiar llaves de Supabase del localStorage
  Object.keys(localStorage).forEach(key => {
    if (key.startsWith('sb-') && key.endsWith('-auth-token')) {
      localStorage.removeItem(key);
    }
  });

  // 3. Llamar signOut en Supabase
  if (sb) {
    try { await sb.auth.signOut(); } catch (e) { console.warn("signOut error:", e); }
  }

  // 4. Desregistrar SWs
  if ('serviceWorker' in navigator) {
    try {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map(r => r.unregister()));
    } catch (e) { console.warn("SW unregister error:", e); }
  }

  appInitialized = false;
  currentUser = null;

  // 5. Reload limpio
  window.location.reload();
}

let appInitialized = false;
let isInitializing = false;

// ═══════════════════════════════════════════════════════════
//  ARRANQUE PRINCIPAL — FIX del bug de sesión
//  El problema: onAuthStateChange se llama ANTES de que
//  Supabase termine de restaurar la sesión del storage.
//  Solución: usar getSession() para restaurar PRIMERO,
//  y solo ENTONCES registrar el listener.
// ═══════════════════════════════════════════════════════════
async function startApp() {
  if (!sb) {
    // Sin Supabase disponible, mostrar pantalla de login con aviso
    showAuthScreen();
    showAuthErr("Modo Local: El servicio de base de datos no está disponible.", "ok");
    return;
  }

  // Limpiar URL si viene con ?code= de PKCE para evitar re-procesarlo
  const url = new URL(window.location.href);
  if (url.searchParams.has('code')) {
    // Supabase lo procesa internamente; una vez procesado limpiamos la URL
    // para que un F5 no intente re-intercambiar el mismo code (ya expirado)
    try {
      await sb.auth.exchangeCodeForSession(url.searchParams.get('code'));
    } catch (e) {
      console.warn("[auth] exchangeCodeForSession error (puede ser normal si ya se procesó):", e.message);
    }
    url.searchParams.delete('code');
    url.searchParams.delete('state');
    window.history.replaceState({}, '', url.toString());
  }

  // Intentar restaurar sesión existente del storage
  showLoading('Conectando...');
  let restoredSession = null;
  try {
    const { data, error } = await sb.auth.getSession();
    if (!error && data?.session) {
      restoredSession = data.session;
    }
  } catch (e) {
    console.warn("[auth] getSession() error:", e);
  }

  if (restoredSession) {
    // Sesión válida encontrada en storage → iniciar app directamente
    currentUser = restoredSession.user;
    await _onUserReady(restoredSession.user);
  } else {
    // Sin sesión → mostrar pantalla de login
    hideLoading();
    showAuthScreen();
  }

  // Registrar listener DESPUÉS de haber procesado la sesión inicial
  // Esto evita el race condition donde el listener reacciona a eventos
  // intermedios (TOKEN_REFRESHED, INITIAL_SESSION) y llama showAuthScreen()
  sb.auth.onAuthStateChange(async (event, session) => {
    console.log('[auth] onAuthStateChange:', event, !!session);

    if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') {
      if (session?.user) {
        currentUser = session.user;
        // Actualizar UI de usuario si ya está visible
        _updateUserUI(session.user);
        // Solo inicializar app si aún no está inicializada
        if (!appInitialized && !isInitializing) {
          hideAuthScreen();
          await _onUserReady(session.user);
        }
      }
      return;
    }

    if (event === 'SIGNED_OUT') {
      currentUser = null;
      appInitialized = false;
      isInitializing = false;
      showAuthScreen();
      return;
    }

    if (event === 'INITIAL_SESSION') {
      // Ya lo manejamos con getSession() arriba; ignorar para evitar duplicados
      return;
    }

    if (event === 'PASSWORD_RECOVERY') {
      // Opcional: manejar recuperación de contraseña
      return;
    }
  });
}

async function _onUserReady(user) {
  _updateUserUI(user);
  hideAuthScreen();
  if (!appInitialized && !isInitializing) {
    appInitialized = true;
    await initApp();
  }
}

function _updateUserUI(user) {
  const name = user.user_metadata?.full_name || user.user_metadata?.name || '';
  const email = user.email || '';
  const avatar = document.getElementById('user-avatar');
  if (avatar) avatar.textContent = name
    ? name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
    : email.slice(0, 2).toUpperCase();
  setEl('user-email-lbl', email);
  setEl('user-display-name', name || email.split('@')[0]);
  const userInfo = document.getElementById('user-info');
  if (userInfo) userInfo.style.display = 'flex';
}

// ── Auth UI ───────────────────────────────────────────────
function showAuthScreen() {
  hideLoading();
  document.getElementById('auth-screen').style.display = 'flex';
  document.getElementById('main-app').style.display = 'none';
}

function hideAuthScreen() {
  document.getElementById('auth-screen').style.display = 'none';
  document.getElementById('main-app').style.display = 'flex';
}

async function handleSignIn() {
  const email = document.getElementById('auth-email').value.trim();
  const pass  = document.getElementById('auth-pass').value;
  const btn   = document.getElementById('auth-btn-email');
  if (!email || !pass) { showAuthErr('Ingresa email y contraseña.'); return; }
  btn.disabled = true; btn.textContent = '⟳ Entrando...';
  try {
    await signIn(email, pass);
    // onAuthStateChange se encargará de lo demás
  } catch(e) {
    showAuthErr(e.message.includes('Invalid') ? 'Email o contraseña incorrectos.' : e.message);
    btn.disabled = false; btn.textContent = 'Entrar';
  }
}

async function handleSignUp() {
  const email = document.getElementById('auth-email').value.trim();
  const pass  = document.getElementById('auth-pass').value;
  const btn   = document.getElementById('auth-btn-register');
  if (!email || !pass) { showAuthErr('Ingresa email y contraseña.'); return; }
  if (pass.length < 6) { showAuthErr('La contraseña debe tener al menos 6 caracteres.'); return; }
  btn.disabled = true; btn.textContent = '⟳ Creando cuenta...';
  try {
    await signUp(email, pass);
    showAuthErr('✓ Cuenta creada. Revisa tu email para confirmar.', 'ok');
  } catch(e) {
    showAuthErr(e.message.includes('already') ? 'Este email ya tiene cuenta. Usa "Entrar".' : e.message);
  }
  btn.disabled = false; btn.textContent = 'Crear cuenta';
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

// Lanzar todo cuando el DOM esté listo
window.addEventListener('DOMContentLoaded', () => {
  startApp();
});
