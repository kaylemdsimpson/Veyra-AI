"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";

export default function LoginPage() {
  const { login, loginDemo } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);
    try {
      await login(email, password);
      router.push("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen">
      {/* Left — branding panel */}
      <div className="hidden w-1/2 lg:flex" style={{ background: "hsl(234 25% 12%)" }}>
        <div className="flex flex-1 flex-col justify-between p-12">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[hsl(262,83%,58%)]">
              <span className="text-sm font-bold text-white">V</span>
            </div>
            <span className="text-lg font-semibold text-white">Veyra</span>
          </div>
          <div className="space-y-6">
            <h1 className="text-4xl font-bold leading-tight text-white">
              Recover abandoned
              <br />
              checkouts on
              <br />
              <span className="text-[hsl(262,83%,65%)]">autopilot.</span>
            </h1>
            <p className="max-w-md text-base text-[hsl(240,10%,55%)]">
              Smart recovery flows, intelligent discounting, and multi-channel
              messaging — all working while you sleep.
            </p>
          </div>
          <div className="flex gap-8">
            <div>
              <p className="text-2xl font-bold text-white">33%</p>
              <p className="text-xs text-[hsl(240,10%,50%)]">Recovery rate</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-white">+24.8%</p>
              <p className="text-xs text-[hsl(240,10%,50%)]">Incremental lift</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-white">5 min</p>
              <p className="text-xs text-[hsl(240,10%,50%)]">Setup time</p>
            </div>
          </div>
        </div>
      </div>

      {/* Right — login form */}
      <div className="flex flex-1 items-center justify-center px-6">
        <div className="w-full max-w-sm space-y-8">
          {/* Mobile logo */}
          <div className="flex items-center gap-2 lg:hidden">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[hsl(262,83%,58%)]">
              <span className="text-sm font-bold text-white">V</span>
            </div>
            <span className="text-lg font-semibold">Veyra</span>
          </div>

          <div>
            <h2 className="text-2xl font-bold tracking-tight">Welcome back</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Sign in to your dashboard
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="email" className="text-sm font-medium">
                Email
              </Label>
              <Input
                id="email"
                type="email"
                placeholder="you@yourstore.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="h-11"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password" className="text-sm font-medium">
                Password
              </Label>
              <Input
                id="password"
                type="password"
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="h-11"
                required
              />
            </div>
            {error && (
              <div className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </div>
            )}
            <Button type="submit" className="h-11 w-full text-sm font-medium" disabled={isLoading}>
              {isLoading ? "Signing in..." : "Sign in"}
            </Button>
          </form>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <Separator className="w-full" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-background px-3 text-muted-foreground">or</span>
            </div>
          </div>

          <Button
            type="button"
            variant="outline"
            className="h-11 w-full text-sm font-medium"
            onClick={loginDemo}
          >
            Explore Demo Dashboard
          </Button>
          <p className="text-center text-xs text-muted-foreground">
            Preview the full dashboard with sample data
          </p>
        </div>
      </div>
    </div>
  );
}
