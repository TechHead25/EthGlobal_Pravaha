"use client";

import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/primitives";

/** Error boundary for the workspace. Never renders the raw error message. */
export default function WorkspaceError({ reset, error }: { reset: () => void; error: Error & { digest?: string } }) {
  return (
    <EmptyState
      icon={AlertTriangle}
      title="This page could not be loaded"
      description={
        <>
          A server or network error occurred. If this persists, check the integration status or try again later.
          {error.digest ? <span className="mt-2 block font-mono text-xs">Reference: {error.digest}</span> : null}
        </>
      }
      action={<Button onClick={reset}>Try again</Button>}
      className="mt-10"
    />
  );
}
