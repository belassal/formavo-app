/**
 * Crash reporting + analytics wiring.
 * - Native crashes: collected automatically by Crashlytics once the pod is in.
 * - JS errors: installJsErrorReporting() records fatal/non-fatal JS errors to
 *   Crashlytics (then defers to RN's own handler, so the redbox/dev behavior
 *   is unchanged).
 * - Screens: logScreenView() is called from NavigationContainer's
 *   onStateChange with the focused route name.
 * - setTelemetryUser() tags reports/events with the uid so a crash can be
 *   matched to a bug report; cleared on sign-out.
 */
import analytics from '@react-native-firebase/analytics';
import crashlytics from '@react-native-firebase/crashlytics';

export function installJsErrorReporting() {
  const globalAny = globalThis as any;
  const ErrorUtils = globalAny.ErrorUtils;
  if (!ErrorUtils || globalAny.__formavoErrorHookInstalled) return;
  globalAny.__formavoErrorHookInstalled = true;

  const previous = ErrorUtils.getGlobalHandler?.();
  ErrorUtils.setGlobalHandler((error: any, isFatal?: boolean) => {
    try {
      crashlytics().recordError(
        error instanceof Error ? error : new Error(String(error)),
        isFatal ? 'js_fatal' : 'js_error',
      );
    } catch {}
    previous?.(error, isFatal);
  });
}

// NOTE: every call below is wrapped in try/catch — RNFirebase throws
// synchronously if the app binary predates the analytics/crashlytics pods
// (Metro-reloaded JS on an old native build). Telemetry just no-ops there.

export function logScreenView(routeName: string) {
  try {
    analytics()
      .logScreenView({ screen_name: routeName, screen_class: routeName })
      .catch(() => {});
  } catch {}
}

export async function setTelemetryUser(uid: string | null) {
  try {
    await Promise.all([
      analytics().setUserId(uid),
      crashlytics().setUserId(uid ?? ''),
    ]);
  } catch {}
}

/** Log a named product event (keep names snake_case, e.g. 'match_completed'). */
export function logEvent(name: string, params?: Record<string, any>) {
  try {
    analytics().logEvent(name, params).catch(() => {});
  } catch {}
}
