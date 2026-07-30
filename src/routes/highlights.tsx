import { createFileRoute } from "@tanstack/react-router";
import { AnimatePresence, motion } from "framer-motion";
import { Film, Play } from "lucide-react";
import { useState } from "react";

import { Card, CardContent } from "@/components/ui/card";
import { TEAM_COLORS, type TeamName } from "@/lib/team-colors";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/highlights")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Highlights — WicketWise" },
      {
        name: "description",
        content:
          "Recent international highlights from Pakistan, India, Australia and England, straight from the official broadcasters.",
      },
      { property: "og:title", content: "Highlights — WicketWise" },
      {
        property: "og:description",
        content: "Recent Pakistan, India, Australia and England highlights in one place.",
      },
      { property: "og:type", content: "website" },
    ],
  }),
  component: HighlightsPage,
});

type Clip = {
  id: string;
  title: string;
  competition: string;
  teams: TeamName[];
  source: string;
};

// Real, official broadcaster uploads (ECB / Pakistan Cricket) — verified via
// YouTube's oEmbed endpoint before being added here. Embedded via standard
// YouTube iframe embeds, not rehosted.
const CLIPS: Clip[] = [
  {
    id: "JJqhHwtA-J4",
    title: "Duckett & Rohit Hit Tons In Thriller",
    competition: "3rd Metro Bank ODI · England v India, 2026",
    teams: ["England", "India"],
    source: "England & Wales Cricket Board",
  },
  {
    id: "fajVPftHI2M",
    title: "Brook and Salt On The Charge!",
    competition: "4th Vitality IT20 · England v India, 2026",
    teams: ["England", "India"],
    source: "England & Wales Cricket Board",
  },
  {
    id: "0IuH-RyrdAQ",
    title: "Full Match Highlights",
    competition: "3rd ODI · Pakistan v Australia, 2026",
    teams: ["Pakistan", "Australia"],
    source: "Pakistan Cricket",
  },
  {
    id: "hcj3GprBXwc",
    title: "1st Innings Highlights",
    competition: "3rd ODI · Pakistan v Australia, 2026",
    teams: ["Pakistan", "Australia"],
    source: "Pakistan Cricket",
  },
];

const FILTERS: Array<TeamName | "All"> = ["All", "Pakistan", "India", "Australia", "England"];

function HighlightsPage() {
  const [filter, setFilter] = useState<TeamName | "All">("All");
  const clips = CLIPS.filter((c) => filter === "All" || c.teams.includes(filter));

  return (
    <div className="space-y-6">
      <motion.header
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        <p className="flex items-center gap-1.5 text-xs font-semibold tracking-[0.2em] text-primary uppercase">
          <Film className="size-3.5" /> Match highlights
        </p>
        <h1 className="mt-2 text-2xl font-bold md:text-3xl">
          Recent Pakistan, India, Australia &amp; England cricket
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Official highlight reels from recent international fixtures, embedded straight from
          each board's own broadcast channel.
        </p>
      </motion.header>

      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => {
          const active = filter === f;
          return (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={cn(
                "relative rounded-full px-4 py-1.5 text-sm font-medium transition-colors",
                active ? "text-primary-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {active && (
                <motion.span
                  layoutId="highlight-filter-pill"
                  className="absolute inset-0 rounded-full bg-primary"
                  transition={{ type: "spring", bounce: 0.25, duration: 0.5 }}
                />
              )}
              <span className="relative z-10">{f}</span>
            </button>
          );
        })}
      </div>

      <motion.div layout className="grid gap-5 sm:grid-cols-2">
        <AnimatePresence mode="popLayout">
          {clips.map((clip, i) => (
            <motion.div
              key={clip.id}
              layout
              initial={{ opacity: 0, y: 16, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              transition={{ duration: 0.35, delay: i * 0.05 }}
            >
              <ClipCard clip={clip} />
            </motion.div>
          ))}
        </AnimatePresence>
      </motion.div>

      {clips.length === 0 && (
        <Card className="border-dashed shadow-none">
          <CardContent className="p-8 text-center text-sm text-muted-foreground">
            No clips for that team yet.
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function ClipCard({ clip }: { clip: Clip }) {
  const [playing, setPlaying] = useState(false);

  return (
    <Card className="overflow-hidden shadow-card transition-shadow hover:shadow-lift">
      <div className="relative aspect-video w-full overflow-hidden bg-sidebar">
        <AnimatePresence initial={false} mode="wait">
          {playing ? (
            <motion.iframe
              key="player"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.3 }}
              className="absolute inset-0 size-full"
              src={`https://www.youtube.com/embed/${clip.id}?autoplay=1`}
              title={clip.title}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
            />
          ) : (
            <motion.button
              key="thumb"
              onClick={() => setPlaying(true)}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25 }}
              className="group absolute inset-0 size-full cursor-pointer"
              aria-label={`Play ${clip.title}`}
            >
              <img
                src={`https://i.ytimg.com/vi/${clip.id}/hqdefault.jpg`}
                alt={clip.title}
                loading="lazy"
                className="size-full object-cover transition-transform duration-500 group-hover:scale-105"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
              <motion.span
                whileHover={{ scale: 1.08 }}
                whileTap={{ scale: 0.95 }}
                className="absolute inset-0 flex items-center justify-center"
              >
                <span className="grid size-14 place-items-center rounded-full bg-live text-live-foreground shadow-lift">
                  <Play className="size-6 translate-x-0.5 fill-current" />
                </span>
              </motion.span>
              <div className="absolute top-3 left-3 flex gap-1.5">
                {clip.teams.map((t) => (
                  <span
                    key={t}
                    style={{ backgroundColor: TEAM_COLORS[t] }}
                    className="rounded-full px-2.5 py-1 text-[11px] font-semibold text-white shadow-sm"
                  >
                    {t}
                  </span>
                ))}
              </div>
              <p className="absolute right-3 bottom-3 left-3 text-left text-sm font-semibold text-white drop-shadow">
                {clip.title}
              </p>
            </motion.button>
          )}
        </AnimatePresence>
      </div>
      <CardContent className="space-y-0.5 p-4">
        <p className="text-sm font-medium">{clip.competition}</p>
        <p className="text-xs text-muted-foreground">Official highlights · {clip.source}</p>
      </CardContent>
    </Card>
  );
}
