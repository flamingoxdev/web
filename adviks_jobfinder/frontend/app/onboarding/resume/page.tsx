"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Header from "../../components/Header";
import ResumeUpload from "../../components/ResumeUpload";

export default function OnboardingResumePage() {
  const router = useRouter();
  const [done, setDone] = useState(false);

  return (
    <div className="relative min-h-screen">
      <div className="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden>
        <div className="bg-orb-2 absolute top-[40%] -right-20 h-[420px] w-[420px] rounded-full bg-[#f77062]/15 blur-[100px]" />
      </div>
      <Header />
      <main className="relative mx-auto max-w-xl px-4 py-10 sm:px-6">
        <div className="mb-6 rounded-xl border border-accent-violet/20 bg-accent-violet/5 px-4 py-3 text-sm">
          <strong>Step 3 of 4:</strong> Upload your resume (PDF). We parse skills and attach this file when auto-filling applications.
        </div>
        <h1 className="mb-2 font-[family-name:var(--font-syne)] text-3xl font-bold">Upload Resume</h1>
        <p className="mb-8 text-sm text-muted">Required to match jobs and tailor applications.</p>
        <ResumeUpload
          isUploaded={done}
          onUploadComplete={() => {
            setDone(true);
            setTimeout(() => router.push("/dashboard"), 600);
          }}
        />
      </main>
    </div>
  );
}
