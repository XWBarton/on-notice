"use client";

import Image from "next/image";
import { useSearchParams } from "next/navigation";

export function HeaderLogo() {
  const searchParams = useSearchParams();
  const isSenate = searchParams.get("parliament") === "fed_sen";

  return (
    <a href="/" className="flex items-center gap-2.5">
      <Image
        src={isSenate ? "/icon-senate.svg" : "/icon.svg"}
        alt="On Notice"
        width={32}
        height={32}
      />
      <span className="text-xl font-bold tracking-tight">On Notice</span>
    </a>
  );
}
