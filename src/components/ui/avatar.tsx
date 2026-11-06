"use client";

import * as React from "react";
import * as AvatarPrimitive from "@radix-ui/react-avatar";
import { cn } from "@/lib/utils";

export function UserAvatar({
  name,
  image,
  className,
}: {
  name?: string | null;
  image?: string | null;
  className?: string;
}) {
  const initials =
    (name || "?")
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase())
      .join("") || "?";
  return (
    <AvatarPrimitive.Root className={cn("relative flex h-8 w-8 shrink-0 overflow-hidden rounded-full bg-muted", className)}>
      {image ? (
        <AvatarPrimitive.Image src={image} alt="" referrerPolicy="no-referrer" className="aspect-square h-full w-full object-cover" />
      ) : null}
      <AvatarPrimitive.Fallback className="flex h-full w-full items-center justify-center bg-ink-800 text-xs font-semibold text-white">
        {initials}
      </AvatarPrimitive.Fallback>
    </AvatarPrimitive.Root>
  );
}
