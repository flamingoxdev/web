"use client";

import Header from "../components/Header";
import ProfileForm from "../components/ProfileForm";

export default function ProfilePage() {
  return (
    <div className="relative min-h-screen">
      <div className="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden>
        <div className="bg-orb-1 absolute -top-32 left-[15%] h-[500px] w-[500px] rounded-full bg-[#fc5c7d]/20 blur-[120px]" />
      </div>
      <Header />
      <main className="relative mx-auto max-w-3xl px-4 py-10 sm:px-6">
        <h1 className="mb-2 font-[family-name:var(--font-syne)] text-3xl font-bold">Edit Profile</h1>
        <p className="mb-8 text-sm text-muted">Update anytime — used for tailoring and auto-filling applications.</p>
        <ProfileForm mode="edit" />
      </main>
    </div>
  );
}
