"use client";

import { useRouter } from "next/navigation";
import Header from "../../components/Header";
import ProfileForm from "../../components/ProfileForm";

export default function OnboardingProfilePage() {
  const router = useRouter();

  return (
    <div className="relative min-h-screen">
      <div className="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden>
        <div className="bg-orb-1 absolute -top-32 left-[15%] h-[500px] w-[500px] rounded-full bg-[#fc5c7d]/20 blur-[120px]" />
        <div className="bg-orb-3 absolute -bottom-20 left-[35%] h-[380px] w-[380px] rounded-full bg-[#ffb3c1]/25 blur-[90px]" />
      </div>
      <Header />
      <main className="relative mx-auto max-w-3xl px-4 py-10 sm:px-6">
        <h1 className="mb-2 font-[family-name:var(--font-syne)] text-3xl font-bold">Your Profile</h1>
        <p className="mb-8 text-sm text-muted">Required before you can search and apply to jobs.</p>
        <ProfileForm mode="onboarding" onComplete={() => router.push("/templates")} />
      </main>
    </div>
  );
}
