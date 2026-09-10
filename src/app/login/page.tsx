"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function LoginPage() {
  const router = useRouter();

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-10">
      <Card className="w-full max-w-md">
        <CardHeader className="items-center text-center">
          <Logo showTagline />
          <CardTitle className="mt-4">Sign in to Hayagriva</CardTitle>
          <p className="text-sm text-muted">
            For municipal and operations teams (demo auth)
          </p>
        </CardHeader>
        <CardContent>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              toast.success("Signed in to demo workspace");
              router.push("/dashboard");
            }}
          >
            <label className="block text-sm">
              <span className="mb-1.5 block text-muted">Work email</span>
              <Input type="email" required placeholder="you@city.gov.in" />
            </label>
            <label className="block text-sm">
              <span className="mb-1.5 block text-muted">Password</span>
              <Input type="password" required placeholder="••••••••" />
            </label>
            <Button type="submit" className="w-full">
              Sign In
            </Button>
          </form>
          <p className="mt-4 text-center text-sm text-muted">
            Looking for road conditions near you?{" "}
            <Link href="/citizen" className="text-forest underline">
              Open citizen portal
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
