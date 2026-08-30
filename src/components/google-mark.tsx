/** Google's four-colour G. Drawn, and its colours are Google's brand asset —
 *  they are deliberately not palette tokens and must not be re-themed. */
export function GoogleMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={className}>
      <path
        fill="#4285F4"
        d="M23.06 12.25c0-.85-.08-1.67-.22-2.45H12v4.63h6.2a5.3 5.3 0 0 1-2.3 3.48v2.89h3.72c2.18-2 3.44-4.96 3.44-8.55Z"
      />
      <path
        fill="#34A853"
        d="M12 23.5c3.11 0 5.72-1.03 7.62-2.8l-3.72-2.89c-1.03.69-2.35 1.1-3.9 1.1-3 0-5.54-2.03-6.45-4.75H1.7v2.98A11.5 11.5 0 0 0 12 23.5Z"
      />
      <path
        fill="#FBBC05"
        d="M5.55 14.16a6.9 6.9 0 0 1 0-4.32V6.86H1.7a11.5 11.5 0 0 0 0 10.28l3.85-2.98Z"
      />
      <path
        fill="#EA4335"
        d="M12 5.09c1.69 0 3.21.58 4.4 1.72l3.3-3.3C17.72 1.65 15.11.5 12 .5A11.5 11.5 0 0 0 1.7 6.86l3.85 2.98C6.46 7.12 9 5.09 12 5.09Z"
      />
    </svg>
  );
}
