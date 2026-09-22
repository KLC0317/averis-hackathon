"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { apiClient, getCachedCases, getCachedMetrics, setCachedCases, setCachedMetrics } from "../api/client";

const WARMUP_SESSION_KEY = "cleardraft:initial-warmup-v1";
const WARMUP_DURATION_MS = 5000;
const WARMUP_ROUTES = ["/inbox", "/todo", "/imports", "/live", "/evaluation", "/rl-audit", "/settings"];

let warmupPromise: Promise<void> | null = null;

function warmSharedResources(router: ReturnType<typeof useRouter>): Promise<void> {
  if (warmupPromise) return warmupPromise;

  warmupPromise = (async () => {
    WARMUP_ROUTES.forEach((route) => {
      try {
        router.prefetch(route);
      } catch {
        // Route prefetch is an optimization and should never block the app.
      }
    });

    const [casesResult, metricsResult] = await Promise.allSettled([
      apiClient.listCases({ limit: "1000" }),
      apiClient.getMetrics(),
      apiClient.listMailboxConnections()
    ]).then((results) => [results[0], results[1]] as const);

    if (casesResult.status === "fulfilled" && casesResult.value.length > 0) {
      setCachedCases(casesResult.value);

      // Case details already have an in-memory cache. Prefetch the first queue
      // page so opening a case is instant after the initial workspace load.
      await Promise.allSettled(
        casesResult.value.slice(0, 12).map((item) => apiClient.prefetchCase?.(item.id))
      );
    }
    if (metricsResult.status === "fulfilled") {
      setCachedMetrics(metricsResult.value);
    }
  })().catch(() => {
    // A warmup failure must never make the workspace unusable.
  });

  return warmupPromise;
}

export function InitialAppWarmup() {
  const pathname = usePathname();
  const router = useRouter();
  const [status, setStatus] = useState<"checking" | "loading" | "ready">("checking");

  useEffect(() => {
    let active = true;
    const hasSnapshot = Boolean(getCachedCases() || getCachedMetrics());
    let sessionReady = false;
    try {
      sessionReady = sessionStorage.getItem(WARMUP_SESSION_KEY) === "ready";
    } catch {
      // Storage can be unavailable in private browsing; the in-memory flow still works.
    }

    const firstVisit = !hasSnapshot && !sessionReady;
    if (!firstVisit) {
      setStatus("ready");
      if (pathname === "/") router.replace("/inbox");
    } else {
      setStatus("loading");
    }

    const finish = () => {
      try {
        sessionStorage.setItem(WARMUP_SESSION_KEY, "ready");
      } catch {
        // Ignore storage errors.
      }
      if (!active) return;
      setStatus("ready");
      if (pathname === "/") router.replace("/inbox");
    };

    const timeout = firstVisit ? window.setTimeout(finish, WARMUP_DURATION_MS) : undefined;
    warmSharedResources(router).catch(() => {
      // The fixed first-visit delay still completes even if prefetching fails.
    });

    return () => {
      active = false;
      if (timeout !== undefined) window.clearTimeout(timeout);
    };
  }, [pathname, router]);

  // Keep the server-rendered shell unobstructed while browser storage is checked.
  if (status !== "loading") return null;

  return (
    <div className="initial-warmup" role="status" aria-live="polite" aria-label="Preparing workspace">
      <div className="initial-warmup-card">
        <div className="initial-warmup-mark" aria-hidden="true">
          <img src="/cleardraft-icon.png" alt="" width={38} height={38} />
        </div>
        <div>
          <strong>Preparing your workspace</strong>
          <p>Loading the verification queue and shared resources.</p>
        </div>
        <div className="initial-warmup-progress" aria-hidden="true"><span /></div>
      </div>
    </div>
  );
}
