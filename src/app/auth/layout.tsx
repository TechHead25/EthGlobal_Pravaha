import { Logo } from "@/components/brand/logo";
import { ThemeToggle } from "@/components/theme/theme-toggle";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main id="main" className="grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
      <section className="ink-backdrop relative hidden overflow-hidden p-10 text-white lg:flex lg:flex-col">
        <div className="grid-lines pointer-events-none absolute inset-0" aria-hidden />
        <Logo tone="dark" className="relative" />
        <div className="relative mt-auto max-w-md">
          <p className="font-display text-4xl leading-tight tracking-tight">Every contribution. Accounted for.</p>
          <ul className="mt-8 space-y-3 text-sm text-white/60">
            <li>· Google sign-in identifies you to the application only.</li>
            <li>· Your wallet signs every on-chain transaction separately.</li>
            <li>· Workspace roles are granted through reviewed, audited requests.</li>
          </ul>
        </div>
      </section>
      <section className="paper-backdrop relative flex flex-col px-5 py-8 sm:px-10">
        <div className="absolute right-4 top-4"><ThemeToggle /></div>
        <Logo className="lg:hidden" />
        <div className="m-auto w-full max-w-sm py-10">{children}</div>
      </section>
    </main>
  );
}
