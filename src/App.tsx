import React, { Suspense, lazy } from "react";
import { HelmetProvider } from "react-helmet-async";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { persistQueryClient } from "@tanstack/react-query-persist-client";
import { BrowserRouter, Routes as ReactRoutes, Route, Navigate } from "react-router-dom";
import SwUpdater from "./components/SwUpdater";
import InstallPrompt from "./components/InstallPrompt";
import NetworkStatus from "./components/NetworkStatus";
import SyncIndicator from "./components/SyncIndicator";
import Analytics from "./components/Analytics";
import { PageSkeleton } from "@/components/skeletons/PageSkeleton";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import MainLayout from "@/components/Layout/MainLayout";
import PinGate from "@/components/PinGate";
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Customers = lazy(() => import("./pages/Customers"));
const Bottles = lazy(() => import("./pages/Bottles"));
// Removed Routes page
const Delivery = lazy(() => import("./pages/Delivery"));
const Transactions = lazy(() => import("./pages/Transactions"));
const FunctionOrders = lazy(() => import("./pages/FunctionOrders"));
const Pricing = lazy(() => import("./pages/Pricing"));
const Reports = lazy(() => import("./pages/Reports"));
const Settings = lazy(() => import("./pages/Settings"));
const Shop = lazy(() => import("./pages/Shop"));
const Auth = lazy(() => import("./pages/Auth"));
const NotFound = lazy(() => import("./pages/NotFound"));

const queryClient = new QueryClient();

// Persist React Query cache using localStorage without extra deps
const persister: any = {
  persistClient: (client: unknown) => {
    try { localStorage.setItem('rq-cache', JSON.stringify(client as any)); } catch {}
  },
  restoreClient: async () => {
    try { const v = localStorage.getItem('rq-cache'); return v ? JSON.parse(v) : undefined; } catch { return undefined; }
  },
  removeClient: () => { try { localStorage.removeItem('rq-cache'); } catch {} }
};

persistQueryClient({ queryClient, persister, maxAge: 1000 * 60 * 60 });

// Protected Route Component
const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, loading } = useAuth();
  
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <img src="/logo.png" alt="Logo" className="h-30 w-30" />
      </div>
    );
  }
  
  if (!user) {
    return <Navigate to="/auth" replace />;
  }
  
  return <>{children}</>;
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <HelmetProvider>
      <TooltipProvider>
        <AuthProvider>
        <Toaster />
        <Sonner />
        <SwUpdater />
        <InstallPrompt />
        <NetworkStatus />
        <SyncIndicator />
        <Analytics />
        <BrowserRouter>
          <Suspense fallback={<div className="p-4 lg:p-6"><PageSkeleton /></div>}>
            <ReactRoutes>
              <Route path="/auth" element={<Auth />} />
              <Route path="/" element={
                <ProtectedRoute>
                  <PinGate>
                    <MainLayout />
                  </PinGate>
                </ProtectedRoute>
              }>
                <Route index element={<Dashboard />} />
                <Route path="customers" element={<Customers />} />
                <Route path="bottles" element={<Bottles />} />
      {/* Routes page removed */}
      <Route path="delivery" element={<Delivery />} />
      <Route path="transactions" element={<Transactions />} />
      <Route path="events" element={<FunctionOrders />} />
      <Route path="function-orders" element={<Navigate to="/events" replace />} />
      <Route path="shop" element={<Shop />} />
      <Route path="pricing" element={<Pricing />} />
      <Route path="counter" element={<div className="p-6">Counter Sales page - Coming soon</div>} />
      <Route path="reports" element={<Reports />} />
      <Route path="settings" element={<Settings />} />
              </Route>
              {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
              <Route path="*" element={<NotFound />} />
            </ReactRoutes>
          </Suspense>
        </BrowserRouter>
        </AuthProvider>
      </TooltipProvider>
    </HelmetProvider>
  </QueryClientProvider>
);
export default App;
