import { useRegisterSW } from 'virtual:pwa-register/react';

/** Tells the user when a new version has been installed and offers to reload. */
export function UpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW();

  if (!needRefresh) return null;
  return (
    <div className="fixed inset-x-4 bottom-24 z-40 mx-auto flex max-w-md items-center gap-3 rounded-2xl bg-stone-900 p-3 text-sm text-white shadow-lg">
      <span className="flex-1">A new version of openRun is available.</span>
      <button
        className="font-semibold text-brand-500"
        onClick={() => setNeedRefresh(false)}
      >
        Later
      </button>
      <button
        className="rounded-lg bg-brand-600 px-3 py-1.5 font-semibold"
        onClick={() => updateServiceWorker(true)}
      >
        Reload
      </button>
    </div>
  );
}
