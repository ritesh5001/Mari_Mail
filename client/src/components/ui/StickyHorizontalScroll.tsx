"use client";

import { useEffect, useRef, useState } from "react";

/**
 * A horizontal scrollbar that sticks to the bottom of the viewport as the
 * user scrolls the page. It mirrors the scroll position of the real table
 * wrapper (`targetRef`) so dragging this scrollbar scrolls the table, and
 * scrolling the table via touchpad/mouse updates this scrollbar's thumb.
 *
 * Only renders when the target actually overflows horizontally AND the
 * target's native bottom scrollbar isn't visible on-screen — otherwise
 * we'd show two scrollbars stacked, which is confusing.
 *
 * Usage:
 *   const scrollRef = useRef<HTMLDivElement>(null);
 *   <div ref={scrollRef} className="overflow-x-auto">
 *     <table>…</table>
 *   </div>
 *   <StickyHorizontalScroll targetRef={scrollRef} />
 */
export function StickyHorizontalScroll({
  targetRef,
}: {
  targetRef: React.RefObject<HTMLDivElement>;
}) {
  const proxyRef = useRef<HTMLDivElement>(null);
  const [contentWidth, setContentWidth] = useState(0);
  const [isVisible, setIsVisible] = useState(false);
  const syncingRef = useRef<"target" | "proxy" | null>(null);

  useEffect(() => {
    const target = targetRef.current;
    const proxy = proxyRef.current;
    if (!target || !proxy) return;

    // Recompute the "how wide is the scrolled content" number whenever the
    // table changes size (row added, column toggled, viewport resized).
    const measure = () => {
      const overflows = target.scrollWidth > target.clientWidth + 1;
      setContentWidth(overflows ? target.scrollWidth : 0);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(target);
    ro.observe(target.firstElementChild ?? target);
    window.addEventListener("resize", measure);

    // Two-way scroll sync. `syncingRef` prevents a scroll-event feedback
    // loop where updating one triggers the other's onScroll handler.
    const onTargetScroll = () => {
      if (syncingRef.current === "proxy") return;
      syncingRef.current = "target";
      proxy.scrollLeft = target.scrollLeft;
      syncingRef.current = null;
    };
    const onProxyScroll = () => {
      if (syncingRef.current === "target") return;
      syncingRef.current = "proxy";
      target.scrollLeft = proxy.scrollLeft;
      syncingRef.current = null;
    };
    target.addEventListener("scroll", onTargetScroll, { passive: true });
    proxy.addEventListener("scroll", onProxyScroll, { passive: true });

    // Only show the sticky bar when the *target's own* bottom scrollbar is
    // out of view. If the user has scrolled to where they can see the
    // table's native scrollbar, showing a second one is redundant.
    const visibilityObserver = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          // When the bottom edge of the target is visible in the viewport,
          // hide the sticky bar (native scrollbar is right there anyway).
          setIsVisible(!entry.isIntersecting);
        }
      },
      // Watch only the last 1px of the target — that's where the native
      // scrollbar sits.
      { rootMargin: "0px 0px 0px 0px", threshold: 0 },
    );
    // Create a sentinel at the bottom of the target so we can watch when it
    // enters/leaves the viewport.
    const sentinel = document.createElement("div");
    sentinel.style.cssText =
      "position:absolute;left:0;right:0;bottom:0;height:1px;pointer-events:none;";
    // Only add sentinel if target has a positioned ancestor to attach to;
    // otherwise fall back to observing the target itself.
    const targetParent = target.parentElement;
    if (targetParent) {
      const parentPosition = getComputedStyle(targetParent).position;
      if (parentPosition === "static") {
        targetParent.style.position = "relative";
      }
      targetParent.appendChild(sentinel);
      visibilityObserver.observe(sentinel);
    } else {
      visibilityObserver.observe(target);
    }

    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
      target.removeEventListener("scroll", onTargetScroll);
      proxy.removeEventListener("scroll", onProxyScroll);
      visibilityObserver.disconnect();
      sentinel.remove();
    };
  }, [targetRef]);

  if (contentWidth === 0) return null;

  return (
    <div
      // Sticky to viewport bottom. Aria-hidden because it's a UX aid; the
      // real scroll container is still keyboard-accessible.
      aria-hidden
      ref={proxyRef}
      className={`sticky bottom-0 z-30 overflow-x-auto border-t border-slate-200 bg-white/95 backdrop-blur-sm transition-opacity dark:border-white/[0.08] dark:bg-[#0a0a0c]/95 ${
        isVisible ? "opacity-100" : "pointer-events-none opacity-0"
      }`}
      style={{ height: 14 }}
    >
      <div style={{ width: contentWidth, height: 1 }} />
    </div>
  );
}
