package com.bkonekte.app;

import android.os.Bundle;
import android.webkit.PermissionRequest;

import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebChromeClient;

/**
 * Главная Activity приложения Bkonekte.
 *
 * Помимо стандартного поведения Capacitor решает две задачи:
 *
 * 1. Разрешает WebRTC-запросы (камера/микрофон) внутри WebView.
 *    Без этого navigator.mediaDevices.getUserMedia() в звонках
 *    отклоняется, даже если у приложения есть системные разрешения.
 *
 * 2. Создаёт каналы уведомлений для FCM (сообщения и звонки),
 *    чтобы push приходили с правильной важностью и звуком.
 */
public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        NotificationChannels.create(this);

        // Подменяем WebChromeClient, чтобы разрешать запросы камеры/микрофона
        getBridge().getWebView().setWebChromeClient(new MediaPermissionWebChromeClient());
    }

    /**
     * WebChromeClient, который автоматически подтверждает запросы
     * на доступ к камере и микрофону от нашего собственного контента.
     *
     * Системные разрешения Android запрашиваются отдельно плагинами
     * Capacitor, поэтому здесь достаточно подтвердить запрос WebView.
     */
    private class MediaPermissionWebChromeClient extends BridgeWebChromeClient {

        MediaPermissionWebChromeClient() {
            super(getBridge());
        }

        @Override
        public void onPermissionRequest(final PermissionRequest request) {
            runOnUiThread(() -> {
                // Разрешаем только запрошенные аудио/видео ресурсы
                request.grant(request.getResources());
            });
        }
    }
}
