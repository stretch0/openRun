import { useState } from 'react';
import { clubInitials, clubLogoColour } from '@openrun/domain';

const SIZES = {
  sm: 'size-6 rounded-md text-[0.625rem]',
  md: 'size-10 rounded-lg text-sm',
  lg: 'size-16 rounded-xl text-xl',
};

/**
 * A club's uploaded logo, or its initials on a colour of its own. Decorative:
 * the club's name is always shown next to it.
 */
export function ClubLogo({
  club,
  size = 'md',
}: {
  club: { id: string; name: string; logoUrl: string | null };
  size?: keyof typeof SIZES;
}) {
  // Offline with nothing cached, say: fall back to the initials.
  const [failed, setFailed] = useState<string | null>(null);
  const box = `${SIZES[size]} shrink-0 ring-1 ring-black/5 dark:ring-white/10`;
  if (club.logoUrl && failed !== club.logoUrl) {
    return (
      <img
        src={club.logoUrl}
        alt=""
        className={`${box} bg-white object-cover`}
        onError={() => setFailed(club.logoUrl)}
        data-testid="club-logo"
      />
    );
  }
  return (
    <span
      aria-hidden
      className={`${box} inline-flex items-center justify-center font-semibold tracking-wide text-white select-none`}
      style={{ backgroundColor: clubLogoColour(club.id) }}
      data-testid="club-initials"
    >
      {clubInitials(club.name)}
    </span>
  );
}
