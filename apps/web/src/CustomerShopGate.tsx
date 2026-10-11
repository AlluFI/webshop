import { Navigate } from "react-router-dom";
import { isStaffRole } from "@volt/shared";
import { useAuth } from "./auth";
import type { ReactNode } from "react";

export function CustomerShopGate({ children }: { children: ReactNode }) {
  const { user, ready } = useAuth();
  if (!ready) return <p>Loading…</p>;
  if (user && isStaffRole(user.role)) return <Navigate to="/admin" replace />;
  return children;
}
