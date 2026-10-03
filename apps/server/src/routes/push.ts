import { Router } from 'express';
import { AuthRequest } from '../middleware/auth';
import { config } from '../config';
import {
  saveSubscription,
  removeSubscription,
  saveDeviceToken,
  removeDeviceToken,
} from '../pushService';

const router = Router();

// Получить VAPID public key
router.get('/vapid-public-key', (_req, res) => {
  res.json({ publicKey: config.vapidPublicKey });
});

// Подписаться на push-уведомления
router.post('/subscribe', async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const { subscription } = req.body;

    if (!subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) {
      res.status(400).json({ error: 'Неверный формат подписки' });
      return;
    }

    await saveSubscription(userId, subscription);
    res.json({ success: true });
  } catch (error) {
    console.error('Push subscribe error:', error);
    res.status(500).json({ error: 'Ошибка сохранения подписки' });
  }
});

// Отписаться от push-уведомлений
router.post('/unsubscribe', async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const { endpoint } = req.body;

    if (!endpoint) {
      res.status(400).json({ error: 'Не указан endpoint' });
      return;
    }

    await removeSubscription(userId, endpoint);
    res.json({ success: true });
  } catch (error) {
    console.error('Push unsubscribe error:', error);
    res.status(500).json({ error: 'Ошибка удаления подписки' });
  }
});

// ─── Нативные push-токены (FCM) ────────────────────────────────────────

// Зарегистрировать токен устройства
router.post('/device', async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const { token, platform } = req.body;

    if (typeof token !== 'string' || token.length < 10 || token.length > 4096) {
      res.status(400).json({ error: 'Неверный push-токен' });
      return;
    }

    if (platform !== 'android' && platform !== 'ios') {
      res.status(400).json({ error: 'Неверная платформа' });
      return;
    }

    await saveDeviceToken(userId, token, platform);
    res.json({ success: true });
  } catch (error) {
    console.error('Device token save error:', error);
    res.status(500).json({ error: 'Ошибка сохранения токена' });
  }
});

// Удалить токен устройства (выход из аккаунта)
router.delete('/device', async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const { token } = req.body;

    if (typeof token !== 'string' || !token) {
      res.status(400).json({ error: 'Не указан токен' });
      return;
    }

    await removeDeviceToken(userId, token);
    res.json({ success: true });
  } catch (error) {
    console.error('Device token remove error:', error);
    res.status(500).json({ error: 'Ошибка удаления токена' });
  }
});

export default router;