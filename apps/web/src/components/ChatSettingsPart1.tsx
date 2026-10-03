import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft, MoreVertical, ChevronRight, Check, Lock,
  Sun, Moon, Image, Palette,
  Smartphone, Globe, Zap, MousePointer2,
  Mic, Send, Ruler, RefreshCw, Eye, EyeOff,
  Sticker, Play, Pause, Phone,
} from 'lucide-react';
import { useAuthStore } from '../stores/authStore';
import { useLang } from '../lib/i18n';
import { useChatSettingsStore, COLOR_THEMES, APP_ICONS } from '../stores/chatSettingsStore';
import type { AppIcon, SwipeAction, DistanceUnit } from '../stores/chatSettingsStore';
