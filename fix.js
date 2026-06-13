const fs = require('fs');

const content = fs.readFileSync('main.js', 'utf8');
const lines = content.split('\n');

const clean_lines = lines.slice(0, 2476);
clean_lines.push("      }");
clean_lines.push("    });\n");

function extract_func(name, is_async=false) {
    let prefix = is_async ? `async function ${name}(` : `function ${name}(`;
    if (name === 'initPWA') prefix = "(function initPWA() {";
    
    let start_idx = content.indexOf(prefix);
    if (start_idx === -1) return "";
    
    let brace_count = 0;
    let in_block = false;
    for (let i = start_idx; i < content.length; i++) {
        if (content[i] === '{') {
            brace_count++;
            in_block = true;
        } else if (content[i] === '}') {
            brace_count--;
        }
        
        if (in_block && brace_count === 0) {
            if (name === 'initPWA') return content.substring(start_idx, i+1) + ")();\n";
            return content.substring(start_idx, i+1) + "\n";
        }
    }
    return "";
}

const applyUpdate_code = extract_func("applyUpdate");
const delDeudaLocal_code = extract_func("delDeudaLocal", true);
const renderDeudas_code = extract_func("renderDeudas");
const renderDashboard_code = extract_func("renderDashboard");
const initPWA_code = extract_func("initPWA");

const addDeuda_code = `    async function addDeuda() {
      const nombre = document.getElementById('deuda-nombre').value.trim();
      const monto = parseFloat(document.getElementById('deuda-monto').value) || 0;
      const tipo = document.getElementById('deuda-tipo').value;

      if (!nombre || !monto) { alert('Completa nombre y monto.'); return; }

      const d = { id: 'deu_' + Date.now(), nombre, monto_usd: monto, tipo, activa: true, fecha: new Date().toISOString() };
      S.deudas = S.deudas || [];
      S.deudas.unshift(d);
      lsSave();
      renderDeudas();
      renderDashboard();

      document.getElementById('deuda-nombre').value = '';
      document.getElementById('deuda-monto').value = '';

      setSyncState('loading', 'Guardando deuda...');
      try {
        const res = await apiPost('saveDeuda', { nombre, tipo, monto_usd: monto });
        if (res && res.status === 'ok') {
          const idx = S.deudas.findIndex(x => x.id === d.id);
          if (idx >= 0) S.deudas[idx].id = res.data.id;
          lsSave();
          renderDeudas();
          setSyncState('ok');
        } else {
          setSyncState('err', 'Pendiente');
        }
      } catch (err) {
        setSyncState('err', 'Sin conexión');
      }
    }
`;

const final_content = clean_lines.join('\n') + "\n    let swWaitingWorker = null;\n" + 
  applyUpdate_code + "\n" + 
  addDeuda_code + "\n" + 
  delDeudaLocal_code + "\n" + 
  renderDeudas_code + "\n" + 
  renderDashboard_code + "\n" + 
  initPWA_code + "\n";

fs.writeFileSync('main_fixed.js', final_content, 'utf8');
