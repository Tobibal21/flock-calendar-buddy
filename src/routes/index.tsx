import { createFileRoute, Link } from "@tanstack/react-router";
import { Egg, ClipboardList, Syringe, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  component: Landing,
});

function Landing() {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border/60 bg-background/80 backdrop-blur sticky top-0 z-10">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Link to="/" className="flex items-center gap-2 font-semibold tracking-tight">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-primary text-primary-foreground">
              <Egg className="h-4 w-4" />
            </span>
            Coopkeeper
          </Link>
          <div className="flex items-center gap-2">
            <Link to="/login"><Button variant="ghost">Sign in</Button></Link>
            <Link to="/login" search={{ mode: "signup" }}><Button>Get started</Button></Link>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-6 py-20 md:py-28">
        <div className="max-w-3xl">
          <span className="inline-flex items-center rounded-full border border-border bg-secondary px-3 py-1 text-xs font-medium text-secondary-foreground">
            For modern poultry farmers
          </span>
          <h1 className="mt-5 text-5xl md:text-6xl font-semibold tracking-tight text-foreground">
            Run your poultry farm with calm, clear records.
          </h1>
          <p className="mt-5 text-lg text-muted-foreground max-w-2xl">
            Track flocks, log daily crate production, see your trends, and never miss a vaccine.
            Built for layer, broiler, and mixed farms of every size.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link to="/login" search={{ mode: "signup" }}>
              <Button size="lg">Start tracking free</Button>
            </Link>
            <Link to="/login"><Button size="lg" variant="outline">I have an account</Button></Link>
          </div>
        </div>

        <div className="mt-20 grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          {[
            { icon: ClipboardList, t: "Flock register", d: "Breed, count, age, mortality — kept tidy per house." },
            { icon: Egg, t: "Daily crate tracker", d: "Two taps to log today's collection and broken crates." },
            { icon: TrendingUp, t: "Production trends", d: "Charts that show how your flock is really doing." },
            { icon: Syringe, t: "Vaccine reminders", d: "Schedule and export to Google Calendar in one click." },
          ].map(({ icon: Icon, t, d }) => (
            <div key={t} className="rounded-2xl border border-border bg-card p-6">
              <div className="grid h-10 w-10 place-items-center rounded-lg bg-accent/30 text-primary">
                <Icon className="h-5 w-5" />
              </div>
              <h3 className="mt-4 font-semibold">{t}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{d}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className="border-t border-border/60 mt-12">
        <div className="mx-auto max-w-6xl px-6 py-6 text-sm text-muted-foreground">
          © {new Date().getFullYear()} Coopkeeper
        </div>
      </footer>
    </div>
  );
}
