package br.com.vitoriaregia.portariakiosk;

import android.Manifest;
import android.annotation.SuppressLint;
import android.app.Activity;
import android.app.AlertDialog;
import android.app.admin.DevicePolicyManager;
import android.content.ActivityNotFoundException;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.MediaStore;
import android.provider.Settings;
import android.text.InputType;
import android.view.Gravity;
import android.view.MotionEvent;
import android.view.View;
import android.view.ViewGroup;
import android.view.Window;
import android.view.WindowManager;
import android.webkit.CookieManager;
import android.webkit.PermissionRequest;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.TextView;
import android.widget.Toast;

public class MainActivity extends Activity {
    private static final int REQ_CAMERA = 801;
    private static final int REQ_FILE_CHOOSER = 802;

    /**
     * Altere esta URL se o painel de leitor automático ficar em outra rota.
     * Rota atual recomendada: Portaria > Encomendas.
     */
    private static final String APP_URL = "https://vitoriaregia-pro.onrender.com/?app=portaria#/portaria/encomendas";
    private static final String BOT_URL = "https://t.me/vitoriaregia_bot";
    private static final String DEFAULT_PIN = "1987";

    private WebView webView;
    private ProgressBar progressBar;
    private ValueCallback<Uri[]> filePathCallback;
    private PermissionRequest pendingPermissionRequest;
    private SharedPreferences prefs;

    @Override protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        prefs = getSharedPreferences("portaria_kiosk", MODE_PRIVATE);
        requestWindowFeature(Window.FEATURE_NO_TITLE);
        getWindow().setFlags(WindowManager.LayoutParams.FLAG_FULLSCREEN, WindowManager.LayoutParams.FLAG_FULLSCREEN);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        buildLayout();
        setupWebView();
        requestCameraIfNeeded();
        configureLockTaskIfDeviceOwner();
        enterKioskMode();
        webView.loadUrl(APP_URL);
    }

    private void buildLayout() {
        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.rgb(6, 38, 63));

        webView = new WebView(this);
        progressBar = new ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal);
        progressBar.setMax(100);
        progressBar.setVisibility(View.GONE);

        root.addView(webView, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));

        FrameLayout.LayoutParams barParams = new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 8);
        barParams.gravity = Gravity.TOP;
        root.addView(progressBar, barParams);

        TextView adminButton = new TextView(this);
        adminButton.setText("⋮");
        adminButton.setTextColor(Color.WHITE);
        adminButton.setTextSize(28);
        adminButton.setGravity(Gravity.CENTER);
        adminButton.setBackgroundColor(Color.argb(120, 0, 0, 0));
        FrameLayout.LayoutParams adminParams = new FrameLayout.LayoutParams(dp(48), dp(48));
        adminParams.gravity = Gravity.TOP | Gravity.RIGHT;
        adminParams.setMargins(0, dp(10), dp(10), 0);
        root.addView(adminButton, adminParams);
        adminButton.setOnClickListener(v -> askPinAndOpenAdminMenu());
        adminButton.setOnLongClickListener(v -> { askPinAndOpenAdminMenu(); return true; });

        setContentView(root);
    }

    @SuppressLint("SetJavaScriptEnabled")
    private void setupWebView() {
        WebSettings s = webView.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setAllowFileAccess(true);
        s.setAllowContentAccess(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setUseWideViewPort(true);
        s.setLoadWithOverviewMode(true);
        s.setBuiltInZoomControls(false);
        s.setDisplayZoomControls(false);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
            CookieManager.getInstance().setAcceptThirdPartyCookies(webView, true);
        }
        CookieManager.getInstance().setAcceptCookie(true);

        webView.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                return handleExternal(request.getUrl().toString());
            }
            @Override public boolean shouldOverrideUrlLoading(WebView view, String url) {
                return handleExternal(url);
            }
            @Override public void onPageFinished(WebView view, String url) {
                super.onPageFinished(view, url);
                hideSystemUi();
            }
        });

        webView.setWebChromeClient(new WebChromeClient() {
            @Override public void onProgressChanged(WebView view, int progress) {
                progressBar.setVisibility(progress < 100 ? View.VISIBLE : View.GONE);
                progressBar.setProgress(progress);
            }
            @Override public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (filePathCallback != null) filePathCallback.onReceiveValue(null);
                filePathCallback = callback;
                Intent intent = params.createIntent();
                try { startActivityForResult(intent, REQ_FILE_CHOOSER); }
                catch (ActivityNotFoundException e) {
                    filePathCallback = null;
                    Toast.makeText(MainActivity.this, "Nenhum seletor de arquivo disponível", Toast.LENGTH_LONG).show();
                    return false;
                }
                return true;
            }
            @Override public void onPermissionRequest(PermissionRequest request) {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && checkSelfPermission(Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED) {
                    pendingPermissionRequest = request;
                    requestPermissions(new String[]{Manifest.permission.CAMERA}, REQ_CAMERA);
                    return;
                }
                request.grant(request.getResources());
            }
        });
    }

    private boolean handleExternal(String url) {
        if (url == null) return false;
        if (url.startsWith("mailto:") || url.startsWith("tel:") || url.startsWith("whatsapp:") || url.startsWith("tg:") || url.contains("t.me/")) {
            openExternal(url);
            return true;
        }
        return false;
    }

    private void askPinAndOpenAdminMenu() {
        final EditText input = new EditText(this);
        input.setInputType(InputType.TYPE_CLASS_NUMBER | InputType.TYPE_NUMBER_VARIATION_PASSWORD);
        input.setHint("PIN de administrador");
        input.setGravity(Gravity.CENTER);
        int pad = dp(18);
        input.setPadding(pad, pad, pad, pad);

        new AlertDialog.Builder(this)
                .setTitle("Menu da Portaria")
                .setMessage("Informe o PIN para trocar de app, abrir Telegram, Wi-Fi ou sair do modo kiosk.")
                .setView(input)
                .setPositiveButton("Entrar", (d, w) -> {
                    String savedPin = prefs.getString("admin_pin", DEFAULT_PIN);
                    String typed = input.getText().toString().trim();
                    if (savedPin.equals(typed)) showAdminMenu();
                    else Toast.makeText(this, "PIN inválido", Toast.LENGTH_LONG).show();
                })
                .setNegativeButton("Cancelar", null)
                .show();
    }

    private void showAdminMenu() {
        String[] actions = new String[]{
                "Reabrir Vitória Régia",
                "Abrir Telegram da portaria",
                "Abrir câmera",
                "Abrir Wi-Fi",
                "Pausar kiosk / trocar app",
                "Alterar PIN",
                "Recarregar página"
        };
        new AlertDialog.Builder(this)
                .setTitle("Ações autorizadas")
                .setItems(actions, (dialog, which) -> {
                    if (which == 0) webView.loadUrl(APP_URL);
                    if (which == 1) openTelegram();
                    if (which == 2) openCamera();
                    if (which == 3) openWifiSettings();
                    if (which == 4) pauseKioskMode();
                    if (which == 5) changePinDialog();
                    if (which == 6) webView.reload();
                })
                .show();
    }

    private void changePinDialog() {
        LinearLayout box = new LinearLayout(this);
        box.setOrientation(LinearLayout.VERTICAL);
        box.setPadding(dp(18), dp(8), dp(18), dp(8));
        EditText pin1 = new EditText(this);
        pin1.setHint("Novo PIN");
        pin1.setInputType(InputType.TYPE_CLASS_NUMBER | InputType.TYPE_NUMBER_VARIATION_PASSWORD);
        EditText pin2 = new EditText(this);
        pin2.setHint("Confirmar PIN");
        pin2.setInputType(InputType.TYPE_CLASS_NUMBER | InputType.TYPE_NUMBER_VARIATION_PASSWORD);
        box.addView(pin1);
        box.addView(pin2);
        new AlertDialog.Builder(this)
                .setTitle("Alterar PIN")
                .setView(box)
                .setPositiveButton("Salvar", (d, w) -> {
                    String a = pin1.getText().toString().trim();
                    String b = pin2.getText().toString().trim();
                    if (a.length() < 4) { Toast.makeText(this, "Use pelo menos 4 números", Toast.LENGTH_LONG).show(); return; }
                    if (!a.equals(b)) { Toast.makeText(this, "PINs diferentes", Toast.LENGTH_LONG).show(); return; }
                    prefs.edit().putString("admin_pin", a).apply();
                    Toast.makeText(this, "PIN atualizado", Toast.LENGTH_LONG).show();
                })
                .setNegativeButton("Cancelar", null)
                .show();
    }

    private void openTelegram() {
        String[] packages = {"org.telegram.messenger", "org.telegram.messenger.web"};
        for (String p : packages) {
            Intent launch = getPackageManager().getLaunchIntentForPackage(p);
            if (launch != null) {
                pauseKioskModeSilently();
                launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                startActivity(launch);
                return;
            }
        }
        openExternal(BOT_URL);
    }

    private void openCamera() {
        pauseKioskModeSilently();
        try { startActivity(new Intent(MediaStore.ACTION_IMAGE_CAPTURE)); }
        catch (Exception e) { Toast.makeText(this, "Câmera não disponível", Toast.LENGTH_LONG).show(); }
    }

    private void openWifiSettings() {
        pauseKioskModeSilently();
        try { startActivity(new Intent(Settings.ACTION_WIFI_SETTINGS)); }
        catch (Exception e) { startActivity(new Intent(Settings.ACTION_SETTINGS)); }
    }

    private void openExternal(String url) {
        pauseKioskModeSilently();
        try { startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url))); }
        catch (Exception e) { Toast.makeText(this, "Não foi possível abrir o link", Toast.LENGTH_LONG).show(); }
    }

    private void pauseKioskMode() {
        pauseKioskModeSilently();
        Toast.makeText(this, "Kiosk pausado. Use o botão voltar ou abra o app Vitória Régia para retornar.", Toast.LENGTH_LONG).show();
        Intent i = new Intent(Intent.ACTION_MAIN);
        i.addCategory(Intent.CATEGORY_HOME);
        i.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        startActivity(i);
    }

    private void pauseKioskModeSilently() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            try { stopLockTask(); } catch (Exception ignored) { }
        }
    }

    private void configureLockTaskIfDeviceOwner() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.LOLLIPOP) return;
        try {
            DevicePolicyManager dpm = (DevicePolicyManager) getSystemService(Context.DEVICE_POLICY_SERVICE);
            ComponentName admin = new ComponentName(this, KioskDeviceAdminReceiver.class);
            if (dpm != null && dpm.isDeviceOwnerApp(getPackageName())) {
                dpm.setLockTaskPackages(admin, new String[]{getPackageName(), "org.telegram.messenger", "org.telegram.messenger.web", "com.android.settings", "com.google.android.GoogleCamera", "com.sec.android.app.camera"});
            }
        } catch (Exception ignored) { }
    }

    private void enterKioskMode() {
        hideSystemUi();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            try { startLockTask(); } catch (Exception ignored) { }
        }
    }

    private void hideSystemUi() {
        View decor = getWindow().getDecorView();
        decor.setSystemUiVisibility(
                View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                        | View.SYSTEM_UI_FLAG_FULLSCREEN
                        | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                        | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                        | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                        | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
        );
    }

    private void requestCameraIfNeeded() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && checkSelfPermission(Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{Manifest.permission.CAMERA}, REQ_CAMERA);
        }
    }

    @Override public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == REQ_CAMERA && pendingPermissionRequest != null) {
            if (grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED) pendingPermissionRequest.grant(pendingPermissionRequest.getResources());
            else pendingPermissionRequest.deny();
            pendingPermissionRequest = null;
        }
    }

    @Override protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == REQ_FILE_CHOOSER && filePathCallback != null) {
            Uri[] results = WebChromeClient.FileChooserParams.parseResult(resultCode, data);
            filePathCallback.onReceiveValue(results);
            filePathCallback = null;
        }
    }

    @Override public void onBackPressed() {
        Toast.makeText(this, "Use o menu ⋮ com PIN para sair ou trocar de app.", Toast.LENGTH_SHORT).show();
        hideSystemUi();
    }

    @Override protected void onResume() {
        super.onResume();
        enterKioskMode();
    }

    @Override public boolean dispatchTouchEvent(MotionEvent ev) {
        hideSystemUi();
        return super.dispatchTouchEvent(ev);
    }

    private int dp(int value) {
        return (int) (value * getResources().getDisplayMetrics().density + 0.5f);
    }
}
