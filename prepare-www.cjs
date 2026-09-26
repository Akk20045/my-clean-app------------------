
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('=== Step: Preparing Web App Directory (www) ===');

if (!fs.existsSync('www')) {
  fs.mkdirSync('www', { recursive: true });
}

// Helper: Recursively search for directory containing index.html
function findDirWithIndex(startDir) {
  if (!fs.existsSync(startDir)) return null;

  // 1. Check startDir itself
  if (fs.existsSync(path.join(startDir, 'index.html'))) {
    return startDir;
  }

  // 2. Priority check build output folders
  const candidates = ['dist', 'build', 'out', 'public', 'web', 'www'];
  for (const c of candidates) {
    const cp = path.join(startDir, c);
    if (fs.existsSync(path.join(cp, 'index.html'))) {
      return cp;
    }
  }

  // 3. Search subdirectories recursively
  try {
    const entries = fs.readdirSync(startDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory() && entry.name !== 'node_modules' && entry.name !== '.git' && entry.name !== 'www') {
        const res = findDirWithIndex(path.join(startDir, entry.name));
        if (res) return res;
      }
    }
  } catch (_) {}

  return null;
}

// 1. Unpack app-source.zip if present
if (fs.existsSync('app-source.zip')) {
  console.log('Unpacking app-source.zip...');
  if (!fs.existsSync('extracted_source')) {
    fs.mkdirSync('extracted_source', { recursive: true });
  }

  let unzipped = false;
  try {
    const JSZip = require('jszip');
    const zipData = fs.readFileSync('app-source.zip');
    JSZip.loadAsync(zipData).then(zip => {
      const promises = [];
      zip.forEach((relPath, file) => {
        const dest = path.join('extracted_source', relPath);
        if (file.dir) {
          fs.mkdirSync(dest, { recursive: true });
        } else {
          fs.mkdirSync(path.dirname(dest), { recursive: true });
          promises.push(file.async('nodebuffer').then(buf => fs.writeFileSync(dest, buf)));
        }
      });
      return Promise.all(promises);
    }).then(() => {
      console.log('Unpacked with JSZip');
    }).catch(e => console.warn('JSZip unpack note:', e.message));
    unzipped = true;
  } catch (_) {}

  if (!unzipped) {
    try {
      if (process.platform === 'win32') {
        execSync('tar -xf app-source.zip -C extracted_source', { stdio: 'inherit' });
      } else {
        execSync('unzip -q -o app-source.zip -d extracted_source', { stdio: 'inherit' });
      }
    } catch (err) {
      console.warn('System unzip note:', err.message);
    }
  }

  // Check if build command needed
  const findPkg = (dir) => {
    if (!fs.existsSync(dir)) return null;
    if (fs.existsSync(path.join(dir, 'package.json'))) return dir;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const e of entries) {
      if (e.isDirectory() && e.name !== 'node_modules') {
        const res = findPkg(path.join(dir, e.name));
        if (res) return res;
      }
    }
    return null;
  };

  const pkgDir = findPkg('extracted_source');
  if (pkgDir) {
    try {
      const p = JSON.parse(fs.readFileSync(path.join(pkgDir, 'package.json'), 'utf8'));
      if (p.scripts && (p.scripts.build || p.scripts.generate)) {
        console.log('Running npm install & build in:', pkgDir);
        const prev = process.cwd();
        process.chdir(pkgDir);
        execSync('npm install --legacy-peer-deps --no-audit --prefer-offline', { stdio: 'inherit' });
        execSync('npm run build || npm run generate', { stdio: 'inherit' });
        process.chdir(prev);
      }
    } catch (err) {
      console.warn('Auto build notice:', err.message);
    }
  }

  // Find directory containing index.html and copy ALL of its files to www/
  const bestDir = findDirWithIndex('extracted_source');
  if (bestDir) {
    console.log('⚡ Found index.html in:', bestDir, '-> copying directly to www/');
    fs.cpSync(bestDir, 'www', { recursive: true });
  } else {
    console.log('Copying extracted_source to www/');
    fs.cpSync('extracted_source', 'www', { recursive: true });
  }
}

// 2. Ensure index.html exists in www/
const indexPath = path.join('www', 'index.html');
if (!fs.existsSync(indexPath)) {
  console.log('Generating index.html redirect/splash...');
  const fallbackHtml = `<!DOCTYPE html>
<html lang="ar">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=yes, viewport-fit=cover">
  <title>${appName}</title>
  <style>
    * { box-sizing: border-box; }
    html, body { margin:0; padding:0; width:100%; height:100%; background:${splashColor || '#0f172a'}; font-family:system-ui,-apple-system,sans-serif; overflow:hidden; }
    .loader-box { display:flex; flex-direction:column; align-items:center; justify-content:center; height:100%; color:#fff; text-align:center; padding:24px; }
    .icon-img { width:88px; height:88px; border-radius:22px; box-shadow:0 8px 24px rgba(0,0,0,0.35); margin-bottom:16px; object-fit:cover; }
    .title { font-size:22px; font-weight:bold; margin-bottom:6px; letter-spacing:-0.5px; }
    .spinner { width:38px; height:38px; border:3px solid rgba(255,255,255,0.2); border-top-color:#6366f1; border-radius:50%; animation:spin 0.8s linear infinite; margin-top:16px; }
    @keyframes spin { to { transform:rotate(360deg); } }
  </style>
</head>
<body>
  <div class="loader-box">
    <img src="icon.png" class="icon-img" onerror="this.style.display='none'">
    <div class="title">${appName}</div>
    <div class="spinner"></div>
    <p style="font-size:13px; opacity:0.8; margin-top:12px;">جاري فتح التطبيق...</p>
  </div>
  ${sourceType === 'url' && finalAppUrl ? `
  <script>
    setTimeout(function() {
      try {
        window.location.replace('${finalAppUrl}');
      } catch (e) {
        window.location.href = '${finalAppUrl}';
      }
    }, 150);
  </script>
  ` : ''}
</body>
</html>`;
  fs.writeFileSync(indexPath, fallbackHtml, 'utf8');
} else {
  try {
    let html = fs.readFileSync(indexPath, 'utf8');

    // Compile uncompiled TSX/JSX if present
    if (html.includes('.tsx') || html.includes('.jsx') || html.includes('/src/main.') || html.includes('/src/index.')) {
      console.log('⚡ Detected uncompiled TSX/JSX in www/index.html! Running esbuild...');
      try {
        const match = html.match(/src=["']([^"']+.(tsx|jsx|ts|js))["']/);
        const scriptSrc = match ? match[1].replace(/^\.\//, '').replace(/^\//, '') : 'src/main.tsx';
        const entryPath = fs.existsSync(path.join('www', scriptSrc)) ? path.join('www', scriptSrc) : (fs.existsSync(scriptSrc) ? scriptSrc : null);
        if (entryPath) {
          execSync('npx esbuild ' + entryPath + ' --bundle --outfile=www/app-bundle.js --loader:.tsx=tsx --loader:.ts=ts --loader:.jsx=jsx --loader:.js=jsx --jsx=transform --minify', { stdio: 'inherit' });
          html = html.replace(/<script[^>]+src=["'][^"']+.(tsx|jsx|ts|js)["'][^>]*><\/script>/gi, '<script src="app-bundle.js"><\/script>');
        }
      } catch (esErr) {
        console.warn('esbuild bundling notice:', esErr.message);
      }
    }

    // Fix absolute URLs to relative URLs so Android WebView can load them locally
    html = html.replace(/<base[^>]+href=["']\/[^"']*["'][^>]*>/gi, '<base href="./">');
    html = html.replace(/(src|href)=["']/(?!/)(assets/|static/|css/|js/|img/|images/)/gi, '$1="./$2');

    // Ensure proper viewport meta tag
    if (!html.includes('viewport')) {
      html = html.replace('<head>', '<head><meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover">');
    }

    // Inject Error Diagnostic script so blank screen is replaced with actionable error alert
    const errDiagScript = `<script>
(function() {
  window.addEventListener('error', function(e) {
    var b = document.getElementById('__err_diag_box');
    if (!b) {
      b = document.createElement('div');
      b.id = '__err_diag_box';
      b.style.cssText = 'position:fixed;bottom:10px;left:10px;right:10px;background:#881337;color:#fff;padding:12px;border-radius:12px;font-size:12px;z-index:9999999;font-family:sans-serif;box-shadow:0 10px 25px rgba(0,0,0,0.8);border:1px solid #f43f5e;direction:rtl;text-align:right;line-height:1.5;';
      (document.body || document.documentElement).appendChild(b);
    }
    var msg = (e.message || 'Script error') + (e.filename ? ' (' + e.filename.split('/').pop() + ':' + e.lineno + ')' : '');
    b.innerHTML = '⚠️ <b>تنبيه تشخيص التطبيق:</b> ' + msg;
  });
})();
</script>`;
    if (!html.includes('__err_diag_box')) {
      html = html.replace('<head>', '<head>' + errDiagScript);
    }

    fs.writeFileSync(indexPath, html, 'utf8');
    console.log('✅ Sanitized www/index.html successfully');
  } catch (e) {
    console.warn('Sanitize html notice:', e.message);
  }
}

// 3. Create PWA manifest
const manifestPath = path.join('www', 'manifest.json');
const manifestContent = {
  name: "تحصيل",
  short_name: "تحصيل",
  start_url: "./",
  display: "standalone",
  background_color: "#00a2ff",
  theme_color: "#00a2ff",
  icons: [
    {
      src: "icon.png",
      sizes: "512x512",
      type: "image/png"
    }
  ]
};
fs.writeFileSync(manifestPath, JSON.stringify(manifestContent, null, 2), 'utf8');

if (fs.existsSync('assets/icon.png')) {
  try {
    fs.copyFileSync('assets/icon.png', path.join('www', 'icon.png'));
    fs.copyFileSync('assets/icon.png', path.join('www', 'apple-touch-icon.png'));
  } catch (e) {}
}

console.log('=== Web App Directory Ready (www) ===');
