import Image from 'next/image';

export default function AnptcoLogo({
  className = 'w-7 h-7',
}: {
  className?: string;
}) {
  return (
    <Image
      src="/ANPTCOLOGO.png"
      alt="ANPTCO"
      width={32}
      height={32}
      className={className}
      priority
    />
  );
}