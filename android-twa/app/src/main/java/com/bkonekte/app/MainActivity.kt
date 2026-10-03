package com.bkonekte.app

import android.os.Bundle
import com.google.androidbrowserhelper.trusted.LauncherActivity

/**
 * TWA (Trusted Web Activity) для Bkonekte PWA
 *
 * Использует библиотеку androidbrowserhelper от Google.
 * LauncherActivity автоматически:
 *   — проверяет Digital Asset Links для верификации домена
 *   — открывает PWA в полноэкранном режиме (без адресной строки)
 *   — обрабатывает deep links
 *   — показывает splash screen
 */
class MainActivity : LauncherActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // URL вашего PWA — используется из BuildConfig
        val url = BuildConfig.TWA_URL
    }

    companion object {
        // SHA256 отпечаток сертификата для Digital Asset Links
        const val SHA256_CERT_FINGERPRINT = "AD:60:ED:2D:37:BB:73:85:30:29:3D:DA:92:C3:0C:29:F6:C2:09:E2:9B:F6:66:70:0E:C1:67:4B:6D:10:43:E7"
    }
}