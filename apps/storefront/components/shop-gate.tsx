"use client";

import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { isStaffRole } from "@volt/shared";
import { useAuth } from "./auth";

export function CustomerShopGate({ children }: { children: ReactNode }) {
  const { user, ready } = useAuth();
  const router = useRouter();
  const staff = Boolean(user && isStaffRole(user.role));

  useEffect(() => {
    if (ready && staff) router.replace("/admin");
  }, [ready, staff, router]);

  if (!ready) return <p>Loading…</p>;
  if (staff) return <p>Loading…</p>;
  return children;
}
