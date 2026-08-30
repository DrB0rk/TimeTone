import { Clock3, ShieldCheck, WifiOff } from "lucide-react";
import { login } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default async function LoginPage(
  { searchParams }: { searchParams: Promise<{ error?: string }> },
) {
  const { error } = await searchParams;
  return (
    <main className="grid min-h-screen bg-[#17211b] lg:grid-cols-[1.1fr_.9fr]">
      <section className="relative hidden overflow-hidden p-14 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="absolute -right-32 top-20 size-[30rem] rounded-full border border-[#d8ff62]/20" />
        <div className="absolute -right-16 top-36 size-[20rem] rounded-full border border-[#d8ff62]/30" />
        <div className="flex items-center gap-3 font-semibold">
          <span className="grid size-10 place-items-center rounded-xl bg-[#d8ff62] text-[#17211b]">
            <Clock3 className="size-5" />
          </span>ESP Timekeep
        </div>
        <div className="relative max-w-xl">
          <p className="mb-5 text-sm font-semibold uppercase tracking-[.2em] text-[#d8ff62]">
            Time, made simple
          </p>
          <h1 className="text-6xl font-semibold leading-[1.02] tracking-[-.06em]">
            A calmer way to run the office clock.
          </h1>
          <p className="mt-6 max-w-lg text-lg leading-8 text-white/55">
            Touchscreen clock-ins, reliable offline operation, and clean reports
            for your whole team.
          </p>
        </div>
        <div className="flex gap-8 text-sm text-white/45">
          <span className="flex items-center gap-2">
            <WifiOff className="size-4 text-[#d8ff62]" />Offline first
          </span>
          <span className="flex items-center gap-2">
            <ShieldCheck className="size-4 text-[#d8ff62]" />Private by design
          </span>
        </div>
      </section>
      <section className="flex items-center justify-center bg-[#f5f6f2] p-6">
        <div className="w-full max-w-sm">
          <div className="mb-10 lg:hidden">
            <span className="grid size-12 place-items-center rounded-xl bg-[#17211b] text-[#d8ff62]">
              <Clock3 />
            </span>
          </div>
          <p className="text-xs font-semibold uppercase tracking-[.18em] text-black/45">
            Administration
          </p>
          <h2 className="mt-2 text-4xl font-semibold tracking-[-.05em]">
            Welcome back
          </h2>
          <p className="mt-3 text-sm text-black/50">
            Sign in to manage your team and review hours.
          </p>
          <form action={login} className="mt-8 space-y-5">
            <div className="space-y-2">
              <Label htmlFor="password">Admin password</Label>
              <Input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                className="h-11 bg-white"
              />
            </div>
            {error && (
              <p className="text-sm text-red-600">
                That password is not correct.
              </p>
            )}
            <Button type="submit" className="h-11 w-full bg-[#17211b] text-white hover:bg-[#28352c]">
              Sign in
            </Button>
          </form>
          <p className="mt-6 text-xs leading-5 text-black/35">
            For the local demo, use{" "}
            <code className="rounded bg-black/5 px-1.5 py-0.5">timekeep</code>.
            Set ADMIN_PASSWORD before deployment.
          </p>
        </div>
      </section>
    </main>
  );
}
