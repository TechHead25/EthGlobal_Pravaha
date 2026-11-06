"use client";

import { PageHeader } from "@/components/ui/primitives";
import { LiveStatus } from "./common";

export function RoleHeader({ eyebrow, title, description, actions }: { eyebrow: string; title: string; description?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <PageHeader
      eyebrow={eyebrow}
      title={title}
      description={description}
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <LiveStatus />
          {actions}
        </div>
      }
    />
  );
}
