import re
import sys

with open('main.js', 'r', encoding='utf-8') as f:
    lines = f.readlines()

# The clean part of main.js is from line 1 to 2476
clean_lines = lines[:2476]

# Close the event listener that was left unclosed at 2476
clean_lines.append("      }\n")
clean_lines.append("    });\n\n")

# Now extract the functions from the rest of the file
content = "".join(lines)

def extract_func(name, is_async=False):
    prefix = f"async function {name}(" if is_async else f"function {name}("
    if name == 'initPWA':
        prefix = "(function initPWA() {"
    
    start_idx = content.find(prefix)
    if start_idx == -1:
        return ""
    
    # Simple brace counting to extract the whole block
    brace_count = 0
    in_block = False
    for i in range(start_idx, len(content)):
        if content[i] == '{':
            brace_count += 1
            in_block = True
        elif content[i] == '}':
            brace_count -= 1
        
        if in_block and brace_count == 0:
            if name == 'initPWA':
                return content[start_idx:i+1] + ")();\n"
            return content[start_idx:i+1] + "\n"
    return ""

applyUpdate_code = extract_func("applyUpdate")
delDeudaLocal_code = extract_func("delDeudaLocal", True)
renderDeudas_code = extract_func("renderDeudas")
renderDashboard_code = extract_func("renderDashboard")
initPWA_code = extract_func("initPWA")

# addDeuda is broken, so we extract up to the try block manually or just fix the string
addDeuda_start = content.find("async function addDeuda() {")
addDeuda_end = content.find("console.error(\"Error al inicializar Supabase:\", err);", addDeuda_start)
# We know how addDeuda should look:
addDeuda_code = """    async function addDeuda() {
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
"""

with open('main_fixed.js', 'w', encoding='utf-8') as f:
    f.writelines(clean_lines)
    f.write("    let swWaitingWorker = null;\n")
    f.write(applyUpdate_code)
    f.write("\n")
    f.write(addDeuda_code)
    f.write("\n")
    f.write(delDeudaLocal_code)
    f.write("\n")
    f.write(renderDeudas_code)
    f.write("\n")
    f.write(renderDashboard_code)
    f.write("\n")
    f.write(initPWA_code)
    f.write("\n")
