import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes as ReactRoutes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import MainLayout from "@/components/Layout/MainLayout";
import Dashboard from "./pages/Dashboard";
import Customers from "./pages/Customers";
import Bottles from "./pages/Bottles";
// Removed Routes page
import Delivery from "./pages/Delivery";
import Transactions from "./pages/Transactions";
import FunctionOrders from "./pages/FunctionOrders";
import Pricing from "./pages/Pricing";
import Reports from "./pages/Reports";
import Settings from "./pages/Settings";
import Shop from "./pages/Shop";
import Auth from "./pages/Auth";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

// Protected Route Component
const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, loading } = useAuth();
  
  if (loading) {
    return <div className="flex items-center justify-center min-h-screen">Loading...</div>;
  }
  
  if (!user) {
    return <Navigate to="/auth" replace />;
  }
  
  return <>{children}</>;
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <AuthProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <ReactRoutes>
            <Route path="/auth" element={<Auth />} />
            <Route path="/" element={
              <ProtectedRoute>
                <MainLayout />
              </ProtectedRoute>
            }>
              <Route index element={<Dashboard />} />
              <Route path="customers" element={<Customers />} />
              <Route path="bottles" element={<Bottles />} />
      {/* Routes page removed */}
      <Route path="delivery" element={<Delivery />} />
      <Route path="transactions" element={<Transactions />} />
      <Route path="function-orders" element={<FunctionOrders />} />
      <Route path="shop" element={<Shop />} />
      <Route path="pricing" element={<Pricing />} />
      <Route path="counter" element={<div className="p-6">Counter Sales page - Coming soon</div>} />
      <Route path="reports" element={<Reports />} />
      <Route path="settings" element={<Settings />} />
            </Route>
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </ReactRoutes>
        </BrowserRouter>
      </AuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
