"use client";

import dynamic from "next/dynamic";
import { useEffect } from "react";
import { usePathname } from "next/navigation";

import { useAuditFetch } from "../hooks/useAuditFetch";
import { audit } from "@/lib/audit";

const AuditLog = dynamic(() => import("./AuditLog"), { ssr: false });

export default function AuditHost() {
  useAuditFetch();
  const pathname = usePathname();

  useEffect(() => {
    audit.setPage(pathname || "/");
  }, [pathname]);

  return <AuditLog />;
}
