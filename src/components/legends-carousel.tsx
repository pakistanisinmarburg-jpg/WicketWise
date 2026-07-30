import { motion, useAnimation } from "framer-motion";
import { useEffect, useRef, useState } from "react";

import { TEAM_COLORS, type TeamName } from "@/lib/team-colors";
import { cn } from "@/lib/utils";

type Legend = {
  name: string;
  team: TeamName;
  role: string;
  // Wikimedia Commons files, hotlinked via the stable Special:FilePath
  // redirect. Each was checked for a free Creative Commons licence before
  // being added here (see PR/commit notes).
  photo: string;
};

const commons = (file: string) =>
  `https://commons.wikimedia.org/wiki/Special:FilePath/${file}?width=700`;

const LEGENDS: Legend[] = [
  { name: "Babar Azam", team: "Pakistan", role: "Batter", photo: commons("Babar_Azam_in_2020.png") },
  { name: "Imran Khan", team: "Pakistan", role: "Legend, all-rounder", photo: commons("Imran_Khan_WEF_(cropped).jpg") },
  { name: "Wasim Akram", team: "Pakistan", role: "Legend, fast bowler", photo: commons("Wasim_Akram_2.jpg") },
  { name: "Virat Kohli", team: "India", role: "Batter", photo: commons("Virat_Kohli_portrait.jpg") },
  { name: "Sachin Tendulkar", team: "India", role: "Legend, batter", photo: commons("Sachin-Tendulkar_(cropped).jpg") },
  { name: "MS Dhoni", team: "India", role: "Legend, wicketkeeper", photo: commons("MS_Dhoni_at_LPU.jpg") },
  { name: "Steve Smith", team: "Australia", role: "Batter", photo: commons("Steve_Smith_Cricketer.jpg") },
  { name: "Ben Stokes", team: "England", role: "All-rounder, captain", photo: commons("BEN_STOKES_(11704837023)_(cropped).jpg") },
];

const CARD_WIDTH = 168;
const CARD_GAP = 20;
const STEP = CARD_WIDTH + CARD_GAP;

export function LegendsCarousel() {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [visible, setVisible] = useState(4);
  const trackRef = useRef<HTMLDivElement>(null);
  const controls = useAnimation();

  useEffect(() => {
    const update = () => {
      const w = window.innerWidth;
      setVisible(w >= 1024 ? 5 : w >= 640 ? 3 : 2);
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  const maxIndex = Math.max(0, LEGENDS.length - visible);

  useEffect(() => {
    if (paused) return;
    const id = setInterval(() => {
      setIndex((i) => (i >= maxIndex ? 0 : i + 1));
    }, 2800);
    return () => clearInterval(id);
  }, [paused, maxIndex]);

  useEffect(() => {
    controls.start({
      x: -index * STEP,
      transition: { type: "spring", stiffness: 260, damping: 30 },
    });
  }, [index, controls]);

  return (
    <section
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      className="space-y-3"
    >
      <div className="flex items-baseline justify-between">
        <h2 className="text-lg font-semibold">Legends of the game</h2>
        <p className="text-xs text-muted-foreground">Drag to browse</p>
      </div>

      <div ref={trackRef} className="overflow-hidden">
        <motion.div
          className="flex gap-5"
          drag="x"
          dragConstraints={{ left: -maxIndex * STEP, right: 0 }}
          dragElastic={0.12}
          animate={controls}
          onDragStart={() => setPaused(true)}
          onDragEnd={(_, info) => {
            setPaused(false);
            const delta = info.offset.x;
            if (delta < -40 && index < maxIndex) setIndex((i) => Math.min(maxIndex, i + 1));
            else if (delta > 40 && index > 0) setIndex((i) => Math.max(0, i - 1));
            else controls.start({ x: -index * STEP, transition: { type: "spring", stiffness: 260, damping: 30 } });
          }}
        >
          {LEGENDS.map((legend, i) => (
            <motion.div
              key={legend.name}
              className="shrink-0 cursor-grab select-none active:cursor-grabbing"
              style={{ width: CARD_WIDTH }}
              initial={{ opacity: 0, y: 14 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.35, delay: i * 0.05 }}
              whileHover={{ y: -4 }}
            >
              <div className="relative aspect-[3/4] overflow-hidden rounded-2xl bg-sidebar shadow-card">
                <img
                  src={legend.photo}
                  alt={legend.name}
                  draggable={false}
                  loading="lazy"
                  className="size-full object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent" />
                <span
                  style={{ backgroundColor: TEAM_COLORS[legend.team] }}
                  className={cn(
                    "absolute top-2.5 left-2.5 rounded-full px-2 py-0.5 text-[10px] font-semibold text-white shadow-sm",
                  )}
                >
                  {legend.team}
                </span>
                <div className="absolute right-2.5 bottom-2.5 left-2.5 text-white">
                  <p className="truncate text-sm font-semibold drop-shadow">{legend.name}</p>
                  <p className="truncate text-[11px] text-white/75">{legend.role}</p>
                </div>
              </div>
            </motion.div>
          ))}
        </motion.div>
      </div>

      <div className="flex justify-center gap-1.5 pt-1">
        {Array.from({ length: maxIndex + 1 }).map((_, i) => (
          <button
            key={i}
            aria-label={`Go to slide ${i + 1}`}
            onClick={() => setIndex(i)}
            className={cn(
              "h-1.5 rounded-full transition-all",
              i === index ? "w-5 bg-primary" : "w-1.5 bg-primary/25 hover:bg-primary/40",
            )}
          />
        ))}
      </div>
    </section>
  );
}
