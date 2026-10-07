import React from "react";
import { Route, Switch, Redirect } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { OfflineBanner } from "@/components/OfflineBanner";
import { PublicWebsite } from "@/components/PublicWebsite";
import { LoginPage } from "@/components/LoginPage";
import { PlatformAdminView } from "@/components/PlatformAdminView";
import { DashboardPortal } from "@/components/DashboardPortal";
import { CustomerMenuView } from "@/components/CustomerMenuView";
import { CustomerOrderStatus } from "@/components/CustomerOrderStatus";
import VerifyEmailPage from "@/components/VerifyEmailPage";
import NotFound from "@/pages/not-found";
import { TablelineTopProgress } from "@/components/TablelineLoading";
import { useLocation } from "wouter";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      staleTime: 5000,
    },
  },
});

function RouteTransitionProgress() {
  const [location] = useLocation();
  const [isNavigating, setIsNavigating] = React.useState(false);
  const prevLocRef = React.useRef(location);

  React.useEffect(() => {
    if (prevLocRef.current !== location) {
      prevLocRef.current = location;
      setIsNavigating(true);
      const timer = setTimeout(() => setIsNavigating(false), 380);
      return () => clearTimeout(timer);
    }
  }, [location]);

  return <TablelineTopProgress isVisible={isNavigating} />;
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <RouteTransitionProgress />
      <OfflineBanner />
      <Switch>
        <Route path="/" component={PublicWebsite} />
        <Route path="/login" component={LoginPage} />
        <Route path="/verify-email" component={VerifyEmailPage} />
        <Route path="/verify" component={VerifyEmailPage} />
        <Route path="/admin" component={PlatformAdminView} />
        <Route path="/admin/:subpath*" component={PlatformAdminView} />

        {/* Customer Table Menu Flow: canonical URL /menu/${restaurantSlug}/table/${table.slug}, binds menu.restaurant.name & menu.table.number, supports Combo Meal upsells */}
        <Route
          path="/menu/:restaurantSlug/table/:tableSlug/order/:orderId"
          component={CustomerOrderStatus}
        />
        <Route
          path="/menu/:restaurantSlug/table/:tableSlug/orders/:orderId"
          component={CustomerOrderStatus}
        />
        <Route
          path="/menu/:restaurantSlug/table/:tableSlug/bill"
          component={CustomerOrderStatus}
        />
        <Route
          path="/menu/:restaurantSlug/table/:tableSlug/orders"
          component={CustomerOrderStatus}
        />
        <Route
          path="/menu/:restaurantSlug/table/:tableSlug"
          component={CustomerMenuView}
        />
        <Route path="/orders/:orderId" component={CustomerOrderStatus} />
        <Route path="/order/:orderId" component={CustomerOrderStatus} />

        {/* Legacy /captain routes redirect cleanly to the main table workspace */}
        <Route path="/captain/:slug">
          {(params) => <Redirect to={`/dashboard/${params.slug}/tables`} />}
        </Route>
        <Route path="/captain">
          <Redirect to="/dashboard" />
        </Route>

        {/* Operator Dashboard Routes */}
        <Route path="/dashboard">
          <Redirect to="/dashboard/cafe-1" />
        </Route>
        <Route path="/:slug/admin/:tab">
          {(params) => <Redirect to={`/dashboard/${params.slug}/${params.tab}`} />}
        </Route>
        <Route path="/:slug/admin">
          {(params) => <Redirect to={`/dashboard/${params.slug}`} />}
        </Route>
        <Route path="/dashboard/:slug/bills">
          {(params) => <DashboardPortal slug={params.slug} initialTab="bills" />}
        </Route>
        <Route path="/dashboard/:slug/captain">
          {(params) => <Redirect to={`/dashboard/${params.slug}/tables`} />}
        </Route>
        <Route path="/dashboard/:slug/shift-close">
          {(params) => <DashboardPortal slug={params.slug} initialTab="shift-close" />}
        </Route>
        <Route path="/dashboard/:slug/orders">
          {(params) => <DashboardPortal slug={params.slug} initialTab="orders" />}
        </Route>
        <Route path="/dashboard/:slug/kds">
          {(params) => <DashboardPortal slug={params.slug} initialTab="kds" />}
        </Route>
        <Route path="/dashboard/:slug/waiter-calls">
          {(params) => <DashboardPortal slug={params.slug} initialTab="waiter-calls" />}
        </Route>
        <Route path="/dashboard/:slug/menu">
          {(params) => <DashboardPortal slug={params.slug} initialTab="menu" />}
        </Route>
        <Route path="/dashboard/:slug/tables">
          {(params) => <DashboardPortal slug={params.slug} initialTab="tables" />}
        </Route>
        <Route path="/dashboard/:slug/finance">
          {(params) => <DashboardPortal slug={params.slug} initialTab="finance" />}
        </Route>
        <Route path="/dashboard/:slug/analytics">
          {(params) => <Redirect to={`/dashboard/${params.slug}/finance`} />}
        </Route>
        <Route path="/dashboard/:slug/reports">
          {(params) => <Redirect to={`/dashboard/${params.slug}/finance`} />}
        </Route>
        <Route path="/dashboard/:slug/reviews">
          {(params) => <DashboardPortal slug={params.slug} initialTab="reviews" />}
        </Route>
        <Route path="/dashboard/:slug/staff">
          {(params) => <DashboardPortal slug={params.slug} initialTab="staff" />}
        </Route>
        <Route path="/dashboard/:slug/audit-logs">
          {(params) => <DashboardPortal slug={params.slug} initialTab="audit-logs" />}
        </Route>
        <Route path="/dashboard/:slug/plans">
          {(params) => <DashboardPortal slug={params.slug} initialTab="plans" />}
        </Route>
        <Route path="/dashboard/:slug/settings">
          {(params) => <DashboardPortal slug={params.slug} initialTab="settings" />}
        </Route>
        <Route path="/dashboard/:slug">
          {(params) => <DashboardPortal slug={params.slug} initialTab="overview" />}
        </Route>

        {/* 404 Catch-all */}
        <Route component={NotFound} />
      </Switch>
      <Toaster />
    </QueryClientProvider>
  );
}
