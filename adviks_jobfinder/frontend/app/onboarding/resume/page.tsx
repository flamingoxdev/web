"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function OnboardingResumeRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/onboarding/profile");
  }, [router]);
  return null;
}
