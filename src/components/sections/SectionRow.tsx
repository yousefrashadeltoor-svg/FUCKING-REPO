
// Horizontal scrollable section with arrow controls + staggered reveal.
import { useRef } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { cardMotion } from "@/components/cards/Cards";

interface Props {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}

export function SectionRow({ title, subtitle, children, action }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const scrollBy = (dir: number) => {
    const rtl = typeof document !== "undefined" && document.documentElement.dir === "rtl";
    ref.current?.scrollBy({ left: (rtl ? -dir : dir) * 480, behavior: "smooth" });
  };
  return (
    <section className="mt-8">
      <div className="mb-3 flex items-end justify-between gap-4 px-1">
        <div>
          <h2 className="text-xl font-extrabold tracking-tight">{title}</h2>
          {subtitle && <p className="mt-0.5 text-sm text-[color:var(--app-muted)]">{subtitle}</p>}
        </div>
        <div className="flex items-center gap-2">
          {action}
          <button
            onClick={() => scrollBy(-1)}
            className="grid size-10 place-items-center rounded-full bg-white/[0.06] text-white/60 hover:bg-white/12 hover:text-white"
            aria-label="Scroll left"
          >
            <ChevronLeft className="size-4 rtl:rotate-180" />
          </button>
          <button
            onClick={() => scrollBy(1)}
            className="grid size-10 place-items-center rounded-full bg-white/[0.06] text-white/60 hover:bg-white/12 hover:text-white"
            aria-label="Scroll right"
          >
            <ChevronRight className="size-4 rtl:rotate-180" />
          </button>
        </div>
      </div>
      <div ref={ref} className="no-scrollbar flex overflow-x-auto scroll-smooth px-1 pb-1" style={{ gap: "var(--density-gap)" }}>
        {Array.isArray(children)
          ? children.map((child, i) => (
              <motion.div key={i} {...cardMotion} transition={{ ...cardMotion.transition, delay: Math.min(i * 0.05, 0.4) }}>
                {child}
              </motion.div>
            ))
          : <motion.div {...cardMotion}>{children}</motion.div>}
      </div>
    </section>
  );
}

export function SectionTitle({ children, className }: { children: React.ReactNode; className?: string }) {
  return <h2 className={cn("px-1 text-xl font-extrabold tracking-tight", className)}>{children}</h2>;
}
