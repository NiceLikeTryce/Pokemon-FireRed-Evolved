'use strict';
(() => {
  const $ = id => document.getElementById(id);
  const themeKey = 'firered-evolved-theme';
  const setTheme = theme => {
    const night = theme === 'dark';
    document.documentElement.dataset.theme = night ? 'dark' : 'light';
    $('theme').textContent = night ? 'Light mode' : 'Night mode';
    $('theme').setAttribute('aria-label', night ? 'Switch to light mode' : 'Switch to night mode');
    $('theme').setAttribute('aria-pressed', String(night));
  };
  let savedTheme;
  try { savedTheme = localStorage.getItem(themeKey); } catch (_) { /* Storage can be unavailable. */ }
  setTheme(['dark', 'light'].includes(savedTheme) ? savedTheme : 'dark');
  $('theme').addEventListener('click', () => {
    const theme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    setTheme(theme);
    try { localStorage.setItem(themeKey, theme); } catch (_) { /* The toggle still works without storage. */ }
  });
  let manifest, patch, original, pendingFile, busy = false, checking = false, selection = 0;
  const patches = new Map();
  const status = (text, state = '') => { $('status').textContent = text; $('status').dataset.state = state; };
  const digest = async (algorithm, bytes) => Array.from(new Uint8Array(await crypto.subtle.digest(algorithm, bytes)), b => b.toString(16).padStart(2, '0')).join('');
  const refresh = () => { $('apply').disabled = !(original && patch) || busy || checking; $('rom').disabled = !manifest || busy; };
  async function attachPatch(source) {
    if (!patches.has(source.patch)) {
      const promise = (async () => {
        const download = await fetch(`assets/${source.patch}`);
        if (!download.ok) throw new Error('Patch download failed. Select your ROM again to retry, or use the BPS downloads below.');
        const bytes = await download.arrayBuffer();
        if (await digest('SHA-256', bytes) !== source.patch_sha256) throw new Error('Patch verification failed. Please reload.');
        const result = BPS.fromFile(new BinFile(bytes));
        if (result.sourceSize !== 16777216 || result.targetSize !== manifest.target_size) throw new Error('Invalid BPS sizes.');
        return result;
      })();
      patches.set(source.patch, promise);
      promise.catch(() => patches.delete(source.patch));
    }
    return patches.get(source.patch);
  }
  async function initialize() {
    try {
      const response = await fetch('release.json', {cache: 'no-store'});
      if (!response.ok) throw new Error('The current patch is unavailable. Please use the BPS downloads.');
      const current = await response.json();
      if (!/^v0\.\d{2,}$/.test(current.version) || !Array.isArray(current.sources) || current.sources.length !== 2
          || new Set(current.sources.map(s => s.revision)).size !== 2
          || !current.sources.every(s => ['v1.0', 'v1.1'].includes(s.revision) && /^[a-f0-9]{40}$/.test(s.base_sha1)
            && /^[a-f0-9]{64}$/.test(s.patch_sha256) && /^[A-Za-z0-9_.-]+\.bps$/.test(s.patch))) throw new Error('Invalid patch information.');
      manifest = current;
      $('version').textContent = `Game ${manifest.version}`;
      $('download').href = manifest.package_url;
      status('');
      refresh();
      if (pendingFile) { const file = pendingFile; pendingFile = null; await checkROM(file); }
    } catch (error) { manifest = null; patch = null; refresh(); status(error.message, 'error'); }
  }
  async function checkROM(file) {
    if (busy) return;
    if (!manifest) { pendingFile = file; status('Loading patch information\u2026'); return; }
    const current = ++selection;
    original = null; patch = null; checking = Boolean(file);
    $('selected').textContent = 'Patch your game'; delete $('selected').dataset.patch;
    refresh();
    if (!file) { status(''); return; }
    try {
      status('Checking your ROM\u2026');
      if (file.size !== 16777216) throw new Error('Use your original clean US/English FireRed v1.0 or v1.1 ROM.');
      const bytes = await file.arrayBuffer();
      const sha1 = await digest('SHA-1', bytes);
      if (current !== selection) return;
      const source = manifest.sources.find(s => s.base_sha1 === sha1);
      if (!source) throw new Error('This is not a clean US/English FireRed v1.0 or v1.1 ROM. Use the original, unpatched file.');
      $('selected').textContent = `Detected FireRed ${source.revision}`;
      status(`FireRed ${source.revision} detected. Attaching the matching patch\u2026`);
      const matchingPatch = await attachPatch(source);
      if (current !== selection) return;
      const candidate = new BinFile(bytes);
      if (!matchingPatch.validateSource(candidate)) throw new Error('The ROM does not match this BPS patch.');
      original = candidate; patch = matchingPatch; $('selected').dataset.patch = source.patch;
      status(`FireRed ${source.revision} verified. Ready to patch.`, 'success');
    } catch (error) {
      if (current !== selection) return;
      original = null; patch = null; $('selected').textContent = 'Patch your game';
      status(error.message, 'error');
    } finally { if (current === selection) { checking = false; refresh(); } }
  }
  $('rom').addEventListener('change', () => checkROM($('rom').files[0]));
  $('drop-zone').addEventListener('dragover', event => { event.preventDefault(); $('drop-zone').dataset.dragging = 'true'; });
  $('drop-zone').addEventListener('dragleave', () => { delete $('drop-zone').dataset.dragging; });
  $('drop-zone').addEventListener('drop', event => {
    event.preventDefault(); delete $('drop-zone').dataset.dragging;
    if (!busy) $('rom').files = event.dataTransfer.files;
    return checkROM(event.dataTransfer.files[0]);
  });
  $('apply').addEventListener('click', async () => {
    if (!original || !patch || busy) return;
    busy = true; refresh(); status('Patching your game\u2026');
    try {
      await new Promise(resolve => setTimeout(resolve, 0));
      const result = patch.apply(original, true);
      const bytes = result._u8array;
      if (result.fileSize !== manifest.target_size || await digest('SHA-1', bytes) !== manifest.target_sha1 || await digest('SHA-256', bytes) !== manifest.target_sha256)
        throw new Error('Output verification failed. No game was downloaded.');
      const url = URL.createObjectURL(new Blob([bytes], {type: 'application/octet-stream'}));
      const link = document.createElement('a'); link.href = url; link.download = `Pokemon_FireRed_Evolved_${manifest.version}.gba`;
      document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 60000);
      status('Done! Open the downloaded game in your GBA emulator.', 'success');
    } catch (error) { status(error.message, 'error'); }
    finally { busy = false; refresh(); }
  });
  initialize();
})();
