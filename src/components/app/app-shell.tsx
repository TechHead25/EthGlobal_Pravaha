"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Bell,
  Building2,
  ChevronRight,
  Eye,
  Globe,
  HandCoins,
  Home,
  Inbox,
  KeyRound,
  LogOut,
  Menu,
  Scale,
  ScrollText,
  Shield,
  Terminal,
  Truck,
  Users,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ROLE_LABELS, type Role } from "@/lib/auth/roles";
import { Logo } from "@/components/brand/logo";
import { UserAvatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { activeChild, BREADCRUMB_LABELS, type NavIconName, type NavSection } from "./nav-config";

const ICONS: Record<NavIconName, LucideIcon> = {
  home: Home,
  "hand-coins": HandCoins,
  building: Building2,
  truck: Truck,
  scale: Scale,
  shield: Shield,
  inbox: Inbox,
  users: Users,
  scroll: ScrollText,
  terminal: Terminal,
  key: KeyRound,
  globe: Globe,
  eye: Eye,
};

export interface ShellNotification {
  id: string;
  title: string;
  body?: string;
  href?: string;
  tone: "verified" | "pending" | "failed" | "info";
}

export interface ShellUser {
  name: string | null;
  email: string;
  image: string | null;
  roles: Role[];
}

function SidebarNav({ sections, onNavigate }: { sections: NavSection[]; onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Workspace" className="flex flex-col gap-6 px-3 py-4">
      {sections.map((section) => (
        <div key={section.title}>
          <p className="eyebrow mb-2 px-3 text-white/35">{section.title}</p>
          <ul className="space-y-0.5">
            {section.items.map((item) => {
              const Icon = ICONS[item.icon];
              const active =
                pathname === item.href || (item.href !== "/app/admin" && item.href.startsWith("/app") && pathname.startsWith(`${item.href}/`));
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={onNavigate}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                      active ? "bg-white/10 text-white" : "text-white/60 hover:bg-white/5 hover:text-white"
                    )}
                  >
                    <Icon className={cn("h-4 w-4", active ? "text-[hsl(166_70%_60%)]" : "")} aria-hidden />
                    {item.label}
                  </Link>
                  {item.children && (pathname === item.href || pathname.startsWith(`${item.href}/`)) ? (
                    <ul className="ml-[1.35rem] mt-1 space-y-0.5 border-l border-white/10 pl-3">
                      {item.children.map((child) => {
                        const on = activeChild(item.children!, pathname) === child.href;
                        return (
                          <li key={child.href}>
                            <Link
                              href={child.href}
                              onClick={onNavigate}
                              aria-current={on ? "page" : undefined}
                              className={cn(
                                "block rounded-md px-2.5 py-1.5 text-[0.82rem] transition-colors",
                                on ? "bg-white/[0.08] text-white" : "text-white/50 hover:text-white"
                              )}
                            >
                              {child.label}
                            </Link>
                          </li>
                        );
                      })}
                    </ul>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

function Breadcrumbs() {
  const pathname = usePathname();
  const parts = pathname.split("/").filter(Boolean);
  const crumbs = parts.map((p, i) => ({
    href: "/" + parts.slice(0, i + 1).join("/"),
    label: BREADCRUMB_LABELS[p] ?? (/^[a-z0-9]{8,}$/i.test(p) ? "Detail" : p),
  }));
  return (
    <nav aria-label="Breadcrumb" className="min-w-0">
      <ol className="flex items-center gap-1 truncate text-sm text-muted-foreground">
        {crumbs.map((c, i) => (
          <li key={c.href} className="flex items-center gap-1 truncate">
            {i > 0 ? <ChevronRight className="h-3.5 w-3.5 shrink-0 opacity-50" aria-hidden /> : null}
            {i === crumbs.length - 1 ? (
              <span aria-current="page" className="truncate font-medium text-foreground">{c.label}</span>
            ) : i === 0 ? (
              <span className="truncate">{c.label}</span>
            ) : (
              <Link href={c.href} className="truncate hover:text-foreground">{c.label}</Link>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}

export function AppShell({
  user,
  sections,
  notifications,
  signOutAction,
  children,
}: {
  user: ShellUser;
  sections: NavSection[];
  notifications: ShellNotification[];
  signOutAction: () => Promise<void>;
  children: React.ReactNode;
}) {
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const signOutFormRef = React.useRef<HTMLFormElement>(null);
  const pathname = usePathname();
  React.useEffect(() => setMobileOpen(false), [pathname]);
  const elevated = user.roles.filter((r) => r !== "USER");

  return (
    <div className="min-h-screen bg-background lg:grid lg:grid-cols-[256px_1fr]">
      {/* Desktop sidebar */}
      <aside className="ink-backdrop sticky top-0 hidden h-screen flex-col overflow-y-auto lg:flex">
        <div className="flex h-16 items-center border-b border-white/[0.07] px-5">
          <Logo tone="dark" href="/app/dashboard" />
        </div>
        <SidebarNav sections={sections} />
        <div className="mt-auto border-t border-white/[0.07] p-4 text-xs text-white/40">
          Arc Testnet · application roles never grant fund access
        </div>
      </aside>

      <div className="flex min-w-0 flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b bg-background/85 px-4 backdrop-blur-md sm:px-6">
          <Dialog open={mobileOpen} onOpenChange={setMobileOpen}>
            <DialogTrigger asChild>
              <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Open workspace navigation">
                <Menu className="h-5 w-5" />
              </Button>
            </DialogTrigger>
            <DialogContent side="left" className="ink-backdrop overflow-y-auto border-white/10 text-white">
              <DialogTitle className="sr-only">Workspace navigation</DialogTitle>
              <div className="flex h-16 items-center border-b border-white/[0.07] px-5">
                <Logo tone="dark" href="/app/dashboard" />
              </div>
              <SidebarNav sections={sections} onNavigate={() => setMobileOpen(false)} />
            </DialogContent>
          </Dialog>

          <Breadcrumbs />

          <form ref={signOutFormRef} action={signOutAction} className="hidden" aria-hidden />
          <div className="ml-auto flex items-center gap-1.5">
            <ThemeToggle />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="relative" aria-label={`Notifications (${notifications.length})`}>
                  <Bell className="h-[18px] w-[18px]" />
                  {notifications.length > 0 ? (
                    <span className="absolute right-1.5 top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-pending px-1 text-[0.6rem] font-semibold text-white">
                      {notifications.length > 9 ? "9+" : notifications.length}
                    </span>
                  ) : null}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-80">
                <DropdownMenuLabel className="font-semibold">Notifications</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {notifications.length === 0 ? (
                  <p className="px-2.5 py-6 text-center text-sm text-muted-foreground">You’re all caught up.</p>
                ) : (
                  notifications.map((n) => (
                    <DropdownMenuItem key={n.id} asChild>
                      <Link href={n.href ?? "/app/dashboard"} className="flex-col items-start gap-0.5">
                        <span className="flex items-center gap-2 text-sm font-medium">
                          <span
                            className={cn(
                              "h-1.5 w-1.5 rounded-full",
                              n.tone === "verified" && "bg-verified",
                              n.tone === "pending" && "bg-pending",
                              n.tone === "failed" && "bg-destructive",
                              n.tone === "info" && "bg-info"
                            )}
                            aria-hidden
                          />
                          {n.title}
                        </span>
                        {n.body ? <span className="pl-3.5 text-xs text-muted-foreground">{n.body}</span> : null}
                      </Link>
                    </DropdownMenuItem>
                  ))
                )}
              </DropdownMenuContent>
            </DropdownMenu>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-2 rounded-full p-0.5 pr-2 transition hover:bg-muted" aria-label="Account menu">
                  <UserAvatar name={user.name ?? user.email} image={user.image} />
                  <span className="hidden max-w-[10rem] truncate text-sm font-medium sm:inline">{user.name ?? user.email}</span>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-72">
                <DropdownMenuLabel>
                  <p className="font-medium">{user.name ?? "Signed in"}</p>
                  <p className="truncate text-xs text-muted-foreground">{user.email}</p>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {elevated.length === 0 ? (
                      <Badge>{ROLE_LABELS.USER}</Badge>
                    ) : (
                      elevated.map((r) => (
                        <Badge key={r} tone={r === "ADMIN" ? "completed" : "verified"}>
                          {ROLE_LABELS[r]}
                        </Badge>
                      ))
                    )}
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link href="/app/access">
                    <KeyRound /> Access & roles
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => signOutFormRef.current?.requestSubmit()}>
                  <LogOut /> Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        <main id="main" className="flex-1 px-4 py-8 sm:px-6 lg:px-10">
          <div className="mx-auto max-w-6xl">{children}</div>
        </main>
      </div>
    </div>
  );
}
