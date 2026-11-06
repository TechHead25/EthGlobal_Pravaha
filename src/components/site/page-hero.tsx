export function PageHero({ eyebrow, title, description, children }: { eyebrow: string; title: string; description?: string; children?: React.ReactNode }) {
  return (
    <section className="paper-backdrop border-b">
      <div className="container py-14 lg:py-20">
        <p className="eyebrow text-verified">{eyebrow}</p>
        <h1 className="mt-3 max-w-3xl font-display text-4xl tracking-tight sm:text-5xl">{title}</h1>
        {description ? <p className="mt-4 max-w-2xl text-muted-foreground">{description}</p> : null}
        {children ? <div className="mt-8">{children}</div> : null}
      </div>
    </section>
  );
}
