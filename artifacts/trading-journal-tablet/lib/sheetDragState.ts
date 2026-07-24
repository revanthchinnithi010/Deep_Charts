/**
 * lib/sheetDragState.ts — React Native
 *
 * Migration of: artifacts/trading-journal/src/lib/sheetDragState.ts
 * Phase 12.5 — Splash Screen & Transition Infrastructure
 *
 * No web-API replacements needed — this module is already platform-agnostic.
 * The implementation is structurally identical to the web source.
 *
 * Purpose (unchanged):
 *   Module-level flag: true while a BottomSheet is being finger-dragged.
 *   CustomChart's scheduleChartUpdate checks this and skips series.update()
 *   during drag so the chart canvas doesn't repaint and compete with the
 *   sheet's GPU compositor animation.
 *
 *   flush: CustomChart registers its scheduleChartUpdate here so the sheet
 *   can trigger a chart flush immediately when drag ends (processes any bar
 *   that accumulated in pendingChartBarRef during the suppressed window).
 *
 * React Native notes:
 *   In RN, BottomSheet drag is handled by react-native-gesture-handler /
 *   @gorhom/bottom-sheet.  The sheet component sets sheetDragState.active
 *   in its onChange / onAnimate callbacks and calls sheetDragState.flush?.()
 *   in its onClose / snap-complete callback — same contract as the web.
 *   The chart suppression logic in scheduleChartUpdate reads this flag on
 *   the JS thread before scheduling a Reanimated frame, which remains safe.
 */

export const sheetDragState: {
  active: boolean;
  flush: (() => void) | null;
} = {
  active: false,
  flush:  null,
};
