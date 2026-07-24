// NativeWind v4 — must be the first import in the root layout so the
// CSS→JS transform is registered before any component tree is evaluated.
import "../global.css";

// ─── Production infrastructure (initialize before any component renders) ──────
// Sentry and analytics are no-ops in __DEV__ and when env vars are absent,
// so importing here is safe for both development and production.
import { initSentry, captureException } from "@/lib/sentry";
import { initAnalytics, trackSessionStart, trackSessionEnd, flushAnalytics } from "@/lib/analytics";

initSentry();
initAnalytics();
// ─────────────────────────────────────────────────────────────────────────────

import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from "@expo-google-fonts/inter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { setBaseUrl } from "@workspace/api-client-react";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { AppState, type AppStateStatus, Platform } from "react-native";
import { initSkia } from "@/lib/skiaLoader";
import { BottomSheetModalProvider } from "@gorhom/bottom-sheet";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { ErrorBoundary } from "@/components/ErrorBoundary";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { Toaster } from "@/components/ui/toaster";
import { WatchlistProvider } from "@/contexts/WatchlistContext";
import { useOTAUpdates } from "@/lib/updates";

// ─────────────────────────────────────────────────────────────────────────────
// API base URL
//
// EXPO_PUBLIC_API_BASE_URL takes precedence (production-friendly override).
// Falls back to EXPO_PUBLIC_DOMAIN which is set to $REPLIT_DEV_DOMAIN in the
// dev script — giving us the correct Replit proxy URL automatically.
//
// To swap for production: set EXPO_PUBLIC_API_BASE_URL in your release build.
// ─────────────────────────────────────────────────────────────────────────────

const _apiBaseUrl: string | null =
  process.env.EXPO_PUBLIC_API_BASE_URL ??
  (process.env.EXPO_PUBLIC_DOMAIN
    ? `https://${process.env.EXPO_PUBLIC_DOMAIN}`
    : null);

setBaseUrl(_apiBaseUrl);

// ─────────────────────────────────────────────────────────────────────────────
// React Query client
//
// Created once at module level — never inside a component — to prevent
// duplicate instances across hot reloads or re-renders.
// ─────────────────────────────────────────────────────────────────────────────

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 2,
      staleTime: 5 * 60 * 1_000,   // 5 min — fresh enough for trading data
      gcTime: 10 * 60 * 1_000,     // 10 min — keep inactive queries in cache
      refetchOnReconnect: true,
    },
    mutations: {
      retry: false,                  // mutations are not idempotent; never auto-retry
    },
  },
});

SplashScreen.preventAutoHideAsync();

// Maximum time (ms) we'll wait for fonts before rendering anyway.
// Prevents the app from hanging forever on the splash screen when font
// loading stalls (asset registry miss, network hiccup, pnpm symlink lag).
const FONT_TIMEOUT_MS = 4_000;

// ─────────────────────────────────────────────────────────────────────────────
// Navigation root
// ─────────────────────────────────────────────────────────────────────────────

function RootLayoutNav() {
  return (
    <>
      {/*
        StatusBar is a portal — it controls system UI, not layout.
        style="auto" defers to the active theme (light text on dark, dark on light).
      */}
      <StatusBar style="auto" />

      <Stack screenOptions={{ headerShown: false, animation: "none" }}>
        {/* Current WebView wrapper — the entry point for the web-bridge phase */}
        <Stack.Screen name="index" />
        {/*
          (tabs) route group — the native navigation shell.
          Route groups are transparent in URLs; (tabs)/index resolves to /tabs/index
          while app/index.tsx retains ownership of /.
          This screen is additive — it does not replace the WebView root.
        */}
        <Stack.Screen name="(tabs)" />
        {/*
          Stack screens for detail pages pushed on top of the tab bar.
          trade/[id]    — Trade detail (currently a "coming soon" stub,
                          matching web src/pages/trade.tsx)
          position/[id] — Full position detail screen with live PnL, bracket
                          orders, close/update actions.
        */}
        <Stack.Screen name="trade/[id]" />
        <Stack.Screen name="position/[id]" />
        {/*
          webview — preserved WebView bridge, accessible via router.push("/webview").
          Not in the tab bar; not the default launch screen.  Available for
          intentional use (e.g. opening the full web app from a settings screen).
        */}
        <Stack.Screen name="webview" />
        {/* Phase 10.8 analytics stack screens — no tab bar, back-navigable */}
        <Stack.Screen name="pnl-analytics" />
        <Stack.Screen name="net-pnl-analytics" />
        {/*
          settings — nested Stack rooted at app/settings/_layout.tsx.
          Pushed on top of the tab bar; back button returns to the previous screen.
          animation: "none" here defers to the nested Stack's own animation
          (slide_from_right defined in app/settings/_layout.tsx).
          Phase 11 — Settings migration.
        */}
        <Stack.Screen name="settings" />
        {/*
          profile — Full-screen profile screen (name, email, export, sign out).
          Pushed on top of the tab bar; back button returns to the previous screen.
          animation: "slide_from_right" so it slides in like settings sub-pages.
          Phase 11.3 — Profile Module migration.
        */}
        <Stack.Screen
          name="profile"
          options={{ animation: "slide_from_right" }}
        />
        {/* +not-found must be declared so Expo Router can match unknown routes. */}
        <Stack.Screen name="+not-found" />
      </Stack>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Root layout
//
// Provider order (outer → inner):
//   SafeAreaProvider   — insets must be available everywhere
//     ThemeProvider    — theme must be available to ErrorBoundary fallback UI
//       ErrorBoundary  — catches errors thrown by everything below
//         GestureHandlerRootView
//           QueryClientProvider
//             RootLayoutNav
// ─────────────────────────────────────────────────────────────────────────────

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  // renderReady flips to true when fonts are done (loaded or failed) OR when
  // the timeout fires — whichever comes first.  This guarantees the app is
  // never permanently stuck on the splash screen.
  const [renderReady, setRenderReady] = useState(false);

  // ── Skia initialization gate ─────────────────────────────────────────────────
  // On Expo Web, SkiaPictureView.web.js uses `CanvasKit` as a bare global that
  // is only populated after CanvasKit WASM loads.  We must block the render tree
  // until initSkia() resolves so no <Canvas> mounts prematurely.
  //
  // On Android/iOS the native Skia module initialises itself; initSkia() is a
  // no-op (lib/skiaLoader.ts).  Metro resolves lib/skiaLoader.web.ts for web
  // and lib/skiaLoader.ts for native — canvaskit-wasm is NEVER bundled for
  // Android/iOS, which eliminates the "Unable to resolve module fs" error.
  const [skiaReady, setSkiaReady] = useState(Platform.OS !== "web");

  useEffect(() => {
    if (Platform.OS !== "web") return;
    initSkia()
      .then(() => setSkiaReady(true))
      .catch((err: unknown) => {
        console.error("[Skia] initSkia failed:", err);
        setSkiaReady(true); // render anyway — ErrorBoundary covers chart screens
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Primary path: fonts resolved normally.
  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync().catch(() => {});
      setRenderReady(true);
    }
  }, [fontsLoaded, fontError]);

  // Fallback path: hide splash and render regardless after FONT_TIMEOUT_MS.
  useEffect(() => {
    const t = setTimeout(() => {
      SplashScreen.hideAsync().catch(() => {});
      setRenderReady(true);
    }, FONT_TIMEOUT_MS);
    return () => clearTimeout(t);
  }, []);

  // ── OTA Updates ───────────────────────────────────────────────────────────────
  // Checks for OTA updates on launch and foreground resume. Downloads silently;
  // never force-reloads the active session — update applies on next cold start.
  useOTAUpdates();

  // ── Session lifecycle analytics ───────────────────────────────────────────────
  // Track session start/end as the app moves in and out of the foreground.
  // No-op in __DEV__ or when analytics are not configured.
  const appState = useRef<AppStateStatus>(AppState.currentState);
  useEffect(() => {
    trackSessionStart();

    const subscription = AppState.addEventListener("change", (next) => {
      const prev = appState.current;
      appState.current = next;
      if (prev !== "active" && next === "active") {
        trackSessionStart();
      } else if (prev === "active" && (next === "inactive" || next === "background")) {
        trackSessionEnd();
        void flushAnalytics();
      }
    });

    return () => subscription.remove();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── ErrorBoundary onError handler ─────────────────────────────────────────────
  // Forward render errors from the ErrorBoundary to Sentry. This is the only
  // path for capturing errors that crash the React tree before any try/catch.
  const handleBoundaryError = useCallback((error: Error, stackTrace: string) => {
    captureException(error, { stackTrace: stackTrace.slice(0, 500) });
  }, []);

  if (!renderReady || !skiaReady) return null;

  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <QueryClientProvider client={queryClient}>
          <ErrorBoundary onError={handleBoundaryError}>
            <GestureHandlerRootView style={{ flex: 1 }}>
              <BottomSheetModalProvider>
                <WatchlistProvider>
                  <RootLayoutNav />
                </WatchlistProvider>
              </BottomSheetModalProvider>
            </GestureHandlerRootView>
          </ErrorBoundary>
        </QueryClientProvider>
      </ThemeProvider>
      {/* Global toast overlay — must be last so it renders above all screens */}
      <Toaster topOffset={56} bottomOffset={80} />
    </SafeAreaProvider>
  );
}
