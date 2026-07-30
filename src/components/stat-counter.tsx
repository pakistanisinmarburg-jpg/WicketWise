import { motion, useMotionValue, useSpring, useTransform } from "framer-motion";
import { useEffect } from "react";

export function StatCounter({
  value,
  decimals = 0,
  className,
}: {
  value: number;
  decimals?: number;
  className?: string;
}) {
  const mv = useMotionValue(0);
  const spring = useSpring(mv, { stiffness: 90, damping: 18 });
  const text = useTransform(spring, (v) =>
    Number.isFinite(v) ? v.toFixed(decimals) : (0).toFixed(decimals),
  );

  useEffect(() => {
    mv.set(Number.isFinite(value) ? value : 0);
  }, [value, mv]);

  return <motion.span className={className}>{text}</motion.span>;
}

export function LiveDot({ label = "LIVE" }: { label?: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-live/10 px-2.5 py-1 text-[11px] font-semibold tracking-wide text-live uppercase">
      <span className="size-1.5 rounded-full bg-live animate-live-pulse" />
      {label}
    </span>
  );
}
