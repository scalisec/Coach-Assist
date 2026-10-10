// Loading the big libraries only when needed, and handing files to the coach.

const loading = {};
export function loadScript(src, globalName) {
  if (window[globalName]) return Promise.resolve(window[globalName]);
  loading[src] ||= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = () => resolve(window[globalName]);
    s.onerror = () => { delete loading[src]; reject(new Error('Could not load a needed part of the app. Check your connection.')); };
    document.head.append(s);
  });
  return loading[src];
}

export const loadExcel = () => loadScript('src/vendor/exceljs.min.js', 'ExcelJS');
export const loadPdf = () => loadScript('src/vendor/pdf-lib.min.js', 'PDFLib');

export async function fetchBytes(path) {
  const r = await fetch(path);
  if (!r.ok) throw new Error(`Could not load ${path.split('/').pop()}`);
  return r.arrayBuffer();
}

// Ask the coach for a file. Resolves with a File, or null if they cancel.
export function pickFile(accept) {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.style.display = 'none';
    input.addEventListener('change', () => { resolve(input.files[0] || null); input.remove(); });
    input.addEventListener('cancel', () => { resolve(null); input.remove(); });
    document.body.append(input);
    input.click();
  });
}

// Share on phones that can; otherwise download.
export async function deliverFile(blob, name, type) {
  const file = new File([blob], name, { type });
  if (navigator.canShare?.({ files: [file] }) && matchMedia('(pointer: coarse)').matches) {
    try { await navigator.share({ files: [file], title: name }); return 'shared'; } catch { /* cancelled: fall through to download */ }
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url; a.download = name; a.style.display = 'none';
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
  return 'downloaded';
}
