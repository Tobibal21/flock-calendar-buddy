import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  TOUR_EVENT,
  useFarmActivity,
  useOnboardingState,
  useSaveOnboarding,
} from "@/hooks/useOnboarding";

type Step = {
  target: string | null;
  title: string;
  body: string;
};

const STEPS: Step[] = [
  {
    target: "flocks",
    title: "Add your first flock",
    body: "Start here. Create a flock and choose whether it holds Layers or Broilers.",
  },
  {
    target: "production",
    title: "Log production",
    body: "Record crates collected, crates sold and feed used, day by day.",
  },
  {
    target: "finance",
    title: "Track income & expenses",
    body: "Every sale and every cost lands here, so you always know where you stand.",
  },
  {
    target: "vaccines",
    title: "Set a vaccine reminder",
    body: "Schedule a vaccine for a flock and add it to your calendar so you never miss one.",
  },
  {
    target: null,
    title: "You're on a 7-day free trial",
    body: "After the trial it's ₦1,000 per month. You can subscribe any time from your account.",
  },
];

const NUDGES: { target: string; text: string }[] = [
  { target: "flocks", text: "Start by adding your first flock." },
  { target: "production", text: "Log your first production entry." },
  { target: "finance", text: "Record your first income or expense." },
  { target: "vaccines", text: "Set your first vaccine reminder." },
];

function useAnchorRect(target: string | null) {
  const [rect, setRect] = useState<DOMRect | null>(null);

  const measure = useCallback(() => {
    if (!target) {
      setRect(null);
      return;
    }
    const nodes = Array.from(
      document.querySelectorAll<HTMLElement>(`[data-tour="${target}"]`),
    ).filter((n) => n.getBoundingClientRect().width > 0 && n.getBoundingClientRect().height > 0);
    setRect(nodes[0]?.getBoundingClientRect() ?? null);
  }, [target]);

  useLayoutEffect(() => {
    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [measure]);

  return rect;
}

function Bubble({
  rect,
  children,
}: {
  rect: DOMRect | null;
  children: React.ReactNode;
}) {
  const style = useMemo<React.CSSProperties>(() => {
    if (!rect) {
      return { top: "50%", left: "50%", transform: "translate(-50%, -50%)" };
    }
    const width = 300;
    const gapBelow = window.innerHeight - rect.bottom;
    const placeBelow = gapBelow > 200;
    const left = Math.min(
      Math.max(12, rect.left + rect.width / 2 - width / 2),
      Math.max(12, window.innerWidth - width - 12),
    );
    return placeBelow
      ? { top: rect.bottom + 12, left, width }
      : { bottom: window.innerHeight - rect.top + 12, left, width };
  }, [rect]);

  return (
    <div
      style={{ position: "fixed", width: rect ? 300 : "min(24rem, calc(100vw - 2rem))", ...style }}
      className="z-[60] rounded-2xl border border-border bg-card p-4 shadow-xl"
    >
      {children}
    </div>
  );
}

function Highlight({ rect }: { rect: DOMRect | null }) {
  if (!rect) return null;
  return (
    <div
      style={{
        position: "fixed",
        top: rect.top - 6,
        left: rect.left - 6,
        width: rect.width + 12,
        height: rect.height + 12,
      }}
      className="pointer-events-none z-[59] rounded-xl ring-2 ring-primary ring-offset-2 ring-offset-background"
    />
  );
}

export function OnboardingTour() {
  const { data: state, isLoading: stateLoading } = useOnboardingState();
  const { data: activity, isLoading: activityLoading } = useFarmActivity();
  const save = useSaveOnboarding();

  const [showWelcome, setShowWelcome] = useState(false);
  const [stepIndex, setStepIndex] = useState<number | null>(null);
  const [nudgeDismissed, setNudgeDismissed] = useState(false);

  const isNewFarm =
    !!activity && activity.flocks === 0 && activity.production === 0 && activity.finance === 0;

  // First-ever visit for a brand-new farm → welcome modal.
  useEffect(() => {
    if (stateLoading || activityLoading) return;
    if (state) return;
    if (isNewFarm) setShowWelcome(true);
    else void save({}); // existing farm: record the row so we stop re-deciding every load
  }, [stateLoading, activityLoading, state, isNewFarm, save]);

  // Manual replay from the nav.
  useEffect(() => {
    const handler = () => {
      setShowWelcome(false);
      setStepIndex(0);
    };
    window.addEventListener(TOUR_EVENT, handler);
    return () => window.removeEventListener(TOUR_EVENT, handler);
  }, []);

  const step = stepIndex === null ? null : STEPS[stepIndex];
  const stepRect = useAnchorRect(step?.target ?? null);

  const nudge = useMemo(() => {
    if (!activity || showWelcome || stepIndex !== null || nudgeDismissed) return null;
    if (activity.flocks === 0) return NUDGES[0];
    if (activity.production === 0) return NUDGES[1];
    if (activity.finance === 0) return NUDGES[2];
    if (activity.vaccines === 0) return NUDGES[3];
    return null;
  }, [activity, showWelcome, stepIndex, nudgeDismissed]);

  const nudgeRect = useAnchorRect(nudge?.target ?? null);

  if (showWelcome) {
    return (
      <div className="fixed inset-0 z-[60] flex items-center justify-center bg-foreground/40 px-4">
        <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-xl">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-primary/10 text-primary">
            <Sparkles className="h-5 w-5" />
          </span>
          <h2 className="mt-4 text-xl font-semibold tracking-tight">
            Welcome to Flock Keeper — let's set up your farm
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            A quick walkthrough of flocks, production, finance and vaccine reminders.
          </p>
          <div className="mt-6 flex gap-2">
            <Button
              onClick={() => {
                setShowWelcome(false);
                setStepIndex(0);
              }}
            >
              Start Tour
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                setShowWelcome(false);
                void save({ dismissed: true });
              }}
            >
              Skip
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (step) {
    const last = stepIndex === STEPS.length - 1;
    return (
      <>
        <div className="fixed inset-0 z-[58] bg-foreground/30" />
        <Highlight rect={stepRect} />
        <Bubble rect={stepRect}>
          <p className="text-xs font-medium text-muted-foreground">
            Step {(stepIndex ?? 0) + 1} of {STEPS.length}
          </p>
          <h3 className="mt-1 font-semibold">{step.title}</h3>
          <p className="mt-1 text-sm text-muted-foreground">{step.body}</p>
          {last && (
            <Link to="/subscribe" className="mt-2 inline-block text-sm text-primary hover:underline">
              See subscription details
            </Link>
          )}
          <div className="mt-4 flex items-center justify-between">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setStepIndex(null);
                void save({ dismissed: true });
              }}
            >
              Skip tour
            </Button>
            <Button
              size="sm"
              onClick={() => {
                if (last) {
                  setStepIndex(null);
                  void save({ tour_completed: true });
                } else {
                  setStepIndex((i) => (i ?? 0) + 1);
                }
              }}
            >
              {last ? "Done" : "Next"}
            </Button>
          </div>
        </Bubble>
      </>
    );
  }

  if (nudge && nudgeRect) {
    return (
      <>
        <Highlight rect={nudgeRect} />
        <Bubble rect={nudgeRect}>
          <div className="flex items-start gap-2">
            <p className="text-sm">{nudge.text}</p>
            <button
              aria-label="Dismiss"
              className="ml-auto text-muted-foreground hover:text-foreground"
              onClick={() => setNudgeDismissed(true)}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </Bubble>
      </>
    );
  }

  return null;
}
