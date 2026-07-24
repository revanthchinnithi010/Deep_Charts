/**
 * components/animations/index.ts — Barrel export
 *
 * Migration of: artifacts/trading-journal/src/components/animations/index.ts
 *
 * Phase 12.3 exports (complete):
 *   FadeIn, FadeInVariant
 *   AnimatedCard
 *   LoadingSpinner, DotLoader
 *   NumberCounter
 *
 * Phase 12.4 exports (complete):
 *   AnimatedButton, AnimatedIconButton
 *   AnimatedList, AnimatedListItem, AnimatedPresenceList
 *   AnimatedModal
 *   PageTransition
 *
 * Pending future phases (do not import until migrated):
 *   SplashScreen  — future phase
 */

export { FadeIn }                       from "./FadeIn";
export type { FadeInVariant }           from "./FadeIn";

export { AnimatedCard }                 from "./AnimatedCard";

export {
  LoadingSpinner,
  DotLoader,
}                                       from "./LoadingSpinner";

export { NumberCounter }                from "./NumberCounter";

export {
  AnimatedButton,
  AnimatedIconButton,
}                                       from "./AnimatedButton";

export {
  AnimatedList,
  AnimatedListItem,
  AnimatedPresenceList,
}                                       from "./AnimatedList";

export { AnimatedModal }                from "./AnimatedModal";

export { PageTransition }               from "./PageTransition";
