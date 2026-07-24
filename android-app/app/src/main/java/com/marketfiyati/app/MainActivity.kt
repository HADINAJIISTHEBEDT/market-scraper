package com.marketfiyati.app

import android.Manifest
import android.annotation.SuppressLint
import android.app.Activity
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.app.Dialog
import android.net.Uri
import android.webkit.CookieManager
import android.os.Build
import android.os.Bundle
import android.os.Message
import android.util.DisplayMetrics
import android.util.Log
import android.webkit.GeolocationPermissions
import android.webkit.JavascriptInterface
import android.webkit.PermissionRequest
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.view.ViewGroup
import android.webkit.WebStorage
import androidx.activity.result.contract.ActivityResultContracts
import androidx.activity.OnBackPressedCallback
import androidx.appcompat.app.AppCompatActivity
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import androidx.core.content.edit
import com.google.android.gms.ads.AdListener
import com.google.android.gms.ads.AdRequest
import com.google.android.gms.ads.AdSize
import com.google.android.gms.ads.AdView
import com.google.android.gms.ads.LoadAdError
import com.google.android.gms.ads.MobileAds
import com.google.android.gms.ads.RequestConfiguration
import com.marketfiyati.app.databinding.ActivityMainBinding
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.Executors

class MainActivity : AppCompatActivity() {
    private val adTag = "AdMobBanner"
    private lateinit var binding: ActivityMainBinding
    private var bannerAdView: AdView? = null
    private var uploadMessage: ValueCallback<Array<Uri>>? = null
    private var pendingWebPermissionRequest: PermissionRequest? = null
    private var pendingGeoOrigin: String? = null
    private var pendingGeoCallback: GeolocationPermissions.Callback? = null
    private var authPopupDialog: Dialog? = null
    private val filePickerLauncher = registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
        val uris = if (result.resultCode == Activity.RESULT_OK && result.data != null) {
            result.data?.data?.let { arrayOf(it) }
        } else null
        uploadMessage?.onReceiveValue(uris)
        uploadMessage = null
    }
    private val notificationPermissionLauncher =
        registerForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
            if (!::binding.isInitialized) return@registerForActivityResult
            binding.webView.post {
                binding.webView.evaluateJavascript(
                    "window.dispatchEvent(new CustomEvent('android-notification-permission', { detail: { granted: ${if (granted) "true" else "false"} } }));",
                    null
                )
            }
        }
    private val storagePermissionLauncher =
        registerForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
            if (!::binding.isInitialized) return@registerForActivityResult
            binding.webView.post {
                binding.webView.evaluateJavascript(
                    "window.dispatchEvent(new CustomEvent('android-storage-permission', { detail: { granted: ${if (granted) "true" else "false"} } }));",
                    null
                )
            }
        }
    private val multiPermissionLauncher =
        registerForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { permissions ->
            if (!::binding.isInitialized) return@registerForActivityResult
            val allGranted = permissions.values.all { it }
            binding.webView.post {
                binding.webView.evaluateJavascript(
                    "window.dispatchEvent(new CustomEvent('android-storage-permission', { detail: { granted: ${if (allGranted) "true" else "false"} } }));",
                    null
                )
            }
        }

    private val locationPermissionLauncher =
        registerForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { permissions ->
            val granted = permissions[Manifest.permission.ACCESS_FINE_LOCATION] == true ||
                permissions[Manifest.permission.ACCESS_COARSE_LOCATION] == true
            pendingGeoCallback?.invoke(pendingGeoOrigin, granted, false)
            pendingGeoCallback = null
            pendingGeoOrigin = null
            if (!::binding.isInitialized) return@registerForActivityResult
            binding.webView.post {
                binding.webView.evaluateJavascript(
                    "window.dispatchEvent(new CustomEvent('android-location-permission', { detail: { granted: ${if (granted) "true" else "false"} } }));",
                    null
                )
            }
        }
    private val cameraMicPermissionLauncher =
        registerForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { permissions ->
            val cameraOk = !permissions.containsKey(Manifest.permission.CAMERA) ||
                permissions[Manifest.permission.CAMERA] == true
            val audioOk = !permissions.containsKey(Manifest.permission.RECORD_AUDIO) ||
                permissions[Manifest.permission.RECORD_AUDIO] == true
            pendingWebPermissionRequest?.let { request ->
                pendingWebPermissionRequest = null
                if (cameraOk && audioOk) {
                    request.grant(request.resources)
                } else {
                    request.deny()
                }
            }
            if (!::binding.isInitialized) return@registerForActivityResult
            binding.webView.post {
                binding.webView.evaluateJavascript(
                    "window.dispatchEvent(new CustomEvent('android-camera-permission', { detail: { granted: ${if (cameraOk) "true" else "false"}, audioGranted: ${if (audioOk) "true" else "false"} } }));",
                    null
                )
            }
        }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityMainBinding.inflate(layoutInflater)
        setContentView(binding.root)

        createNotificationChannel()
        createUpdateChannel()
        configureWebView(binding.webView)
        binding.privacyPolicyLink.setOnClickListener {
            binding.webView.evaluateJavascript(
                "(function(){ return localStorage.getItem('app_lang') || 'tr'; })();"
            ) { lang ->
                val cleanLang = lang?.trim()?.removeSurrounding("\"")?.ifBlank { "tr" } ?: "tr"
                binding.webView.loadUrl(
                    getString(R.string.privacy_policy_url) + "?lang=" + cleanLang
                )
            }
        }

        if (savedInstanceState == null) {
            binding.webView.loadUrl(APP_URL)
        } else {
            binding.webView.restoreState(savedInstanceState)
        }

        configureAds()
        checkForAppUpdate()
        handleAuthDeepLink(intent)

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                if (authPopupDialog?.isShowing == true) {
                    dismissAuthPopup()
                    binding.webView.loadUrl(APP_URL + "login.html")
                    return
                }
                if (binding.webView.canGoBack()) {
                    binding.webView.goBack()
                } else {
                    finish()
                }
            }
        })
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        handleAuthDeepLink(intent)
    }

    private fun handleAuthDeepLink(intent: Intent?) {
        val data = intent?.data ?: return
        if (!::binding.isInitialized) return
        val host = data.host?.lowercase() ?: return
        if (data.scheme != "https" || host != APP_HOST) return
        binding.webView.loadUrl(data.toString())
    }

    private fun applyWebViewDefaults(webView: WebView) {
        webView.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            databaseEnabled = true
            loadsImagesAutomatically = true
            mixedContentMode = WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE
            mediaPlaybackRequiresUserGesture = false
            javaScriptCanOpenWindowsAutomatically = true
            setSupportMultipleWindows(true)
            allowFileAccess = true
            allowContentAccess = true
            useWideViewPort = true
            loadWithOverviewMode = true
            setGeolocationEnabled(true)
        }
        webView.settings.userAgentString =
            "Mozilla/5.0 (Linux; Android ${Build.VERSION.RELEASE}; Mobile) " +
                "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.6099.230 Mobile Safari/537.36"
        CookieManager.getInstance().setAcceptCookie(true)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            CookieManager.getInstance().setAcceptThirdPartyCookies(webView, true)
        }
    }

    private fun isAuthBridgeUrl(url: String): Boolean {
        return url.contains("auth-bridge.html", ignoreCase = true)
    }

    private fun isFirebaseAuthHandlerUrl(url: String): Boolean {
        return url.contains("/__/auth/", ignoreCase = true)
    }

    private fun isGoogleAuthUrl(url: String): Boolean {
        val host = Uri.parse(url).host?.lowercase() ?: return false
        if (host == "accounts.google.com") return true
        return host.endsWith(".google.com") &&
            (url.contains("oauth", ignoreCase = true) || url.contains("signin", ignoreCase = true))
    }

    private fun isAuthFlowPage(url: String?): Boolean {
        val value = url?.lowercase() ?: return false
        return value.contains("login.html") ||
            value.contains("auth-bridge.html") ||
            value.contains("/__/auth/") ||
            value.contains("firebaseapp.com/__/auth") ||
            value.contains(".web.app/__/auth")
    }

    private fun isAppAuthReturnUrl(url: String): Boolean {
        val uri = Uri.parse(url)
        val host = uri.host?.lowercase() ?: return false
        return host == APP_HOST ||
            host.endsWith(".firebaseapp.com") ||
            uri.path?.contains("__/auth/") == true
    }

    private fun clearWebAuthCookies() {
        try {
            val cookieManager = CookieManager.getInstance()
            cookieManager.removeAllCookies(null)
            cookieManager.flush()
        } catch (_: Exception) {
            // Best-effort cookie cleanup.
        }
    }

    private fun clearWebAuthStorage() {
        clearWebAuthCookies()
        try {
            WebStorage.getInstance().deleteAllData()
        } catch (_: Exception) {
            // Best-effort storage cleanup.
        }
    }

    private fun isAppLoginReturnUrl(url: String): Boolean {
        val uri = Uri.parse(url)
        val host = uri.host?.lowercase() ?: return false
        if (host != APP_HOST) return false
        val path = uri.path?.lowercase() ?: ""
        if (!path.contains("login.html")) return false
        return !uri.getQueryParameter("auth_uid").isNullOrBlank()
    }

    private fun openAuthInAppWebView(url: String) {
        dismissAuthPopup()
        clearWebAuthCookies()

        val dialog = Dialog(this, android.R.style.Theme_DeviceDefault_Light_NoActionBar)
        val popupWebView = WebView(this)
        applyWebViewDefaults(popupWebView)
        popupWebView.addJavascriptInterface(AndroidBridge(), "AndroidApp")
        val mainWebView = binding.webView
        val dismissPopup: () -> Unit = { dismissAuthPopup() }

        popupWebView.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(
                view: WebView?,
                request: WebResourceRequest?
            ): Boolean {
                val loadUrl = request?.url?.toString() ?: return false
                if (loadUrl.startsWith("intent://")) {
                    try {
                        val intent = Intent.parseUri(loadUrl, Intent.URI_INTENT_SCHEME)
                        val fallback = intent.getStringExtra("browser_fallback_url")
                        if (!fallback.isNullOrBlank()) {
                            mainWebView.loadUrl(fallback)
                            dismissAuthPopup()
                            return true
                        }
                    } catch (_: Exception) {
                        // Fall through and let WebView try to load the URL.
                    }
                }
                if (isAppLoginReturnUrl(loadUrl)) {
                    mainWebView.loadUrl(loadUrl)
                    dismissAuthPopup()
                    return true
                }
                return false
            }
        }
        popupWebView.webChromeClient = createWebChromeClient(mainWebView, dismissPopup)

        dialog.setContentView(
            popupWebView,
            ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
            )
        )
        dialog.setOnDismissListener { authPopupDialog = null }
        dialog.show()
        authPopupDialog = dialog
        popupWebView.loadUrl(url)
    }

    private fun openAuthInCustomTab(url: String) {
        openAuthInAppWebView(url)
    }

    private fun dismissAuthPopup() {
        authPopupDialog?.dismiss()
        authPopupDialog = null
    }

    private fun createWebViewClient(mainWebView: WebView, closePopup: (() -> Unit)? = null): WebViewClient {
        return object : WebViewClient() {
            override fun shouldOverrideUrlLoading(
                view: WebView?,
                request: WebResourceRequest?
            ): Boolean {
                val url = request?.url?.toString() ?: return false
                if (view == mainWebView && isAuthBridgeUrl(url)) {
                    openAuthInAppWebView(url)
                    return true
                }
                if (view != mainWebView && isAppLoginReturnUrl(url)) {
                    mainWebView.loadUrl(url)
                    closePopup?.invoke()
                    return true
                }
                if (view != mainWebView && isAppAuthReturnUrl(url)) {
                    mainWebView.loadUrl(url)
                    closePopup?.invoke()
                    return true
                }
                return false
            }

            override fun onReceivedError(
                view: WebView?,
                request: WebResourceRequest?,
                error: android.webkit.WebResourceError?
            ) {
                super.onReceivedError(view, request, error)
                if (view != mainWebView) return
                if (request?.isForMainFrame == true) {
                    view?.loadDataWithBaseURL(
                        null,
                        OFFLINE_HTML,
                        "text/html",
                        "utf-8",
                        null
                    )
                }
            }
        }
    }

    private fun createWebChromeClient(mainWebView: WebView, closePopup: (() -> Unit)? = null): WebChromeClient {
        return object : WebChromeClient() {
            override fun onShowFileChooser(
                webView: WebView?,
                filePathCallback: ValueCallback<Array<Uri>>?,
                fileChooserParams: FileChooserParams?
            ): Boolean {
                uploadMessage = filePathCallback
                val intent = fileChooserParams?.createIntent()
                if (intent != null) {
                    filePickerLauncher.launch(intent)
                    return true
                }
                return false
            }

            override fun onGeolocationPermissionsShowPrompt(
                origin: String?,
                callback: GeolocationPermissions.Callback?
            ) {
                if (hasLocationPermission()) {
                    callback?.invoke(origin, true, false)
                    return
                }
                pendingGeoOrigin = origin
                pendingGeoCallback = callback
                locationPermissionLauncher.launch(
                    arrayOf(
                        Manifest.permission.ACCESS_FINE_LOCATION,
                        Manifest.permission.ACCESS_COARSE_LOCATION
                    )
                )
            }

            override fun onPermissionRequest(request: PermissionRequest?) {
                if (request == null) return
                val needed = mutableListOf<String>()
                if (request.resources.contains(PermissionRequest.RESOURCE_VIDEO_CAPTURE) && !hasCameraPermission()) {
                    needed.add(Manifest.permission.CAMERA)
                }
                if (request.resources.contains(PermissionRequest.RESOURCE_AUDIO_CAPTURE) && !hasRecordAudioPermission()) {
                    needed.add(Manifest.permission.RECORD_AUDIO)
                }
                if (needed.isEmpty()) {
                    request.grant(request.resources)
                    return
                }
                pendingWebPermissionRequest = request
                cameraMicPermissionLauncher.launch(needed.distinct().toTypedArray())
            }

            override fun onCreateWindow(
                view: WebView?,
                isDialog: Boolean,
                isUserGesture: Boolean,
                resultMsg: Message?
            ): Boolean {
                val transport = resultMsg?.obj as? WebView.WebViewTransport ?: return false
                val dialog = Dialog(this@MainActivity)
                val popupWebView = WebView(this@MainActivity)
                applyWebViewDefaults(popupWebView)
                val dismissPopup: () -> Unit = {
                    dismissAuthPopup()
                    closePopup?.invoke()
                }
                popupWebView.webChromeClient = createWebChromeClient(mainWebView, dismissPopup)
                popupWebView.webViewClient = createWebViewClient(mainWebView, dismissPopup)
                dialog.setContentView(popupWebView)
                dialog.setOnDismissListener { authPopupDialog = null }
                dialog.show()
                authPopupDialog = dialog
                transport.webView = popupWebView
                resultMsg.sendToTarget()
                return true
            }

            override fun onCloseWindow(window: WebView?) {
                dismissAuthPopup()
                closePopup?.invoke()
            }
        }
    }

    @SuppressLint("SetJavaScriptEnabled")
    private fun configureWebView(webView: WebView) {
        applyWebViewDefaults(webView)

        webView.addJavascriptInterface(AndroidBridge(), "AndroidApp")
        webView.webChromeClient = createWebChromeClient(webView)
        webView.webViewClient = createWebViewClient(webView)
    }

    private fun configureAds() {
        binding.bannerAdContainer.visibility = android.view.View.GONE
        binding.root.post {
            try {
                MobileAds.initialize(this) { initStatus ->
                    runOnUiThread {
                        try {
                            val isDebuggable =
                                (applicationInfo.flags and android.content.pm.ApplicationInfo.FLAG_DEBUGGABLE) != 0
                            var adLoaded = false
                            var adCallbackSeen = false

                            val adapterStates = initStatus.adapterStatusMap.entries.joinToString { entry ->
                                "${entry.key}:${entry.value.initializationState}"
                            }
                            Log.i(
                                adTag,
                                "MobileAds initialized. debug=$isDebuggable, adapters=[$adapterStates]"
                            )

                            // Create AdView in code with an explicit size so we never hit
                            // "Required XML attribute 'adSize' was missing".
                            val unitId = getString(R.string.admob_banner_ad_unit_id)
                            val adSize = try {
                                getAdaptiveBannerSize()
                            } catch (error: Exception) {
                                Log.w(adTag, "Adaptive ad size failed, using BANNER", error)
                                AdSize.BANNER
                            }
                            val adView = AdView(this).apply {
                                setAdSize(adSize)
                                adUnitId = unitId
                                visibility = android.view.View.GONE
                            }
                            bannerAdView?.destroy()
                            bannerAdView = adView
                            binding.bannerAdContainer.removeAllViews()
                            binding.bannerAdContainer.addView(
                                adView,
                                android.widget.FrameLayout.LayoutParams(
                                    android.widget.FrameLayout.LayoutParams.MATCH_PARENT,
                                    android.widget.FrameLayout.LayoutParams.WRAP_CONTENT
                                )
                            )

                            if (isDebuggable) {
                                MobileAds.setRequestConfiguration(
                                    RequestConfiguration.Builder()
                                        .setTestDeviceIds(listOf(AdRequest.DEVICE_ID_EMULATOR))
                                        .build()
                                )
                            }

                            adView.adListener = object : AdListener() {
                                override fun onAdLoaded() {
                                    adCallbackSeen = true
                                    adLoaded = true
                                    adView.visibility = android.view.View.VISIBLE
                                    binding.bannerAdContainer.visibility = android.view.View.VISIBLE
                                    Log.i(adTag, "Banner ad loaded (unit=${adView.adUnitId})")
                                }

                                override fun onAdFailedToLoad(error: LoadAdError) {
                                    adCallbackSeen = true
                                    Log.e(
                                        adTag,
                                        "Banner failed (unit=${adView.adUnitId}): " +
                                            "code=${error.code}, domain=${error.domain}, message=${error.message}"
                                    )
                                    adView.visibility = android.view.View.GONE
                                    binding.bannerAdContainer.visibility = android.view.View.GONE
                                }
                            }
                            Log.i(adTag, "Loading banner ad (unit=$unitId, size=$adSize)")
                            adView.loadAd(AdRequest.Builder().build())

                            adView.postDelayed({
                                if (!adLoaded && !adCallbackSeen) {
                                    Log.w(adTag, "No ad callback after timeout for unit=$unitId")
                                }
                            }, 12000L)
                        } catch (error: Exception) {
                            binding.bannerAdContainer.visibility = android.view.View.GONE
                            Log.e(adTag, "Banner setup exception", error)
                        }
                    }
                }
            } catch (error: Exception) {
                binding.bannerAdContainer.visibility = android.view.View.GONE
                Log.e(adTag, "MobileAds init exception", error)
            }
        }
    }

    override fun onDestroy() {
        bannerAdView?.destroy()
        bannerAdView = null
        super.onDestroy()
    }

    private fun getAdaptiveBannerSize(): AdSize {
        val displayMetrics = DisplayMetrics()
        @Suppress("DEPRECATION")
        windowManager.defaultDisplay.getMetrics(displayMetrics)
        val density = displayMetrics.density
        val adWidthPixels = binding.root.width.takeIf { it > 0 } ?: displayMetrics.widthPixels
        val adWidth = (adWidthPixels / density).toInt().coerceAtLeast(320)
        return AdSize.getCurrentOrientationAnchoredAdaptiveBannerAdSize(this, adWidth)
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        binding.webView.saveState(outState)
    }

    @Deprecated("Deprecated in Java")
    override fun onBackPressed() {
        if (authPopupDialog?.isShowing == true) {
            dismissAuthPopup()
            binding.webView.loadUrl(APP_URL + "login.html")
            return
        }
        if (binding.webView.canGoBack()) {
            binding.webView.goBack()
            return
        }
        super.onBackPressed()
    }

    companion object {
        private const val APP_URL = "https://market-scraper-0k36.onrender.com/"
        private const val APP_HOST = "market-scraper-0k36.onrender.com"
        private const val HOSTED_AUTH_BRIDGE =
            "https://market-scraper-0k36.onrender.com/auth-bridge.html?return=android&fresh=1&select_account=1&webview=1"
        private const val NOTIFICATION_CHANNEL_ID = "market_scraper_alerts"
        private const val UPDATE_CHANNEL_ID = "market_scraper_updates"
        private const val VERSION_CHECK_URL = "https://raw.githubusercontent.com/HADINAJIISTHEBEDT/market-scraper/main/android-app/app/build.gradle"
        private const val PLAY_STORE_URL = "https://play.google.com/store/apps/details?id=com.marketfiyati.app"
        private const val PREFS_NAME = "app_prefs"
        private const val LAST_VERSION_CHECK = "last_version_check"
        private const val CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000L
        private const val OFFLINE_HTML = """
            <!DOCTYPE html><html><head><meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1">
            <style>
              body{margin:0;font-family:sans-serif;background:#f7f8f4;color:#0d4d35;
                   display:flex;min-height:100vh;align-items:center;justify-content:center;text-align:center}
              .box{padding:24px;max-width:340px}
              h1{font-size:20px;margin:0 0 8px}
              p{font-size:15px;color:#555;line-height:1.4}
              button{margin-top:18px;background:#1f7a5c;color:#fff;border:0;border-radius:8px;
                     padding:12px 24px;font-size:16px}
            </style></head><body><div class="box">
              <h1>Bağlantı kurulamadı</h1>
              <p>İnternet bağlantınızı kontrol edin ve tekrar deneyin.</p>
              <button onclick="AndroidApp.reloadApp()">Tekrar Dene</button>
            </div></body></html>
        """
    }

    private inner class AndroidBridge {
        @JavascriptInterface
        fun isAndroidApp(): Boolean = true

        @JavascriptInterface
        fun reloadApp() {
            runOnUiThread { binding.webView.loadUrl(APP_URL) }
        }

        @JavascriptInterface
        fun openExternalAuth(url: String?) {
            runOnUiThread {
                val target = url?.trim()?.takeIf { it.isNotBlank() } ?: HOSTED_AUTH_BRIDGE
                openAuthInCustomTab(target)
            }
        }

        @JavascriptInterface
        fun clearAuthSession() {
            runOnUiThread { clearWebAuthStorage() }
        }

        @JavascriptInterface
        fun completeAuthReturn(url: String?) {
            runOnUiThread {
                val target = url?.trim()?.takeIf { it.isNotBlank() } ?: return@runOnUiThread
                if (!isAppLoginReturnUrl(target)) return@runOnUiThread
                binding.webView.loadUrl(target)
                dismissAuthPopup()
            }
        }

        @JavascriptInterface
        fun navigateToPage(path: String?) {
            runOnUiThread {
                val cleanPath = (path ?: "index.html").trim().removePrefix("/")
                val url = if (cleanPath.startsWith("http://") || cleanPath.startsWith("https://")) {
                    cleanPath
                } else {
                    APP_URL + cleanPath
                }
                binding.webView.loadUrl(url)
            }
        }

        @JavascriptInterface
        fun isNotificationPermissionGranted(): Boolean = hasNotificationPermission()

        @JavascriptInterface
        fun requestNotificationPermission() {
            runOnUiThread {
                if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) return@runOnUiThread
                notificationPermissionLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
            }
        }

        @JavascriptInterface
        fun isStoragePermissionGranted(): Boolean = hasStoragePermission()

        @JavascriptInterface
        fun requestStoragePermission() {
            runOnUiThread { requestStoragePermissionInternal() }
        }

        @JavascriptInterface
        fun isLocationPermissionGranted(): Boolean = hasLocationPermission()

        @JavascriptInterface
        fun requestLocationPermission() {
            runOnUiThread { requestLocationPermissionInternal() }
        }

        @JavascriptInterface
        fun isCameraPermissionGranted(): Boolean = hasCameraPermission()

        @JavascriptInterface
        fun isMicrophonePermissionGranted(): Boolean = hasRecordAudioPermission()

        @JavascriptInterface
        fun requestCameraAndMicrophonePermissions() {
            runOnUiThread { requestCameraMicPermissionInternal() }
        }

        @JavascriptInterface
        fun getAppVersion(): String {
            return try {
                packageManager.getPackageInfo(packageName, 0).versionName ?: "1.0"
            } catch (_: Exception) {
                "1.0"
            }
        }

        @JavascriptInterface
        fun getAppVersionCode(): Int {
            return try {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                    packageManager.getPackageInfo(packageName, 0).longVersionCode.toInt()
                } else {
                    @Suppress("DEPRECATION")
                    packageManager.getPackageInfo(packageName, 0).versionCode
                }
            } catch (_: Exception) {
                1
            }
        }

        @JavascriptInterface
        fun showUpdateNotification(title: String?, body: String?) {
            if (!hasNotificationPermission()) return
            val intent = Intent(Intent.ACTION_VIEW, Uri.parse(PLAY_STORE_URL)).apply {
                flags = Intent.FLAG_ACTIVITY_NEW_TASK
            }
            val pendingIntent = PendingIntent.getActivity(
                this@MainActivity,
                0,
                intent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )

            val notification = NotificationCompat.Builder(this@MainActivity, UPDATE_CHANNEL_ID)
                .setSmallIcon(android.R.drawable.ic_dialog_info)
                .setContentTitle(title?.takeIf { it.isNotBlank() } ?: "App Update Available")
                .setContentText(body?.takeIf { it.isNotBlank() } ?: "A new version is available. Tap to update.")
                .setStyle(NotificationCompat.BigTextStyle().bigText(body?.takeIf { it.isNotBlank() } ?: "A new version of Pazar Fiyatı is available."))
                .setAutoCancel(true)
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .setContentIntent(pendingIntent)
                .build()

            try {
                NotificationManagerCompat.from(this@MainActivity).notify(99999, notification)
            } catch (_: SecurityException) {
                // Notification permission not granted on Android 13+
            }
        }

        @JavascriptInterface
        fun openUpdateLink() {
            runOnUiThread {
                val intent = Intent(Intent.ACTION_VIEW, Uri.parse(PLAY_STORE_URL)).apply {
                    flags = Intent.FLAG_ACTIVITY_NEW_TASK
                }
                startActivity(intent)
            }
        }

        @JavascriptInterface
        fun showNotification(title: String?, body: String?, tag: String?): Boolean {
            if (!hasNotificationPermission()) return false

            val intent = Intent(this@MainActivity, MainActivity::class.java).apply {
                flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
            }
            val pendingIntent = PendingIntent.getActivity(
                this@MainActivity,
                0,
                intent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )

            val notification = NotificationCompat.Builder(this@MainActivity, NOTIFICATION_CHANNEL_ID)
                .setSmallIcon(android.R.drawable.ic_dialog_info)
                .setContentTitle(title?.takeIf { it.isNotBlank() } ?: getString(R.string.app_name))
                .setContentText(body?.takeIf { it.isNotBlank() } ?: "")
                .setStyle(NotificationCompat.BigTextStyle().bigText(body?.takeIf { it.isNotBlank() } ?: ""))
                .setAutoCancel(true)
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .setContentIntent(pendingIntent)
                .build()

            NotificationManagerCompat.from(this@MainActivity).notify(
                (tag ?: "dessert-scraper").hashCode(),
                notification
            )
            return true
        }

        @JavascriptInterface
        fun saveData(key: String?, value: String?) {
            if (key == null) return
            getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE).edit {
                putString(key, value ?: "")
            }
        }

        @JavascriptInterface
        fun loadData(key: String?): String? {
            if (key == null) return null
            return getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE).getString(key, null)
        }

        @JavascriptInterface
        fun removeData(key: String?) {
            if (key == null) return
            getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE).edit {
                remove(key)
            }
        }

        @JavascriptInterface
        fun getExternalStoragePath(): String {
            return getExternalFilesDir(null)?.absolutePath ?: filesDir.absolutePath
        }
    }

    private fun hasNotificationPermission(): Boolean {
        return Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU ||
            ContextCompat.checkSelfPermission(
                this,
                Manifest.permission.POST_NOTIFICATIONS
            ) == PackageManager.PERMISSION_GRANTED
    }

    private fun hasStoragePermission(): Boolean {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            return ContextCompat.checkSelfPermission(
                this,
                Manifest.permission.READ_MEDIA_IMAGES
            ) == PackageManager.PERMISSION_GRANTED
        }
        return ContextCompat.checkSelfPermission(
            this,
            Manifest.permission.WRITE_EXTERNAL_STORAGE
        ) == PackageManager.PERMISSION_GRANTED
    }

    private fun hasLocationPermission(): Boolean {
        return ContextCompat.checkSelfPermission(
            this,
            Manifest.permission.ACCESS_FINE_LOCATION
        ) == PackageManager.PERMISSION_GRANTED ||
            ContextCompat.checkSelfPermission(
                this,
                Manifest.permission.ACCESS_COARSE_LOCATION
            ) == PackageManager.PERMISSION_GRANTED
    }

    private fun hasCameraPermission(): Boolean {
        return ContextCompat.checkSelfPermission(
            this,
            Manifest.permission.CAMERA
        ) == PackageManager.PERMISSION_GRANTED
    }

    private fun hasRecordAudioPermission(): Boolean {
        return ContextCompat.checkSelfPermission(
            this,
            Manifest.permission.RECORD_AUDIO
        ) == PackageManager.PERMISSION_GRANTED
    }

    private fun requestLocationPermissionInternal() {
        if (hasLocationPermission()) return
        locationPermissionLauncher.launch(
            arrayOf(
                Manifest.permission.ACCESS_FINE_LOCATION,
                Manifest.permission.ACCESS_COARSE_LOCATION
            )
        )
    }

    private fun requestCameraMicPermissionInternal() {
        val needed = mutableListOf<String>()
        if (!hasCameraPermission()) needed.add(Manifest.permission.CAMERA)
        if (!hasRecordAudioPermission()) needed.add(Manifest.permission.RECORD_AUDIO)
        if (needed.isEmpty()) return
        cameraMicPermissionLauncher.launch(needed.toTypedArray())
    }

    private fun requestStoragePermissionInternal() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            multiPermissionLauncher.launch(
                arrayOf(
                    Manifest.permission.READ_MEDIA_IMAGES,
                    Manifest.permission.READ_MEDIA_VIDEO,
                    Manifest.permission.READ_MEDIA_AUDIO
                )
            )
        } else {
            storagePermissionLauncher.launch(Manifest.permission.WRITE_EXTERNAL_STORAGE)
        }
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return

        val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        val channel = NotificationChannel(
            NOTIFICATION_CHANNEL_ID,
            "Pazar Fiyatı Alerts",
            NotificationManager.IMPORTANCE_HIGH
        ).apply {
            description = "Alerts for Pazar Fiyatı"
        }
        manager.createNotificationChannel(channel)
    }

    private fun createUpdateChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return

        val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        val channel = NotificationChannel(
            UPDATE_CHANNEL_ID,
            "Pazar Fiyatı Updates",
            NotificationManager.IMPORTANCE_HIGH
        ).apply {
            description = "App update notifications"
            enableLights(true)
            enableVibration(true)
        }
        manager.createNotificationChannel(channel)
    }

    private fun checkForAppUpdate() {
        val prefs = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        val lastCheck = prefs.getLong(LAST_VERSION_CHECK, 0)
        val now = System.currentTimeMillis()
        if (now - lastCheck < CHECK_INTERVAL_MS) return

        prefs.edit { putLong(LAST_VERSION_CHECK, now) }

        Executors.newSingleThreadExecutor().execute {
            try {
                val url = URL(VERSION_CHECK_URL)
                val connection = url.openConnection() as HttpURLConnection
                connection.connectTimeout = 5000
                connection.readTimeout = 5000
                val response = connection.inputStream.bufferedReader().use { it.readText() }

                val versionCodeMatch = Regex("versionCode\\s*=\\s*(\\d+)").find(response)
                val versionNameMatch = Regex("versionName\\s*=\\s*\"([^\"]+)\"").find(response)

                val remoteVersionCode = versionCodeMatch?.groupValues?.get(1)?.toIntOrNull()
                val remoteVersionName = versionNameMatch?.groupValues?.get(1)

                val currentVersionCode = try {
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                        packageManager.getPackageInfo(packageName, 0).longVersionCode.toInt()
                    } else {
                        @Suppress("DEPRECATION")
                        packageManager.getPackageInfo(packageName, 0).versionCode
                    }
                } catch (_: Exception) { 1 }

                if (remoteVersionCode != null && remoteVersionCode > currentVersionCode) {
                    runOnUiThread {
                        val bridge = AndroidBridge()
                        bridge.showUpdateNotification(
                            "Update Available",
                            "Pazar Fiyatı $remoteVersionName is available. Tap to update."
                        )
                    }
                }
            } catch (_: Exception) {
                // Silently fail - check again next time
            }
        }
    }
}
