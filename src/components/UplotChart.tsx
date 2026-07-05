"use client";

import { useEffect, useRef } from "react";
import uPlot from "uplot";

/**
 * Thin uPlot wrapper: recreates the plot when options/data change (creation
 * is ~1ms, far simpler than diffing) and tracks container width.
 */
export default function UplotChart({
  options,
  data,
}: {
  options: Omit<uPlot.Options, "width">;
  data: uPlot.AlignedData;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const plot = new uPlot(
      { ...options, width: el.clientWidth || 640 } as uPlot.Options,
      data,
      el,
    );
    const ro = new ResizeObserver(() => {
      if (el.clientWidth) {
        plot.setSize({ width: el.clientWidth, height: options.height });
      }
    });
    ro.observe(el);
    return () => {
      ro.disconnect();
      plot.destroy();
    };
  }, [options, data]);

  return <div ref={ref} className="w-full" />;
}
