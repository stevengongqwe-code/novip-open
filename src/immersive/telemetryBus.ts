/**
 * NOVIP Immersion Telemetry Bus
 * Couples user interactions (card hover, tool execution, scenario filters)
 * with the WebGL shader energy uniform and the holographic telemetry bar.
 */

export interface ImmersionTelemetryPayload {
  code: string;
  label: string;
  energyBoost?: number;
}

const TELEMETRY_EVENT_NAME = 'novip:immersion-telemetry';

export function emitImmersionTelemetry(payload: ImmersionTelemetryPayload): void {
  if (typeof window === 'undefined' || typeof CustomEvent === 'undefined') return;
  try {
    window.dispatchEvent(
      new CustomEvent<ImmersionTelemetryPayload>(TELEMETRY_EVENT_NAME, {
        detail: payload,
      })
    );
  } catch {
    // ignore in restricted environments
  }
}

export function subscribeImmersionTelemetry(
  handler: (payload: ImmersionTelemetryPayload) => void
): () => void {
  if (typeof window === 'undefined') return () => {};
  const listener = (event: Event) => {
    const custom = event as CustomEvent<ImmersionTelemetryPayload>;
    if (custom.detail && typeof custom.detail.label === 'string') {
      handler(custom.detail);
    }
  };
  window.addEventListener(TELEMETRY_EVENT_NAME, listener);
  return () => {
    window.removeEventListener(TELEMETRY_EVENT_NAME, listener);
  };
}
