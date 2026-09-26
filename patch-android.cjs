
const fs = require('fs');
const path = require('path');

console.log('=== Patching Android Manifest & WebSettings ===');

// 1. AndroidManifest.xml
const manifestPath = 'android/app/src/main/AndroidManifest.xml';
if (fs.existsSync(manifestPath)) {
  let m = fs.readFileSync(manifestPath, 'utf8');
  m = m.replace('<application', '<application android:usesCleartextTraffic="true" android:hardwareAccelerated="true"');
  if (!m.includes('android.permission.INTERNET')) {
    m = m.replace('</manifest>', `<uses-permission android:name="android.permission.INTERNET" />\n<uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />\n<uses-permission android:name="android.permission.ACCESS_WIFI_STATE" />\n</manifest>`);
  }
  // Replace or inject orientation so landscape and portrait work smoothly
  m = m.replace(/android:screenOrientation="[^"]*"/g, '');
  m = m.replace('<activity', '<activity android:screenOrientation="fullSensor"');
  if (!m.includes('configChanges=')) {
    m = m.replace('<activity', '<activity android:configChanges="orientation|keyboardHidden|keyboard|screenSize|locale|smallestScreenSize|screenLayout|uiMode"');
  }
  fs.writeFileSync(manifestPath, m, 'utf8');
  console.log('✅ AndroidManifest.xml patched successfully with android:screenOrientation="fullSensor"');
}

// 2. strings.xml (App name)
const stringsPath = 'android/app/src/main/res/values/strings.xml';
if (fs.existsSync(stringsPath)) {
  let s = fs.readFileSync(stringsPath, 'utf8');
  s = s.replace(/<string name="app_name">.*?<\/string>/, '<string name="app_name">تحصيل</string>');
  s = s.replace(/<string name="title_activity_main">.*?<\/string>/, '<string name="title_activity_main">تحصيل</string>');
  fs.writeFileSync(stringsPath, s, 'utf8');
  console.log('✅ strings.xml patched successfully');
}

// 3. MainActivity.java (KeepScreenOn flag and WebSettings)
const findMainAct = (dir) => {
  if (!fs.existsSync(dir)) return null;
  const files = fs.readdirSync(dir);
  for (const f of files) {
    const full = path.join(dir, f);
    if (fs.statSync(full).isDirectory()) {
      const res = findMainAct(full);
      if (res) return res;
    } else if (f === 'MainActivity.java') {
      return full;
    }
  }
  return null;
};

const actPath = findMainAct('android/app/src/main/java');
if (actPath) {
  let code = fs.readFileSync(actPath, 'utf8');
  if (!code.includes('FLAG_KEEP_SCREEN_ON') && !code.includes('setJavaScriptEnabled')) {
    const hook = `
    @Override
    public void onCreate(android.os.Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        ${false ? 'getWindow().addFlags(android.view.WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);' : ''}
    }

    @Override
    public void onStart() {
        super.onStart();
        try {
            if (this.bridge != null && this.bridge.getWebView() != null) {
                android.webkit.WebView wv = this.bridge.getWebView();
                android.webkit.WebSettings ws = wv.getSettings();
                ws.setJavaScriptEnabled(true);
                ws.setDomStorageEnabled(true);
                ws.setDatabaseEnabled(true);
                ws.setAllowFileAccess(true);
                ws.setAllowContentAccess(true);
                ws.setLoadWithOverviewMode(true);
                ws.setUseWideViewPort(true);
                ws.setSupportZoom(true);
                ws.setBuiltInZoomControls(true);
                ws.setDisplayZoomControls(false);
            }
        } catch (Exception ignored) {}
    }
`;
    code = code.replace('public class MainActivity extends BridgeActivity {', 'public class MainActivity extends BridgeActivity {' + hook);
    fs.writeFileSync(actPath, code, 'utf8');
    console.log('✅ MainActivity.java patched with KeepScreenOn & WebSettings');
  }
}
