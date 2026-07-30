import { createFileRoute } from "@tanstack/react-router";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { isSupabaseConfigured } from "@/lib/supabase";

export const Route = createFileRoute("/setup")({
  head: () => ({
    meta: [
      { title: "Connect Supabase — WicketWise" },
      { name: "description", content: "How to point WicketWise at your own Supabase project." },
      { property: "og:title", content: "Connect Supabase — WicketWise" },
      { property: "og:description", content: "Two environment variables and one SQL file." },
    ],
  }),
  component: SetupPage,
});

function SetupPage() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold">Connect your Supabase project</h1>
        <p className="text-sm text-muted-foreground">
          Status:{" "}
          {isSupabaseConfigured ? (
            <span className="font-medium text-success">connected</span>
          ) : (
            <span className="font-medium text-warning-foreground">not configured</span>
          )}
        </p>
      </header>

      <Card className="shadow-card">
        <CardHeader>
          <CardTitle className="text-base">1. Create the schema</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>
            Open your Supabase project → SQL Editor, paste the contents of{" "}
            <code className="rounded bg-muted px-1.5 py-0.5">db/schema.sql</code> from this repo and
            run it. It creates the tables, row-level security policies, grants and the derived
            statistics views.
          </p>
        </CardContent>
      </Card>

      <Card className="shadow-card">
        <CardHeader>
          <CardTitle className="text-base">2. Add environment variables</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>
            Locally in <code className="rounded bg-muted px-1.5 py-0.5">.env</code>, and on Vercel
            under Project Settings → Environment Variables:
          </p>
          <pre className="overflow-x-auto rounded-xl bg-muted p-4 text-xs text-foreground">
            {`VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<your anon/publishable key>`}
          </pre>
          <p>Both come from Supabase → Project Settings → API. The anon key is safe in the browser.</p>
        </CardContent>
      </Card>

      <Card className="shadow-card">
        <CardHeader>
          <CardTitle className="text-base">3. Deploy</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>
            Push to GitHub and import the repo on Vercel. It builds with{" "}
            <code className="rounded bg-muted px-1.5 py-0.5">npm run build</code> and needs no other
            configuration.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
