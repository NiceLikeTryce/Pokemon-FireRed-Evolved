'use strict';
(() => {
  const $ = id => document.getElementById(id);
  const base = new URLSearchParams(location.search).get('base');
  let manifest, source, patch, original, busy = false;
  const status = (text, state = '') => { $('status').textContent = text; $('status').dataset.state = state; };
  const digest = async (algorithm, bytes) => Array.from(new Uint8Array(await crypto.subtle.digest(algorithm, bytes)), b => b.toString(16).padStart(2, '0')).join('');
  const refresh = () => { $('apply').disabled = !(original && patch) || busy; $('rom').disabled = !patch || busy; };
  async function initialize() {
    try {
      const response = await fetch('release.json', {cache: 'no-store'});
      if (!response.ok) throw new Error('The current patch is unavailable. Please use the BPS downloads.');
      manifest = await response.json();
      if (!/^v0\.\d{2}$/.test(manifest.version) || manifest.sources.length !== 2) throw new Error('Invalid patch information.');
      $('version').textContent = `Game ${manifest.version}`;
      $('download').href = manifest.package_url;
      if (!['1.0', '1.1'].includes(base)) { status('Choose FireRed v1.0 or v1.1 above.'); return; }
      source = manifest.sources.find(s => s.revision === `v${base}`);
      if (!source || !/^[A-Za-z0-9_.-]+\.bps$/.test(source.patch)) throw new Error('Invalid patch selection.');
      $(`base${base === '1.0' ? '10' : '11'}`).setAttribute('aria-current', 'page');
      $('selected').textContent = `For FireRed v${base}`;
      status('Attaching your BPS patch\u2026');
      const download = await fetch(`assets/${source.patch}`);
      if (!download.ok) throw new Error('Patch download failed. Please use the BPS downloads below.');
      const bytes = await download.arrayBuffer();
      if (await digest('SHA-256', bytes) !== source.patch_sha256) throw new Error('Patch verification failed. Please reload.');
      patch = BPS.fromFile(new BinFile(bytes));
      if (patch.sourceSize !== 16777216 || patch.targetSize !== manifest.target_size) throw new Error('Invalid BPS sizes.');
      $('selected').dataset.patch = source.patch;
      status(`BPS attached for FireRed v${base}. Select your original clean ROM.`, 'success');
      refresh();
    } catch (error) { patch = null; refresh(); status(error.message, 'error'); }
  }
  $('rom').addEventListener('change', async () => {
    original = null; refresh();
    const file = $('rom').files[0];
    if (!file || !source) return;
    try {
      status('Checking your ROM\u2026');
      if (file.size !== 16777216) throw new Error(`Use your original clean US/English FireRed v${base} ROM.`);
      const bytes = await file.arrayBuffer();
      const sha1 = await digest('SHA-1', bytes);
      if (sha1 !== source.base_sha1) {
        const other = manifest.sources.find(s => s.base_sha1 === sha1);
        if (other) throw new Error(`This ROM is FireRed ${other.revision}. Select that version above.`);
        throw new Error(`This is not a clean US/English FireRed v${base} ROM. Use the original, unpatched file.`);
      }
      original = new BinFile(bytes);
      if (!patch.validateSource(original)) throw new Error('The ROM does not match this BPS patch.');
      status('ROM verified. Ready to patch.', 'success'); refresh();
    } catch (error) { original = null; refresh(); status(error.message, 'error'); }
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
      const link = document.createElement('a'); link.href = url; link.download = `Pokemon_FireRed_Refined_${manifest.version}.gba`;
      document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 60000);
      status('Done! Open the downloaded game in your GBA emulator.', 'success');
    } catch (error) { status(error.message, 'error'); }
    finally { busy = false; refresh(); }
  });
  initialize();
})();
