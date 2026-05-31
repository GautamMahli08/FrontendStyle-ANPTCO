import Image from 'next/image';

/**
 * OomcoLogo — the official OOMCO brand mark, served from public/oomco-logo.svg.
 * Pass a Tailwind size via `className` (e.g. "w-7 h-7").
 */
export default function OomcoLogo({ className = 'w-7 h-7' }: { className?: string }) {
  return (
    <Image
      src="/oomco-logo.svg"
      alt="OOMCO"
      width={32}
      height={32}
      className={className}
      priority
    />
  );
}
