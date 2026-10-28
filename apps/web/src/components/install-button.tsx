import { useEffect, useState } from 'react';

type InstallPromptEvent = Event & { prompt: () => Promise<void> };

/** Shows an install button when the browser offers to install the PWA. */
export function InstallButton() {
  const [event, setEvent] = useState<InstallPromptEvent | null>(null);

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setEvent(e as InstallPromptEvent);
    };
    const onInstalled = () => setEvent(null);
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  if (!event) return null;
  return (
    <button className="btn-secondary w-full" onClick={() => event.prompt()}>
      Install openRun on this device
    </button>
  );
}
