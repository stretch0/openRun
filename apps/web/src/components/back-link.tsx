import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

/**
 * "← Somewhere" at the top of a page. The arrow is drawn rather than typed,
 * because the text arrow sits low against the words in most fonts.
 */
export function BackLink({
  to,
  children,
}: {
  to: string;
  children: ReactNode;
}) {
  return (
    <Link
      to={to}
      className="inline-flex max-w-full items-center gap-1.5 text-sm text-brand-600"
    >
      <svg
        viewBox="0 0 16 16"
        className="size-4 shrink-0"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d="M13 8H3m4-4L3 8l4 4" />
      </svg>
      {children}
    </Link>
  );
}
