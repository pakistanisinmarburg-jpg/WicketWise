import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/features/auth/auth-context";
import { useUpdateProfile, useUploadAvatar } from "@/features/people";
import type { Profile } from "@/lib/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/onboarding")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Complete your player profile — WicketWise" },
      {
        name: "description",
        content: "Set up your account, cricket profile and availability for selection.",
      },
      { property: "og:title", content: "Complete your player profile — WicketWise" },
      { property: "og:description", content: "Three quick steps and captains can pick you." },
    ],
  }),
  component: Onboarding,
});

const STEPS = ["Account", "Cricket profile", "Availability"];

const BATTING = ["Right-hand bat", "Left-hand bat"];
const BOWLING = [
  "Right-arm fast",
  "Right-arm medium",
  "Right-arm off-spin",
  "Right-arm leg-spin",
  "Left-arm fast",
  "Left-arm medium",
  "Left-arm orthodox",
  "Left-arm chinaman",
  "Does not bowl",
];
const ROLES = ["Batsman", "Bowler", "All-rounder", "Wicketkeeper"];
const EXPERIENCE = ["Beginner", "Club", "District", "State", "Professional"];

function Onboarding() {
  const { user, profile, loading } = useAuth();
  const navigate = useNavigate();
  const update = useUpdateProfile();
  const uploadAvatar = useUploadAvatar();
  const [step, setStep] = useState(1);
  const [form, setForm] = useState<Partial<Profile>>({});

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth" });
  }, [loading, user, navigate]);

  useEffect(() => {
    if (profile) {
      setForm((f) => (Object.keys(f).length ? f : profile));
      setStep((s) => (s === 1 ? Math.min(profile.onboarding_step || 1, 3) : s));
    }
  }, [profile]);

  const set = <K extends keyof Profile>(key: K, value: Profile[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  async function saveStep(next: number, complete = false) {
    if (!user) return;
    if (next === 2 && !String(form.full_name ?? "").trim()) {
      toast.error("Please enter your full name");
      return;
    }
    await update.mutateAsync({
      id: user.id,
      patch: {
        ...form,
        onboarding_step: complete ? 3 : next,
        onboarding_complete: complete || profile?.onboarding_complete || false,
        status: complete ? (form.is_available ? "available" : "registered") : form.status,
      },
    });
    if (complete) {
      toast.success("Profile complete — you're in the player pool");
      navigate({ to: "/profile" });
    } else {
      setStep(next);
    }
  }

  async function pickAvatar(file: File | undefined) {
    if (!file || !user) return;
    try {
      const url = await uploadAvatar.mutateAsync({ userId: user.id, file });
      set("avatar_url", url);
      toast.success("Photo uploaded");
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <header>
        <h1 className="text-2xl font-bold">Player registration</h1>
        <p className="text-sm text-muted-foreground">
          Step {step} of 3 — {STEPS[step - 1]}
        </p>
        <div className="mt-4 flex gap-2">
          {STEPS.map((s, i) => (
            <div
              key={s}
              className={cn(
                "h-1.5 flex-1 rounded-full bg-muted",
                i + 1 <= step && "bg-primary",
              )}
            />
          ))}
        </div>
      </header>

      <motion.div key={step} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
        <Card className="shadow-card">
          <CardContent className="space-y-4 p-5">
            {step === 1 && (
              <>
                <Field label="Full name">
                  <Input
                    value={form.full_name ?? ""}
                    onChange={(e) => set("full_name", e.target.value)}
                    maxLength={80}
                  />
                </Field>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Email">
                    <Input value={form.email ?? user?.email ?? ""} disabled />
                  </Field>
                  <Field label="Phone">
                    <Input
                      value={form.phone ?? ""}
                      onChange={(e) => set("phone", e.target.value)}
                      maxLength={20}
                    />
                  </Field>
                  <Field label="Date of birth">
                    <Input
                      type="date"
                      value={form.date_of_birth ?? ""}
                      onChange={(e) => set("date_of_birth", e.target.value)}
                    />
                  </Field>
                  <Field label="Gender">
                    <Choice
                      value={form.gender}
                      onChange={(v) => set("gender", v)}
                      options={["Male", "Female", "Other", "Prefer not to say"]}
                    />
                  </Field>
                  <Field label="Nationality">
                    <Input
                      value={form.nationality ?? ""}
                      onChange={(e) => set("nationality", e.target.value)}
                      maxLength={60}
                    />
                  </Field>
                  <Field label="City">
                    <Input
                      value={form.city ?? ""}
                      onChange={(e) => set("city", e.target.value)}
                      maxLength={60}
                    />
                  </Field>
                </div>
                <Field label="Profile picture">
                  <div className="flex items-center gap-3">
                    {form.avatar_url && (
                      <img
                        src={form.avatar_url}
                        alt="Your profile"
                        className="size-14 rounded-full object-cover"
                      />
                    )}
                    <Input
                      type="file"
                      accept="image/*"
                      onChange={(e) => pickAvatar(e.target.files?.[0])}
                      disabled={uploadAvatar.isPending}
                    />
                  </div>
                </Field>
              </>
            )}

            {step === 2 && (
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Batting style">
                  <Choice
                    value={form.batting_style}
                    onChange={(v) => set("batting_style", v)}
                    options={BATTING}
                  />
                </Field>
                <Field label="Bowling style">
                  <Choice
                    value={form.bowling_style}
                    onChange={(v) => set("bowling_style", v)}
                    options={BOWLING}
                  />
                </Field>
                <Field label="Primary role">
                  <Choice
                    value={form.primary_role}
                    onChange={(v) => set("primary_role", v)}
                    options={ROLES}
                  />
                </Field>
                <Field label="Secondary role">
                  <Choice
                    value={form.secondary_role}
                    onChange={(v) => set("secondary_role", v)}
                    options={ROLES}
                  />
                </Field>
                <Field label="Jersey number">
                  <Input
                    type="number"
                    min={0}
                    max={999}
                    value={form.jersey_number ?? ""}
                    onChange={(e) =>
                      set("jersey_number", e.target.value ? Number(e.target.value) : null)
                    }
                  />
                </Field>
                <Field label="Preferred position">
                  <Choice
                    value={form.preferred_position}
                    onChange={(v) => set("preferred_position", v)}
                    options={["Opener", "Top order", "Middle order", "Finisher", "Tail"]}
                  />
                </Field>
                <Field label="Playing experience">
                  <Choice
                    value={form.experience}
                    onChange={(v) => set("experience", v)}
                    options={EXPERIENCE}
                  />
                </Field>
                <div className="sm:col-span-2">
                  <Field label="Short bio">
                    <Textarea
                      rows={3}
                      maxLength={400}
                      value={form.bio ?? ""}
                      onChange={(e) => set("bio", e.target.value)}
                      placeholder="Aggressive top-order bat, part-time off-spin."
                    />
                  </Field>
                </div>
              </div>
            )}

            {step === 3 && (
              <div className="space-y-4">
                <div className="flex items-center justify-between rounded-xl border p-4">
                  <div>
                    <p className="font-medium">Available for selection</p>
                    <p className="text-sm text-muted-foreground">
                      When this is on, captains can see you in the available-player pool.
                    </p>
                  </div>
                  <Switch
                    checked={Boolean(form.is_available)}
                    onCheckedChange={(v) => set("is_available", v)}
                  />
                </div>
                <p className="text-sm text-muted-foreground">
                  You can change this any time from your profile.
                </p>
              </div>
            )}

            <div className="flex justify-between pt-2">
              <Button
                variant="ghost"
                onClick={() => setStep((s) => Math.max(1, s - 1))}
                disabled={step === 1}
              >
                Back
              </Button>
              {step < 3 ? (
                <Button onClick={() => saveStep(step + 1)} disabled={update.isPending}>
                  Continue
                </Button>
              ) : (
                <Button onClick={() => saveStep(3, true)} disabled={update.isPending}>
                  Finish
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

function Choice({
  value,
  onChange,
  options,
}: {
  value: string | null | undefined;
  onChange: (v: string) => void;
  options: string[];
}) {
  return (
    <Select value={value ?? ""} onValueChange={onChange}>
      <SelectTrigger>
        <SelectValue placeholder="Select" />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o} value={o}>
            {o}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
