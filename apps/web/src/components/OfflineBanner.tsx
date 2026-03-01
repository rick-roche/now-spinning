import { Icon } from "./Icon";

export function OfflineBanner() {
  return (
    <div
      className="bg-amber-500/10 border-b border-amber-500/30 text-amber-700 dark:text-amber-200 px-4 py-2 text-sm flex items-center gap-2"
      role="status"
      aria-live="polite"
    >
      <Icon name="wifi_off" className="text-base" aria-hidden="true" />
      <span>You are offline. Changes will sync when you reconnect.</span>
    </div>
  );
}
