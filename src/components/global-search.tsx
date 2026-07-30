import { Link, useNavigate } from "@tanstack/react-router";
import { Search } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { useGlobalSearch } from "@/features/search";

export function GlobalSearch() {
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState("");
  const results = useGlobalSearch(term);
  const navigate = useNavigate();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const groups = results.data ?? [];

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className="text-muted-foreground gap-2"
        onClick={() => setOpen(true)}
        aria-label="Search WicketWise"
      >
        <Search className="size-4" />
        <span className="hidden lg:inline">Search</span>
        <kbd className="hidden rounded border px-1 text-[10px] lg:inline">⌘K</kbd>
      </Button>

      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandInput
          placeholder="Search players, teams, matches, series, cups…"
          value={term}
          onValueChange={setTerm}
        />
        <CommandList>
          {term.trim().length < 2 ? (
            <CommandEmpty>Type at least two characters.</CommandEmpty>
          ) : results.isFetching && groups.length === 0 ? (
            <CommandEmpty>Searching…</CommandEmpty>
          ) : groups.length === 0 ? (
            <CommandEmpty>Nothing matched “{term}”.</CommandEmpty>
          ) : null}

          {groups.map((group) => (
            <CommandGroup key={group.label} heading={group.label}>
              {group.items.map((item) => (
                <CommandItem
                  key={item.id}
                  value={`${group.label}-${item.title}-${item.id}`}
                  onSelect={() => {
                    setOpen(false);
                    void navigate({ to: item.to });
                  }}
                >
                  <span className="font-medium">{item.title}</span>
                  {item.subtitle && (
                    <span className="ml-2 truncate text-xs text-muted-foreground">
                      {item.subtitle}
                    </span>
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          ))}
        </CommandList>
      </CommandDialog>
    </>
  );
}

export function SearchEmptyHint() {
  return (
    <p className="text-sm text-muted-foreground">
      Try the <Link to="/players" className="underline">players directory</Link> instead.
    </p>
  );
}
