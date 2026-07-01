"use client";

import type { ReactNode } from "react";
import { SignalHigh, Wifi, BatteryFull } from "lucide-react";

export default function PhoneShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center sm:p-6">
      <div className="relative flex h-[100dvh] w-full max-w-[430px] flex-col overflow-hidden bg-sys-card sm:h-[860px] sm:max-h-[92dvh] sm:rounded-phone sm:shadow-phone">
        <StatusBar />
        <div className="relative flex-1 overflow-hidden">{children}</div>
      </div>
    </div>
  );
}

function StatusBar() {
  return (
    <div className="flex shrink-0 items-center justify-between px-7 pt-3 pb-1 text-label">
      <span className="text-[15px] font-semibold tracking-tight">9:41</span>
      <div className="flex items-center gap-1.5">
        <SignalHigh className="h-4 w-4" strokeWidth={2.5} />
        <Wifi className="h-4 w-4" strokeWidth={2.5} />
        <BatteryFull className="h-5 w-5" strokeWidth={2} />
      </div>
    </div>
  );
}
