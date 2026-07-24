/**
 * components/animations/index.ts — Barrel export
 *
 * Migration of: artifacts/trading-journal/src/components/animations/index.ts
 * Phase 12.3 — Animation Primitive Wrappers (React → React Native)
 *
 * Phase 12.3 exports (complete):
 *   FadeIn, FadeInVariant
 *   AnimatedCard
 *   LoadingSpinner, DotLoader
 *   NumberCounter
 *
 * Pending future phases (do not import until migrated):
 *   AnimatedList, AnimatedListItem, AnimatedPresenceList  — Phase 12.4
 *   AnimatedModal                                         — future phase
 *   AnimatedButton, AnimatedIconButton                    — future phase
 *   PageTransition                                        — future phase
 *   SplashScreen                                          — future phase
 */

export { FadeIn }                       from "./FadeIn";
export type { FadeInVariant }           from "./FadeIn";

export { AnimatedCard }                 from "./AnimatedCard";

export {
  LoadingSpinner,
  DotLoader,
}                                       from "./LoadingSpinner";

export { NumberCounter }                from "./NumberCounter";
