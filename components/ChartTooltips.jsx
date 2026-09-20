"use client";

import { useEffect } from 'react';
import { attachChartTooltips } from '@/lib/chart-inspection';

export function ChartTooltips() {
  useEffect(() => attachChartTooltips(document), []);
  return null;
}
