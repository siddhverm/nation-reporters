'use client';

import { useEffect, useMemo, useState } from 'react';

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
};

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export function PwaAndSubscribe() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installDismissed, setInstallDismissed] = useState(false);
  const [subscribeState, setSubscribeState] = useState<'idle' | 'subscribed' | 'error'>('idle');
  const [isBusy, setIsBusy] = useState(false);
  const [swReady, setSwReady] = useState(false);
  const baseApi = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1';
  const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? '';

  const canShowInstall = useMemo(
    () => !!deferredPrompt && !installDismissed,
    [deferredPrompt, installDismissed],
  );

  useEffect(() => {
    if (typeof window === 'undefined') return;
    setInstallDismissed(localStorage.getItem('nr-install-dismissed') === '1');

    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
    };

    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
    return () => window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('/sw.js')
      .then(() => setSwReady(true))
      .catch(() => setSwReady(false));
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;
    if (choice.outcome === 'accepted') {
      setDeferredPrompt(null);
    }
  };

  const dismissInstall = () => {
    setInstallDismissed(true);
    localStorage.setItem('nr-install-dismissed', '1');
  };

  const handleSubscribe = async () => {
    if (!swReady || !('PushManager' in window) || !vapidPublicKey) {
      setSubscribeState('error');
      return;
    }
    setIsBusy(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setSubscribeState('error');
        return;
      }

      const registration = await navigator.serviceWorker.ready;
      let subscription = await registration.pushManager.getSubscription();
      if (!subscription) {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
        });
      }

      await fetch(`${baseApi}/notifications/subscribe-webpush`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          endpoint: subscription.endpoint,
          keys: subscription.toJSON().keys,
          language: navigator.language,
          userAgent: navigator.userAgent,
        }),
      });
      setSubscribeState('subscribed');
    } catch (_) {
      setSubscribeState('error');
    } finally {
      setIsBusy(false);
    }
  };

  if (!canShowInstall && subscribeState === 'subscribed') return null;

  return (
    <div className="bg-blue-50 border-b border-blue-100">
      <div className="max-w-7xl mx-auto px-4 py-2 flex flex-wrap items-center gap-2 text-xs text-blue-900">
        {canShowInstall && (
          <>
            <span>Install Nation Reporters app for a faster experience.</span>
            <button onClick={handleInstall} className="bg-blue-600 text-white px-2 py-1 rounded">
              Install App
            </button>
            <button onClick={dismissInstall} className="text-blue-700 underline px-1">
              Later
            </button>
          </>
        )}
        <span className={canShowInstall ? 'mx-2' : ''}>
          Subscribe to breaking news notifications.
        </span>
        <button
          onClick={handleSubscribe}
          disabled={isBusy || subscribeState === 'subscribed'}
          className="bg-brand text-white px-2 py-1 rounded disabled:opacity-60"
        >
          {subscribeState === 'subscribed' ? 'Subscribed' : isBusy ? 'Subscribing...' : 'Subscribe'}
        </button>
        {subscribeState === 'error' && (
          <span className="text-red-600">Enable notifications and ensure VAPID key is configured.</span>
        )}
      </div>
    </div>
  );
}
