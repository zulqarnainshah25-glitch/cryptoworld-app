export interface SwPreflightResponse {
  ok: boolean;
  status: number;
  type?: string;
}

/**
 * Determines whether a Service Worker script URL can be safely registered
 * without violating the browser's "script resource is behind a redirect" rule.
 */
export function isSafeSwResponse(res: SwPreflightResponse | null | undefined): boolean {
  if (!res) return false;
  if (res.type === 'opaqueredirect') return false;
  if (res.status >= 300 && res.status < 400) return false;
  return Boolean(res.ok) && res.status >= 200 && res.status < 300;
}

export interface RegisterAppServiceWorkerOptions {
  isProd: boolean;
  isNative: boolean;
  nav?: {
    serviceWorker?: {
      register: (scriptURL: string, options?: { scope?: string }) => Promise<unknown>;
      getRegistrations?: () => Promise<ReadonlyArray<{
        active?: { scriptURL?: string } | null;
        installing?: { scriptURL?: string } | null;
        waiting?: { scriptURL?: string } | null;
        unregister: () => Promise<boolean>;
      }>>;
    };
  };
  fetcher?: (url: string, init?: RequestInit) => Promise<SwPreflightResponse>;
}

/**
 * Safely manages Service Worker lifecycle:
 * - In development (e.g. AI Studio Run preview behind Cloud Run proxy), skips registration
 *   and cleans up any stale dev-sw.js registrations so redirect errors never occur.
 * - In Capacitor native WebView, skips browser SW registration.
 * - In production web deployments, pre-checks `/sw.js` with `redirect: 'manual'` before registering.
 */
export async function manageServiceWorkerLifecycle(opts: RegisterAppServiceWorkerOptions): Promise<'CLEANED_DEV' | 'SKIPPED_NATIVE' | 'SKIPPED_UNSUPPORTED' | 'SKIPPED_REDIRECT' | 'REGISTERED' | 'FAILED'> {
  const swContainer = opts.nav?.serviceWorker;
  if (!swContainer) {
    return 'SKIPPED_UNSUPPORTED';
  }

  if (opts.isNative) {
    return 'SKIPPED_NATIVE';
  }

  // Never register /dev-sw.js in dev mode; also purge any stale dev-sw.js workers
  if (!opts.isProd) {
    try {
      if (typeof swContainer.getRegistrations === 'function') {
        const regs = await swContainer.getRegistrations();
        await Promise.all(
          regs
            .filter((reg) => {
              const url =
                reg.active?.scriptURL ||
                reg.installing?.scriptURL ||
                reg.waiting?.scriptURL ||
                '';
              return url.includes('dev-sw.js');
            })
            .map((reg) => reg.unregister().catch(() => false))
        );
      }
    } catch {
      // Ignore cleanup errors in restricted contexts
    }
    return 'CLEANED_DEV';
  }

  // Production web: preflight /sw.js with redirect: 'manual' to guarantee no redirect
  try {
    const fetchFn = opts.fetcher ?? ((url, init) => fetch(url, init));
    const headRes = await fetchFn('/sw.js', {
      method: 'HEAD',
      redirect: 'manual',
      cache: 'no-store',
    });

    if (!isSafeSwResponse(headRes)) {
      return 'SKIPPED_REDIRECT';
    }

    await swContainer.register('/sw.js', { scope: '/' });
    return 'REGISTERED';
  } catch {
    return 'FAILED';
  }
}
