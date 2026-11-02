import { useEffect, useState } from 'react';

type Field = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

const FIELDS = 'input:invalid, select:invalid, textarea:invalid';

/**
 * Says why a form didn't send. The browser blocks a form with an empty
 * required field, but Firefox for Android shows no message, and the field it
 * jumps to can end up under the sticky header, so it looked like the button
 * did nothing. This brings the first such field into the middle of the screen
 * and names it.
 */
export function FormHint() {
  const [hint, setHint] = useState<string | null>(null);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onInvalid = (e: Event) => {
      const field = e.target as Field;
      if (!field.validity) return;
      // Ours replaces the browser's own bubble, so every browser looks alike.
      e.preventDefault();
      // The event fires for each bad field; deal with the first only.
      if (field.form && field.form.querySelector(FIELDS) !== field) return;
      field.scrollIntoView({ block: 'center', behavior: 'smooth' });
      field.focus({ preventScroll: true });
      const label =
        field.labels?.[0]?.textContent?.trim() ||
        field.getAttribute('aria-label');
      setHint(
        field.validity.valueMissing && label
          ? `Fill in “${label}” first.`
          : field.validationMessage,
      );
      clearTimeout(timer);
      timer = setTimeout(() => setHint(null), 6000);
    };
    const onInput = () => setHint(null);
    document.addEventListener('invalid', onInvalid, true);
    document.addEventListener('input', onInput, true);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('invalid', onInvalid, true);
      document.removeEventListener('input', onInput, true);
    };
  }, []);

  if (!hint) return null;
  return (
    <div
      role="alert"
      className="fixed inset-x-4 bottom-24 z-40 mx-auto max-w-md rounded-2xl bg-red-600 p-3 text-sm font-medium text-white shadow-lg"
    >
      {hint}
    </div>
  );
}
