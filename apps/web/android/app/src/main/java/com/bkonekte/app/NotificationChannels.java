package com.bkonekte.app;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.Context;
import android.media.AudioAttributes;
import android.media.RingtoneManager;
import android.os.Build;

/**
 * Каналы уведомлений для FCM.
 *
 * Идентификаторы каналов должны совпадать с channelId, который сервер
 * указывает в FCM-сообщении (см. apps/server/src/pushService.ts).
 */
final class NotificationChannels {

    static final String MESSAGES = "bkonekte_messages";
    static final String CALLS = "bkonekte_calls";

    private NotificationChannels() {
    }

    static void create(Context context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            // До Android 8 каналы не нужны
            return;
        }

        NotificationManager manager = context.getSystemService(NotificationManager.class);
        if (manager == null) {
            return;
        }

        // ── Сообщения ──
        NotificationChannel messages = new NotificationChannel(
                MESSAGES,
                "Сообщения",
                NotificationManager.IMPORTANCE_HIGH
        );
        messages.setDescription("Новые сообщения в чатах");
        messages.enableVibration(true);
        messages.setVibrationPattern(new long[]{0, 200, 100, 200});
        messages.setLightColor(0xFF6366F1);
        manager.createNotificationChannel(messages);

        // ── Звонки ──
        NotificationChannel calls = new NotificationChannel(
                CALLS,
                "Звонки",
                NotificationManager.IMPORTANCE_HIGH
        );
        calls.setDescription("Входящие аудио- и видеозвонки");
        calls.enableVibration(true);
        calls.setVibrationPattern(new long[]{0, 300, 100, 300, 100, 300});
        calls.setLightColor(0xFF6366F1);
        calls.setSound(
                RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE),
                new AudioAttributes.Builder()
                        .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                        .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
                        .build()
        );
        manager.createNotificationChannel(calls);
    }
}
