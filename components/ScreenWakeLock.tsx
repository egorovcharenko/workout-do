"use client";

import { useEffect } from "react";
import { keepScreenAwake } from "@/lib/screen-wake-lock";

export function ScreenWakeLock() {
  useEffect(() => keepScreenAwake(), []);
  return null;
}
