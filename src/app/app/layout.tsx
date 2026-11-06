import type { Metadata } from "next";
import { AppShell } from "@/components/app/app-shell";
import { navFor } from "@/components/app/nav-config";
import { WalletProvider } from "@/components/wallet/wallet-provider";
import { requirePrincipal } from "@/server/session";
import { getStore } from "@/server/db";
import { buildNotifications } from "@/server/notifications";
import { signOutAction } from "./actions";

export const metadata: Metadata = { title: { default: "Workspace", template: "%s · OpenAid" }, robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const principal = await requirePrincipal("dashboard:view");
  const notifications = await buildNotifications(getStore(), principal).catch(() => []);
  return (
    <AppShell
      user={{ name: principal.name, email: principal.email, image: principal.image, roles: principal.roles }}
      sections={navFor(principal)}
      notifications={notifications}
      signOutAction={signOutAction}
    >
      <WalletProvider>{children}</WalletProvider>
    </AppShell>
  );
}
