import { useEffect } from 'react';

// Reads env from Vite. Configure in .env as needed:
// VITE_POSTHOG_KEY=phc_...
// VITE_POSTHOG_HOST=https://app.posthog.com
// VITE_SENTRY_DSN=...
// VITE_SENTRY_ENV=production

const Analytics = () => {
  useEffect(() => {
    const phKey = import.meta.env.VITE_POSTHOG_KEY as string | undefined;
    const phHost = (import.meta.env.VITE_POSTHOG_HOST as string | undefined) || 'https://app.posthog.com';
    if (phKey && typeof window !== 'undefined') {
      // Load PostHog via CDN
      const s = document.createElement('script');
      s.async = true;
      s.src = 'https://unpkg.com/posthog-js@latest';
      s.onload = () => {
        try {
          // @ts-ignore: window.posthog provided by CDN
          window.posthog?.init(phKey, { api_host: phHost, autocapture: true, capture_pageview: true });
          // @ts-ignore
          window.posthog?.capture('app_loaded');
        } catch {}
      };
      document.head.appendChild(s);
    }

    const sentryDsn = import.meta.env.VITE_SENTRY_DSN as string | undefined;
    const sentryEnv = (import.meta.env.VITE_SENTRY_ENV as string | undefined) || import.meta.env.MODE;
    if (sentryDsn && typeof window !== 'undefined') {
      // Load Sentry via CDN
      const s1 = document.createElement('script');
      s1.src = 'https://browser.sentry-cdn.com/7.119.0/bundle.tracing.replay.min.js';
      s1.crossOrigin = 'anonymous';
      s1.async = true;
      s1.onload = () => {
        try {
          // @ts-ignore
          Sentry.init({
            dsn: sentryDsn,
            environment: sentryEnv,
            integrations: [
              // @ts-ignore
              new Sentry.BrowserTracing(),
              // @ts-ignore
              new Sentry.Replay({ maskAllText: true, blockAllMedia: true })
            ],
            tracesSampleRate: 0.1,
            replaysSessionSampleRate: 0.0,
            replaysOnErrorSampleRate: 0.1,
          });
        } catch {}
      };
      document.head.appendChild(s1);
    }
  }, []);

  return null;
};

export default Analytics;
