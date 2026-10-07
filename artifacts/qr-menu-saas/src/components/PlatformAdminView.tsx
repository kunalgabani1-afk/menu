import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import {
  LayoutDashboard,
  Users,
  UtensilsCrossed,
  Plus,
  ArrowRight,
  TrendingUp,
  ShieldAlert,
  CheckCircle2,
  Clock,
  ChevronRight,
  ExternalLink,
  Edit2,
  Sparkles,
  Phone,
  Mail,
  MapPin,
  HelpCircle,
  LogOut,
  RefreshCw,
  QrCode,
  DollarSign,
  AlertTriangle,
  Building,
  KeyRound,
  Lock,
  Copy,
  Check,
  ShieldCheck,
  CreditCard,
  Receipt,
  Calendar,
  Menu,
  X,
  Store,
  Eye,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { PlatformAdminLoader } from "./CafeLoaders";
import { useLogout } from "@workspace/api-client-react";
import { getIdToken, signOutCurrentUser, subscribeToAuthState } from "@/lib/firebase";
import { formatCurrency, formatNumber } from "@/lib/formatters";
import { validateOnboardingEmail, STANDARD_EMAIL_ERROR } from "@/lib/emailValidation";

interface Lead {
  id: string;
  restaurantName: string;
  ownerName: string;
  phone: string;
  email: string;
  city: string;
  numberOfTables: number;
  requestedPlan: string;
  needs: string;
  message?: string;
  status: "new" | "contacted" | "qualified" | "setup" | "converted" | "lost";
  notes?: string;
  emailVerified?: boolean;
  verifiedAt?: number;
  createdAt: number;
  convertedRestaurantId?: string;
  convertedSlug?: string;
}

interface PlatformMetrics {
  totalRestaurants: number;
  activeRestaurants: number;
  setupPending: number;
  newLeads: number;
  totalLeads: number;
  estimatedMRR: number;
  needsAttention: number;
}

interface PlanRequestItem {
  id: string;
  restaurantId: string;
  restaurantSlug: string;
  restaurantName: string;
  currentPlan: string;
  requestedPlan: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  createdAt: number;
  requestedBy: string;
  reviewedAt?: number;
  reviewedBy?: string;
  reviewNotes?: string;
}

export function PlatformAdminView() {
  const [, setLocation] = useLocation();
  const logout = useLogout();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<"overview" | "leads" | "restaurants" | "plans" | "support" | "plan_requests" | "renewals">("overview");

  // Strict Platform Authorization State
  const [authStatus, setAuthStatus] = useState<"checking" | "unauthenticated" | "forbidden" | "authorized">("checking");
  const [currentUserEmail, setCurrentUserEmail] = useState<string | null>(null);
  const [userRestaurantSlug, setUserRestaurantSlug] = useState<string | null>(null);

  // Subscription Renewals State
  const [renewals, setRenewals] = useState<any[]>([]);
  const [loadingRenewals, setLoadingRenewals] = useState(false);
  const [verifyingPaymentId, setVerifyingPaymentId] = useState<string | null>(null);
  const [renewalFilter, setRenewalFilter] = useState<"all" | "pending_verification" | "grace_period" | "past_due">("all");

  // Plan Requests
  const [planRequests, setPlanRequests] = useState<PlanRequestItem[]>([]);
  const [loadingPlanRequests, setLoadingPlanRequests] = useState(false);
  const [processingRequestId, setProcessingRequestId] = useState<string | null>(null);
  const [planRequestStatusFilter, setPlanRequestStatusFilter] = useState<string>("all");
  const [rejectReasonModal, setRejectReasonModal] = useState<PlanRequestItem | null>(null);
  const [rejectReasonText, setRejectReasonText] = useState("");

  // Metrics
  const [metrics, setMetrics] = useState<PlatformMetrics | null>(null);
  const [loadingMetrics, setLoadingMetrics] = useState(false);

  // Leads
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loadingLeads, setLoadingLeads] = useState(false);
  const [leadStatusFilter, setLeadStatusFilter] = useState<string>("all");
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [convertingLeadId, setConvertingLeadId] = useState<string | null>(null);

  // Restaurants
  const [restaurants, setRestaurants] = useState<any[]>([]);
  const [loadingRestaurants, setLoadingRestaurants] = useState(false);
  const [openAddModal, setOpenAddModal] = useState(false);
  const [newRestForm, setNewRestForm] = useState({
    name: "",
    slug: "",
    ownerName: "",
    ownerEmail: "",
    phone: "",
    city: "",
    numberOfTables: "12",
    plan: "growth",
    status: "active",
  });
  const [creatingRestaurant, setCreatingRestaurant] = useState(false);
  const [selectedAuthRestaurant, setSelectedAuthRestaurant] = useState<any | null>(null);
  const [newOwnerEmail, setNewOwnerEmail] = useState("");
  const [updatingOwnerEmail, setUpdatingOwnerEmail] = useState(false);
  const [updatingOwnerStatus, setUpdatingOwnerStatus] = useState(false);

  // Onboarding Activation Modal
  const [onboardingSuccess, setOnboardingSuccess] = useState<{
    restaurantId?: string;
    restaurantName: string;
    slug: string;
    ownerEmail: string;
    alreadyConverted?: boolean;
    status?: string;
  } | null>(null);
  const [resendingVerification, setResendingVerification] = useState(false);
  const [resendNotice, setResendNotice] = useState("");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  // 1-Click Onboarding Confirmation Dialog
  const [onboardLeadModal, setOnboardLeadModal] = useState<Lead | null>(null);
  const [onboardPlan, setOnboardPlan] = useState<'starter' | 'growth' | 'pro'>('growth');

  // Immediate Lead Deletion State (Admin Password Verified)
  const [leadToDelete, setLeadToDelete] = useState<Lead | null>(null);
  const [leadDeletePassword, setLeadDeletePassword] = useState("");
  const [deletingLead, setDeletingLead] = useState(false);

  // Permanent Restaurant Removal Modal & 24-Hour Safety Lock State
  const [deletionModalRestaurant, setDeletionModalRestaurant] = useState<any | null>(null);
  const [deleteConfirmName, setDeleteConfirmName] = useState("");
  const [adminReauthPassword, setAdminReauthPassword] = useState("");
  const [schedulingDeletion, setSchedulingDeletion] = useState(false);
  const [cancellingDeletion, setCancellingDeletion] = useState(false);
  const [executingDeletion, setExecutingDeletion] = useState(false);
  const [nowTimestamp, setNowTimestamp] = useState(Date.now());
  const [showAdminWelcomeBanner, setShowAdminWelcomeBanner] = useState(true);

  useEffect(() => {
    const welcomeTimer = setTimeout(() => {
      setShowAdminWelcomeBanner(false);
    }, 15000);
    return () => clearTimeout(welcomeTimer);
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      setNowTimestamp(Date.now());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const handleRefreshAll = async () => {
    setIsRefreshing(true);
    await Promise.allSettled([
      fetchMetrics(),
      fetchLeads(),
      fetchRestaurants(),
      fetchPlans(),
      fetchPlanRequests(),
      fetchRenewals(),
    ]);
    setIsRefreshing(false);
  };

  // Plans
  const [plans, setPlans] = useState<any[]>([]);
  const [editingPlans, setEditingPlans] = useState(false);
  const [savingPlans, setSavingPlans] = useState(false);

  // Support Mode
  const [supportRestaurantId, setSupportRestaurantId] = useState("");
  const [supportReason, setSupportReason] = useState("");
  const [supportActive, setSupportActive] = useState(false);

  const getAuthHeaders = async (isJson = false) => {
    const token = await getIdToken();
    const headers: Record<string, string> = {};
    if (token) headers.Authorization = `Bearer ${token}`;
    if (isJson) headers["Content-Type"] = "application/json";
    return headers;
  };

  const fetchMetrics = async () => {
    setLoadingMetrics(true);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch("/api/platform/metrics", { headers });
      if (res.ok) setMetrics(await res.json());
      else if (res.status === 401) {
        setAuthStatus("unauthenticated");
        setLocation("/login?redirect=/admin");
      } else if (res.status === 403) {
        setAuthStatus("forbidden");
      }
    } catch {}
    setLoadingMetrics(false);
  };

  const fetchLeads = async () => {
    setLoadingLeads(true);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch("/api/platform/leads", { headers });
      if (res.ok) {
        const data = await res.json();
        setLeads(data.leads || []);
      } else if (res.status === 401) {
        setAuthStatus("unauthenticated");
        setLocation("/login?redirect=/admin");
      } else if (res.status === 403) {
        setAuthStatus("forbidden");
      }
    } catch {}
    setLoadingLeads(false);
  };

  const [restaurantError, setRestaurantError] = useState<string | null>(null);

  const fetchRestaurants = async (silent = false) => {
    if (!silent) setLoadingRestaurants(true);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch("/api/platform/restaurants", { headers });
      if (res.ok) {
        const data = await res.json();
        setRestaurants(Array.isArray(data) ? data : []);
        setRestaurantError(null);
      } else if (res.status === 401) {
        setAuthStatus("unauthenticated");
        setLocation("/login?redirect=/admin");
      } else if (res.status === 403) {
        setAuthStatus("forbidden");
      } else if (res.status === 503) {
        setTimeout(() => fetchRestaurants(true), 1200);
      } else {
        const errorText = await res.text().catch(() => "");
        console.warn("Platform admin fetch restaurants:", res.status, errorText);
        setRestaurantError(`Could not load restaurants (${res.status}).`);
      }
    } catch (err: any) {
      console.warn("Platform admin network status:", err?.message);
      setTimeout(() => fetchRestaurants(true), 1500);
    } finally {
      if (!silent) setLoadingRestaurants(false);
    }
  };

  const fetchPlanRequests = async () => {
    try {
      const headers = await getAuthHeaders();
      const res = await fetch("/api/platform/plan-requests", { headers });
      if (res.ok) {
        const data = await res.json();
        setPlanRequests(data.items || []);
      }
    } catch {}
  };

  const fetchRenewals = async () => {
    setLoadingRenewals(true);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch("/api/platform/renewals", { headers });
      if (res.ok) {
        const data = await res.json();
        setRenewals(data.renewals || []);
      }
    } catch {} finally {
      setLoadingRenewals(false);
    }
  };

  const handleVerifySubscriptionPayment = async (restaurantId: string, restaurantName: string) => {
    setVerifyingPaymentId(restaurantId);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/platform/restaurants/${restaurantId}/verify-payment`, {
        method: "POST",
        headers,
      });
      const data = await res.json();
      if (res.ok) {
        toast({
          title: "Payment Verified",
          description: data.message || `Subscription extended for ${restaurantName}.`,
        });
        await fetchRenewals();
        fetchRestaurants(true);
        fetchMetrics();
      } else {
        toast({
          title: "Verification Failed",
          description: data.message || "Could not verify payment.",
          variant: "destructive",
        });
      }
    } catch (err: any) {
      toast({
        title: "Error",
        description: err.message || "Failed to verify payment.",
        variant: "destructive",
      });
    } finally {
      setVerifyingPaymentId(null);
    }
  };

  const handleApprovePlanRequest = async (item: PlanRequestItem) => {
    setProcessingRequestId(item.id);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/platform/plan-requests/${item.id}/approve`, {
        method: "POST",
        headers,
      });
      const data = await res.json();
      if (res.ok) {
        toast({
          title: "Upgrade Approved",
          description: data.message || `Upgraded ${item.restaurantName} to ${item.requestedPlan.toUpperCase()}.`,
        });
        fetchPlanRequests();
        fetchRestaurants(true);
        fetchMetrics();
      } else {
        toast({
          title: "Approval Failed",
          description: data.error || "Failed to approve upgrade.",
          variant: "destructive",
        });
      }
    } catch (err: any) {
      toast({
        title: "Error",
        description: err.message || "Failed to contact server.",
        variant: "destructive",
      });
    } finally {
      setProcessingRequestId(null);
    }
  };

  const handleRejectPlanRequest = async (item: PlanRequestItem, reason?: string) => {
    setProcessingRequestId(item.id);
    try {
      const headers = await getAuthHeaders(true);
      const res = await fetch(`/api/platform/plan-requests/${item.id}/reject`, {
        method: "POST",
        headers,
        body: JSON.stringify({ reason: reason || "Declined by platform administrator" }),
      });
      const data = await res.json();
      if (res.ok) {
        toast({
          title: "Upgrade Request Declined",
          description: data.message || `Request declined. Restaurant remains on ${item.currentPlan}.`,
        });
        fetchPlanRequests();
      } else {
        toast({
          title: "Action Failed",
          description: data.error || "Failed to decline request.",
          variant: "destructive",
        });
      }
    } catch (err: any) {
      toast({
        title: "Error",
        description: err.message || "Failed to contact server.",
        variant: "destructive",
      });
    } finally {
      setProcessingRequestId(null);
      setRejectReasonModal(null);
      setRejectReasonText("");
    }
  };

  const fetchPlans = async () => {
    try {
      const headers = await getAuthHeaders();
      const res = await fetch("/api/platform/plans", { headers });
      if (res.ok) {
        const data = await res.json();
        setPlans(data.plans || []);
      } else if (res.status === 401) {
        setAuthStatus("unauthenticated");
        setLocation("/login?redirect=/admin");
      } else if (res.status === 403) {
        setAuthStatus("forbidden");
      }
    } catch {}
  };

  useEffect(() => {
    let isMounted = true;
    let pollInterval: any = null;

    const unsubAuth = subscribeToAuthState(async (user) => {
      if (!isMounted) return;
      if (!user) {
        setAuthStatus("unauthenticated");
        setLocation("/login?redirect=/admin");
        return;
      }

      setCurrentUserEmail(user.email);

      try {
        const token = await user.getIdToken();
        if (!token) {
          if (isMounted) {
            setAuthStatus("unauthenticated");
            setLocation("/login?redirect=/admin");
          }
          return;
        }

        const sessionRes = await fetch("/api/auth/session", {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (!isMounted) return;

        if (sessionRes.ok) {
          const session = await sessionRes.json();
          if (session.authenticated && (session.user?.role === "platform_admin" || session.user?.platformAdmin || session.user?.platformRole === "superadmin")) {
            setAuthStatus("authorized");
            fetchMetrics();
            fetchLeads();
            fetchRestaurants(false);
            fetchPlans();
            fetchPlanRequests();

            if (pollInterval) clearInterval(pollInterval);
            pollInterval = setInterval(() => {
              if (!isMounted) return;
              fetchRestaurants(true);
              fetchMetrics();
              fetchLeads();
              fetchPlanRequests();
            }, 4000);
          } else {
            setUserRestaurantSlug(session?.user?.restaurantSlug || null);
            setAuthStatus("forbidden");
          }
        } else if (sessionRes.status === 403) {
          setAuthStatus("forbidden");
        } else if (sessionRes.status === 401) {
          setAuthStatus("unauthenticated");
          setLocation("/login?redirect=/admin");
        } else {
          setAuthStatus("forbidden");
        }
      } catch {
        if (isMounted) {
          setAuthStatus("unauthenticated");
        }
      }
    });

    const handleFocus = () => {
      if (authStatus === "authorized") {
        fetchRestaurants(true);
      }
    };
    window.addEventListener("focus", handleFocus);

    return () => {
      isMounted = false;
      unsubAuth();
      if (pollInterval) clearInterval(pollInterval);
      window.removeEventListener("focus", handleFocus);
    };
  }, [setLocation]);

  const handleUpdateLeadStatus = async (leadId: string, status: string, notes?: string) => {
    try {
      const headers = await getAuthHeaders(true);
      const res = await fetch(`/api/platform/leads/${leadId}`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({ status, notes }),
      });
      if (res.ok) {
        fetchLeads();
        fetchMetrics();
        if (selectedLead && selectedLead.id === leadId) {
          setSelectedLead((prev) => (prev ? { ...prev, status: status as any, notes } : null));
        }
      }
    } catch {}
  };

  const handleConvertLead = async (
    lead: Lead,
    planTier: string = 'growth'
  ) => {
    const emailCheck = validateOnboardingEmail(lead.email);
    if (!emailCheck.valid) {
      toast({
        title: "Unsupported Email Provider",
        description: emailCheck.error || STANDARD_EMAIL_ERROR,
        variant: "destructive",
      });
      return;
    }

    setConvertingLeadId(lead.id);
    setResendNotice("");
    try {
      const headers = await getAuthHeaders(true);
      const res = await fetch(`/api/platform/leads/${lead.id}/convert`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          plan: planTier,
          planTier,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        fetchLeads();
        fetchRestaurants();
        fetchMetrics();
        setOnboardingSuccess({
          restaurantId: data.restaurantId,
          restaurantName: data.restaurantName || lead.restaurantName,
          slug: data.slug,
          ownerEmail: data.ownerEmail || lead.email,
          alreadyConverted: Boolean(data.alreadyConverted),
          status: "AWAITING_VERIFICATION",
        });
      } else {
        alert(data.message || "Conversion failed");
      }
    } catch (err: any) {
      alert(err.message || "Failed to convert lead");
    } finally {
      setConvertingLeadId(null);
    }
  };

  const handleDeleteLead = async () => {
    if (!leadToDelete) return;
    if (!leadDeletePassword.trim()) {
      toast({
        title: "Password Required",
        description: "Please enter your administrator password to confirm deletion.",
        variant: "destructive",
      });
      return;
    }
    setDeletingLead(true);
    try {
      const headers = await getAuthHeaders(true);
      const res = await fetch(`/api/platform/leads/${leadToDelete.id}/delete`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ adminPassword: leadDeletePassword }),
      });
      const data = await res.json();
      if (res.ok) {
        toast({
          title: "Lead Deleted",
          description: `Lead for "${leadToDelete.restaurantName || "Lead"}" has been permanently removed.`,
        });
        setLeads((prev) => prev.filter((l) => l.id !== leadToDelete.id));
        setLeadToDelete(null);
        setLeadDeletePassword("");
        fetchMetrics();
      } else {
        toast({
          title: "Deletion Failed",
          description: data.error || data.message || "Failed to delete lead. Check administrator password.",
          variant: "destructive",
        });
      }
    } catch (err: any) {
      toast({
        title: "Error",
        description: err.message || "Could not reach platform server.",
        variant: "destructive",
      });
    } finally {
      setDeletingLead(false);
    }
  };

  const handleCreateRestaurant = async (e: React.FormEvent) => {
    e.preventDefault();
    const emailCheck = validateOnboardingEmail(newRestForm.ownerEmail);
    if (!emailCheck.valid) {
      toast({
        title: "Unsupported Email Provider",
        description: emailCheck.error || STANDARD_EMAIL_ERROR,
        variant: "destructive",
      });
      return;
    }

    setCreatingRestaurant(true);
    setResendNotice("");
    try {
      const headers = await getAuthHeaders(true);
      const res = await fetch("/api/platform/restaurants", {
        method: "POST",
        headers,
        body: JSON.stringify({
          ...newRestForm,
          ownerEmail: emailCheck.normalizedEmail,
          numberOfTables: Number(newRestForm.numberOfTables),
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setOpenAddModal(false);
        if (data && data.id) {
          setRestaurants((prev) => [data, ...prev.filter((r) => r.id !== data.id)]);
          setRestaurantError(null);
        }
        fetchRestaurants(true);
        fetchMetrics();
        setOnboardingSuccess({
          restaurantId: data.id,
          restaurantName: data.name || newRestForm.name,
          slug: data.slug || newRestForm.slug,
          ownerEmail: data.ownerEmail || newRestForm.ownerEmail,
          status: "AWAITING_VERIFICATION",
        });
        setNewRestForm({
          name: "",
          slug: "",
          ownerName: "",
          ownerEmail: "",
          phone: "",
          city: "",
          numberOfTables: "12",
          plan: "growth",
          status: "active",
        });
      } else {
        alert(data.message || "Failed to create restaurant");
      }
    } catch (err: any) {
      alert(err.message || "Error creating restaurant");
    } finally {
      setCreatingRestaurant(false);
    }
  };

  const handleUpdateOwnerEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAuthRestaurant || !newOwnerEmail.trim()) return;
    const emailCheck = validateOnboardingEmail(newOwnerEmail.trim());
    if (!emailCheck.valid) {
      toast({
        title: "Unsupported Email Provider",
        description: emailCheck.error || STANDARD_EMAIL_ERROR,
        variant: "destructive",
      });
      return;
    }

    setUpdatingOwnerEmail(true);
    try {
      const headers = await getAuthHeaders(true);
      const res = await fetch(`/api/platform/restaurants/${selectedAuthRestaurant.id}/owner-email`, {
        method: "POST",
        headers,
        body: JSON.stringify({ newEmail: emailCheck.normalizedEmail }),
      });
      const data = await res.json();
      if (res.ok) {
        alert(data.message || "Owner email successfully updated in Firebase Authentication.");
        fetchRestaurants();
        setSelectedAuthRestaurant((prev: any) =>
          prev ? { ...prev, ownerEmail: emailCheck.normalizedEmail } : null
        );
        setNewOwnerEmail("");
      } else {
        alert(data.message || "Failed to update owner email");
      }
    } catch (err: any) {
      alert(err.message || "Network error updating owner email");
    } finally {
      setUpdatingOwnerEmail(false);
    }
  };

  const handleToggleOwnerStatus = async (restaurant: any) => {
    const isCurrentlyDeactivated =
      restaurant.accountStatus === "DEACTIVATED" ||
      restaurant.status === "inactive";
    const nextActive = isCurrentlyDeactivated;
    const nextStatus = nextActive ? "active" : "inactive";
    const nextAccountStatus = nextActive ? "ACTIVE" : "DEACTIVATED";

    setUpdatingOwnerStatus(true);
    try {
      const headers = await getAuthHeaders(true);
      const res = await fetch(`/api/platform/restaurants/${restaurant.id}/owner-status`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({
          active: nextActive,
          status: nextStatus,
          accountStatus: nextAccountStatus,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        toast({
          title: nextActive ? "Account Reactivated" : "Account Deactivated",
          description: `${restaurant.name} operator access has been ${nextActive ? "restored" : "deactivated and blocked in Firebase"}.`,
        });
        fetchRestaurants();
        if (selectedAuthRestaurant?.id === restaurant.id) {
          setSelectedAuthRestaurant({
            ...selectedAuthRestaurant,
            status: data.status ?? nextStatus,
            accountStatus: data.accountStatus ?? nextAccountStatus,
          });
        }
      } else {
        toast({
          variant: "destructive",
          title: "Failed to update account status",
          description: data.message || "Please check connection and credentials.",
        });
      }
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Network error",
        description: err.message || "Failed to reach the platform server.",
      });
    } finally {
      setUpdatingOwnerStatus(false);
    }
  };

  const handleUpdateRestaurantPlan = async (restaurantId: string, newPlan: string) => {
    try {
      const headers = await getAuthHeaders(true);
      const res = await fetch(`/api/platform/restaurants/${restaurantId}`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({ plan: newPlan }),
      });
      if (res.ok) {
        setRestaurants((prev) =>
          prev.map((r) => (r.id === restaurantId ? { ...r, plan: newPlan } : r))
        );
      } else {
        const data = await res.json();
        alert(data.message || "Could not update restaurant plan");
      }
    } catch {
      alert("Network error updating plan");
    }
  };

  const formatDeletionCountdown = (scheduledFor?: number) => {
    if (!scheduledFor) return "24h 00m 00s";
    const diff = scheduledFor - nowTimestamp;
    if (diff <= 0) return "Safety window expired · Ready to execute";
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((diff % (1000 * 60)) / 1000);
    return `${hours}h ${String(minutes).padStart(2, "0")}m ${String(seconds).padStart(2, "0")}s remaining`;
  };

  const handleScheduleDeletion = async (restaurant: any) => {
    if (!restaurant) return;
    if (deleteConfirmName.trim().toLowerCase() !== restaurant.name.trim().toLowerCase()) {
      toast({
        title: "Name Confirmation Mismatch",
        description: `Please enter "${restaurant.name}" exactly to confirm deletion schedule.`,
        variant: "destructive",
      });
      return;
    }
    if (!adminReauthPassword || adminReauthPassword.length < 6) {
      toast({
        title: "Platform Admin Password Required",
        description: "Please enter your administrator password to re-authenticate this sensitive action.",
        variant: "destructive",
      });
      return;
    }

    setSchedulingDeletion(true);
    try {
      const headers = await getAuthHeaders(true);
      const res = await fetch(`/api/platform/restaurants/${restaurant.id}/schedule-deletion`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          confirmName: deleteConfirmName.trim(),
          adminPassword: adminReauthPassword,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        toast({
          title: "Deletion Scheduled & Locked",
          description: data.message || "Restaurant immediately locked. Permanent deletion scheduled in 24 hours.",
        });
        setAdminReauthPassword("");
        setDeleteConfirmName("");
        fetchRestaurants(true);
        setDeletionModalRestaurant((prev: any) =>
          prev ? {
            ...prev,
            status: "DELETION_PENDING",
            deletionScheduledFor: data.deletionScheduledFor,
            deletionRequestedAt: data.deletionRequestedAt,
            deletionRequestedBy: data.deletionRequestedBy,
          } : null
        );
      } else {
        toast({
          title: "Scheduling Failed",
          description: data.error || data.message || "Re-authentication or validation failed.",
          variant: "destructive",
        });
      }
    } catch (err: any) {
      toast({
        title: "Network Error",
        description: err.message || "Could not reach platform server.",
        variant: "destructive",
      });
    } finally {
      setSchedulingDeletion(false);
    }
  };

  const handleCancelDeletion = async (restaurant: any) => {
    if (!restaurant) return;
    setCancellingDeletion(true);
    try {
      const headers = await getAuthHeaders(true);
      const res = await fetch(`/api/platform/restaurants/${restaurant.id}/cancel-deletion`, {
        method: "POST",
        headers,
      });
      const data = await res.json();
      if (res.ok) {
        toast({
          title: "Deletion Cancelled",
          description: data.message || "Restaurant deletion schedule cancelled and status restored.",
        });
        fetchRestaurants(true);
        setDeletionModalRestaurant(null);
        setDeleteConfirmName("");
        setAdminReauthPassword("");
      } else {
        toast({
          title: "Cancellation Failed",
          description: data.error || "Could not cancel deletion schedule.",
          variant: "destructive",
        });
      }
    } catch (err: any) {
      toast({
        title: "Network Error",
        description: err.message || "Could not reach platform server.",
        variant: "destructive",
      });
    } finally {
      setCancellingDeletion(false);
    }
  };

  const handleExecuteDeletion = async (restaurant: any) => {
    if (!restaurant) return;
    setExecutingDeletion(true);
    try {
      const headers = await getAuthHeaders(true);
      const res = await fetch(`/api/platform/restaurants/${restaurant.id}/execute-deletion`, {
        method: "POST",
        headers,
      });
      const data = await res.json();
      if (res.ok) {
        toast({
          title: "Restaurant Permanently Removed",
          description: data.message || "Restaurant and all associated accounts were permanently deleted.",
        });
        fetchRestaurants(true);
        fetchMetrics();
        setDeletionModalRestaurant(null);
        setDeleteConfirmName("");
        setAdminReauthPassword("");
      } else {
        toast({
          title: "Deletion Blocked",
          description: data.error || "Safety period has not expired yet.",
          variant: "destructive",
        });
      }
    } catch (err: any) {
      toast({
        title: "Network Error",
        description: err.message || "Could not reach platform server.",
        variant: "destructive",
      });
    } finally {
      setExecutingDeletion(false);
    }
  };

  const handleSavePlans = async () => {
    setSavingPlans(true);
    try {
      const headers = await getAuthHeaders(true);
      const res = await fetch("/api/platform/plans", {
        method: "PUT",
        headers,
        body: JSON.stringify({ plans }),
      });
      if (res.ok) {
        setEditingPlans(false);
        fetchPlans();
        alert("Plans updated successfully!");
      }
    } catch {}
    setSavingPlans(false);
  };

  const handleStartSupportMode = async () => {
    if (!supportRestaurantId) {
      alert("Select a restaurant to enter support mode");
      return;
    }
    try {
      const headers = await getAuthHeaders(true);
      const res = await fetch("/api/platform/support-mode", {
        method: "POST",
        headers,
        body: JSON.stringify({
          restaurantId: supportRestaurantId,
          reason: supportReason || "Operator floor inspection",
        }),
      });
      const data = await res.json();
      if (res.ok) {
        sessionStorage.setItem(
          "tableline_support_session",
          JSON.stringify({
            active: true,
            restaurantId: data.restaurantId,
            restaurantName: data.restaurantName,
            slug: data.slug,
            startedAt: Date.now(),
          })
        );
        setLocation(`/${data.slug}/admin`);
      } else {
        alert(data.message || "Could not activate support mode");
      }
    } catch (err: any) {
      alert(err.message || "Error activating support mode");
    }
  };

  const filteredLeads = leads.filter((l) => {
    if (leadStatusFilter === "all") return true;
    return l.status === leadStatusFilter;
  });

  if (authStatus === "checking") {
    return (
      <PlatformAdminLoader message="Checking Platform Administrator credentials with Firebase…" />
    );
  }

  if (authStatus === "unauthenticated") {
    return (
      <div id="admin-auth-unauthenticated" className="grid min-h-[100dvh] place-items-center bg-[#181614] p-6 text-[#EBE5DF]">
        <div className="flex flex-col items-center gap-4 text-center max-w-sm">
          <div className="h-10 w-10 rounded-xl bg-[#24211E] border border-[#3A3530] flex items-center justify-center">
            <Lock className="h-5 w-5 text-[#9E948A]" />
          </div>
          <div className="space-y-1">
            <h1 className="text-base font-semibold tracking-tight text-[#F7F4F0]">Authentication Required</h1>
            <p className="text-xs text-[#9E948A]">Redirecting to Platform Administrator Sign In…</p>
          </div>
          <Button
            id="admin-redirect-login-btn"
            onClick={() => setLocation("/login?redirect=/admin")}
            className="h-9 px-4 bg-[#C97A52] hover:bg-[#b56942] text-white text-xs font-medium"
          >
            Go to Login
          </Button>
        </div>
      </div>
    );
  }

  if (authStatus === "forbidden") {
    return (
      <div id="admin-access-denied" className="grid min-h-[100dvh] place-items-center bg-[#181614] p-6 text-[#EBE5DF]">
        <div className="w-full max-w-md rounded-2xl bg-[#1F1C19] border border-[#3A3530] p-8 shadow-2xl text-center space-y-6">
          <div className="mx-auto h-14 w-14 rounded-2xl bg-[#381E16] border border-[#5C2B1D] flex items-center justify-center">
            <ShieldAlert className="h-7 w-7 text-[#E06746]" />
          </div>
          <div className="space-y-2">
            <div className="inline-flex items-center gap-1.5 rounded-full bg-[#2C1814] px-3 py-1 text-[11px] font-mono font-medium text-[#E06746] border border-[#5C2B1D]">
              403 FORBIDDEN
            </div>
            <h1 className="text-xl font-bold tracking-tight text-[#F7F4F0]">
              Platform Access Restricted
            </h1>
            <p className="text-xs text-[#9E948A] leading-relaxed">
              You are signed in as <span className="font-mono text-[#EBE5DF]">{currentUserEmail || "authenticated user"}</span>, but this account does not possess Tableline Platform Administrator privileges.
            </p>
          </div>

          <div className="pt-2 flex flex-col gap-2">
            {userRestaurantSlug ? (
              <Button
                id="admin-forbidden-restaurant-dash-btn"
                onClick={() => setLocation(`/dashboard/${userRestaurantSlug}/orders`)}
                className="h-10 w-full bg-[#C97A52] hover:bg-[#b56942] text-white text-xs font-medium"
              >
                Go to Restaurant Dashboard
              </Button>
            ) : null}
            <Button
              id="admin-forbidden-signout-btn"
              variant="outline"
              onClick={async () => {
                await signOutCurrentUser();
                setLocation("/login?redirect=/admin");
              }}
              className="h-10 w-full border-[#3A3530] bg-[#24211E] text-[#EBE5DF] hover:bg-[#2E2A25] text-xs font-medium"
            >
              Sign Out & Switch Account
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const navItems = [
    { id: "overview", label: "Overview & Metrics", icon: LayoutDashboard },
    {
      id: "restaurants",
      label: "Restaurants & Tenancy",
      icon: Building,
      badge: restaurants.length,
    },
    {
      id: "plan_requests",
      label: "Plan Requests",
      icon: Sparkles,
      badge: planRequests.filter((r) => r.status === "PENDING").length,
      pulse: planRequests.filter((r) => r.status === "PENDING").length > 0,
    },
    {
      id: "renewals",
      label: "Subscription Renewals",
      icon: CreditCard,
      badge: renewals.filter((r) => r.hasPendingPayment).length,
      pulse: renewals.filter((r) => r.hasPendingPayment).length > 0,
    },
    {
      id: "leads",
      label: "Inbound Leads",
      icon: Users,
      badge: leads.filter((l) => l.status === "new").length,
    },
    { id: "plans", label: "Pricing & Plans", icon: DollarSign },
    { id: "support", label: "Controlled Support", icon: ShieldAlert },
  ];

  const renderAdminSidebar = () => (
    <div className="flex h-full flex-col justify-between p-5">
      <div className="space-y-6">
        {/* Brand Header */}
        <div className="px-2">
          <Link href="/admin" className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 font-bold shadow-xs">
              <ShieldCheck className="h-5 w-5 text-amber-500 dark:text-amber-600" />
            </div>
            <div>
              <div className="font-serif text-lg font-bold tracking-tight text-foreground leading-none">
                Tableline Admin
              </div>
              <p className="text-[10px] text-muted-foreground mt-0.5 font-medium">
                Platform Operations
              </p>
            </div>
          </Link>
        </div>

        {/* Navigation Section */}
        <nav className="space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setActiveTab(item.id as any);
                  setMobileSidebarOpen(false);
                }}
                className={`w-full flex items-center justify-between rounded-xl px-3 py-2.5 text-xs font-semibold transition-all ${
                  active
                    ? "bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 shadow-xs"
                    : "text-muted-foreground hover:bg-stone-100 dark:hover:bg-stone-800 hover:text-foreground"
                }`}
                data-testid={`tab-platform-${item.id}`}
              >
                <div className="flex items-center gap-2.5">
                  <Icon className="h-4 w-4 shrink-0" />
                  <span>{item.label}</span>
                </div>
                {item.badge !== undefined && item.badge > 0 && (
                  <span
                    className={`inline-flex items-center justify-center rounded-full px-1.5 py-0.2 text-[10px] font-bold ${
                      item.pulse
                        ? "bg-amber-500 text-stone-950 animate-pulse ring-1 ring-amber-300"
                        : active
                        ? "bg-white/20 text-white dark:bg-stone-900/20 dark:text-stone-900"
                        : "bg-stone-200 dark:bg-stone-800 text-foreground"
                    }`}
                  >
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Admin Profile Capsule */}
      <div className="pt-4 border-t border-border space-y-3">
        <div className="rounded-xl border border-border bg-stone-50 dark:bg-stone-900/60 p-3 text-xs">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <span className="font-bold text-foreground">Super Administrator</span>
          </div>
          <p className="font-mono text-[10px] text-muted-foreground truncate mt-1">
            {currentUserEmail || "admin@tableline.com"}
          </p>
        </div>

        <button
          type="button"
          onClick={async () => {
            await signOutCurrentUser();
            try {
              await logout.mutateAsync();
            } catch {}
            setLocation("/login");
          }}
          className="w-full flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-medium text-muted-foreground hover:text-red-600 transition-colors"
        >
          <LogOut className="h-4 w-4" />
          <span>Sign Out</span>
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-stone-50/50 dark:bg-stone-950 text-foreground">
      {/* Mobile Drawer Backdrop */}
      {mobileSidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 backdrop-blur-xs lg:hidden animate-in fade-in"
          onClick={() => setMobileSidebarOpen(false)}
        />
      )}

      {/* Mobile Sidebar Drawer */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-72 border-r border-border bg-card shadow-xl transition-transform duration-200 lg:hidden ${
          mobileSidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {renderAdminSidebar()}
      </aside>

      <div className="flex min-h-screen">
        {/* Desktop Left Sidebar (Reference 2) */}
        <aside className="hidden lg:flex w-64 shrink-0 flex-col border-r border-border bg-card">
          {renderAdminSidebar()}
        </aside>

        {/* Right Main Column */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Topbar */}
          <header className="sticky top-0 z-30 border-b border-border bg-card/90 backdrop-blur-md px-6 py-3.5">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setMobileSidebarOpen(true)}
                  className="lg:hidden rounded-xl border border-border p-2 text-muted-foreground"
                >
                  <Menu className="h-4 w-4" />
                </button>
                <div>
                  <h1 className="font-serif text-base font-bold text-foreground leading-none">
                    Platform Operations
                  </h1>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    Multi-Tenant Control Plane &amp; Provisioning
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  onClick={() => {
                    setActiveTab("restaurants");
                    setOpenAddModal(true);
                  }}
                  className="gap-1.5 rounded-xl bg-stone-900 hover:bg-stone-800 text-white dark:bg-stone-100 dark:text-stone-900 text-xs font-semibold shadow-xs"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Onboard Restaurant</span>
                </Button>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleRefreshAll}
                  disabled={isRefreshing}
                  className="gap-1.5 text-xs rounded-xl border-border"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? "animate-spin" : ""}`} />
                  <span className="hidden sm:inline">Refresh</span>
                </Button>
              </div>
            </div>
          </header>

          {/* Main Command Workspace */}
          <main className="flex-1 p-6 lg:p-8 max-w-7xl mx-auto w-full">
            {/* 1. OVERVIEW TAB (Reference 2) */}
            {activeTab === "overview" && (
              <div className="space-y-8 animate-in fade-in duration-200">
                {/* Hero Banner (Reference 2 - shows for 15s after login, then auto-hides) */}
                {showAdminWelcomeBanner && (
                  <div className="rounded-2xl border border-border bg-card p-6 shadow-2xs transition-all duration-500 animate-in fade-in slide-in-from-top-2">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <div>
                        <div className="flex items-center gap-2 text-xs font-bold text-amber-600 dark:text-amber-400">
                          <ShieldCheck className="h-4 w-4" />
                          <span>SUPER ADMIN CONTROL PLANE</span>
                        </div>
                        <h2 className="font-serif text-2xl sm:text-3xl font-bold tracking-tight text-foreground mt-1">
                          Welcome back, Super Admin! 🛡️
                        </h2>
                        <p className="text-xs sm:text-sm text-muted-foreground mt-1 max-w-xl">
                          Multi-tenant control plane, restaurant provisioning &amp; platform health.
                        </p>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <Button
                          size="sm"
                          onClick={() => {
                            setActiveTab("restaurants");
                            setOpenAddModal(true);
                          }}
                          className="rounded-xl bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-900 text-xs font-semibold px-4 h-9 shadow-2xs gap-1.5"
                        >
                          <Plus className="h-4 w-4" />
                          Onboard Restaurant
                        </Button>
                      </div>
                    </div>
                  </div>
                )}

                {/* 4 Metric Cards (Reference 2) */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4" id="platform-metrics-grid">
                  {/* Total Restaurants */}
                  <div className="rounded-2xl border border-border bg-card p-5 shadow-2xs">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-muted-foreground">
                        Total Restaurants
                      </span>
                      <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-400">
                        <Building className="h-4 w-4" />
                      </div>
                    </div>
                    <p className="mt-3 font-serif text-3xl font-extrabold text-foreground">
                      {metrics?.totalRestaurants ?? restaurants.length}
                    </p>
                    <p className="text-[11px] text-muted-foreground mt-1">
                      {metrics?.activeRestaurants ?? restaurants.filter((r) => r.status === "active").length} active live tenants
                    </p>
                  </div>

                  {/* Active Subscriptions */}
                  <div className="rounded-2xl border border-border bg-card p-5 shadow-2xs">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-muted-foreground">
                        Active Subscriptions
                      </span>
                      <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400">
                        <CheckCircle2 className="h-4 w-4" />
                      </div>
                    </div>
                    <p className="mt-3 font-serif text-3xl font-extrabold text-foreground">
                      {metrics?.activeRestaurants ?? restaurants.filter((r) => r.status === "active").length}
                    </p>
                    <p className="text-[11px] text-muted-foreground mt-1">
                      {renewals.filter((r) => r.subscription?.status === "ACTIVE").length || 1} active paid subscriptions
                    </p>
                  </div>

                  {/* Total Platform Revenue / MRR */}
                  <div className="rounded-2xl border border-border bg-card p-5 shadow-2xs">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-muted-foreground">
                        Total Platform Revenue
                      </span>
                      <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-purple-50 text-purple-700 dark:bg-purple-950/50 dark:text-purple-400">
                        <TrendingUp className="h-4 w-4" />
                      </div>
                    </div>
                    <p className="mt-3 font-serif text-3xl font-extrabold text-foreground">
                      {formatCurrency(metrics?.estimatedMRR ?? 1299)}
                      <span className="text-xs font-normal text-muted-foreground">/mo</span>
                    </p>
                    <p className="text-[11px] text-muted-foreground mt-1">
                      Estimated recurring MRR
                    </p>
                  </div>

                  {/* Pending Plan Requests */}
                  <div className="rounded-2xl border border-border bg-card p-5 shadow-2xs">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-muted-foreground">
                        Pending Plan Requests
                      </span>
                      <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-400">
                        <Sparkles className="h-4 w-4" />
                      </div>
                    </div>
                    <p className="mt-3 font-serif text-3xl font-extrabold text-foreground">
                      {planRequests.filter((r) => r.status === "PENDING").length}
                    </p>
                    <p className="text-[11px] text-muted-foreground mt-1">
                      {planRequests.filter((r) => r.status === "PENDING").length > 0 ? "Requires review" : "All requests processed"}
                    </p>
                  </div>
                </div>

                {/* Lower Grid: Managed Restaurants & Operations (Reference 2) */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  {/* LEFT: MANAGED RESTAURANTS LIST (2 Columns on large screen) */}
                  <div className="lg:col-span-2 rounded-2xl border border-border bg-card p-6 shadow-2xs space-y-4">
                    <div className="flex items-center justify-between border-b border-border pb-3">
                      <div>
                        <h3 className="font-serif text-base font-bold text-foreground">
                          Managed Restaurants ({restaurants.length})
                        </h3>
                        <p className="text-xs text-muted-foreground">
                          Active restaurant tenants on the Tableline platform
                        </p>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setActiveTab("restaurants")}
                        className="text-xs font-semibold gap-1"
                      >
                        View All Tenancies →
                      </Button>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full text-xs text-left">
                        <thead>
                          <tr className="border-b border-border text-[11px] font-semibold text-muted-foreground">
                            <th className="pb-2.5">Restaurant</th>
                            <th className="pb-2.5">Owner</th>
                            <th className="pb-2.5">Plan</th>
                            <th className="pb-2.5">Status</th>
                            <th className="pb-2.5 text-right">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border/60">
                          {restaurants.slice(0, 6).map((r) => (
                            <tr key={r.id} className="hover:bg-muted/40 transition-colors">
                              <td className="py-3 pr-2">
                                <div className="font-bold text-foreground">{r.name}</div>
                                <div className="font-mono text-[10px] text-muted-foreground">/{r.slug}</div>
                              </td>
                              <td className="py-3 pr-2">
                                <div className="text-foreground">{r.ownerName || "—"}</div>
                                <div className="text-[10px] text-muted-foreground truncate max-w-[120px]">{r.ownerEmail || "—"}</div>
                              </td>
                              <td className="py-3 pr-2">
                                <span className="inline-flex items-center rounded-full bg-stone-100 dark:bg-stone-800 px-2 py-0.5 text-[10px] font-bold uppercase text-foreground border border-border">
                                  {r.plan || "growth"}
                                </span>
                              </td>
                              <td className="py-3 pr-2">
                                <span
                                  className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                                    r.status === "active"
                                      ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300"
                                      : "bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-400"
                                  }`}
                                >
                                  <span className={`h-1.5 w-1.5 rounded-full ${r.status === "active" ? "bg-emerald-500" : "bg-stone-400"}`} />
                                  {r.status === "active" ? "Active" : "Inactive"}
                                </span>
                              </td>
                              <td className="py-3 text-right">
                                <div className="flex items-center justify-end gap-1.5">
                                  <Link
                                    href={`/${r.slug}/admin`}
                                    target="_blank"
                                    className="inline-flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-[11px] font-semibold text-foreground hover:bg-muted transition-colors"
                                    title="Open Owner Dashboard"
                                  >
                                    <span>Admin</span>
                                    <ExternalLink className="h-3 w-3 text-muted-foreground" />
                                  </Link>
                                  <Link
                                    href={`/menu/${r.slug}/table/1`}
                                    target="_blank"
                                    className="inline-flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-[11px] font-semibold text-muted-foreground hover:bg-muted transition-colors"
                                    title="Open Diner Menu"
                                  >
                                    <span>Menu</span>
                                    <ExternalLink className="h-3 w-3" />
                                  </Link>
                                </div>
                              </td>
                            </tr>
                          ))}
                          {restaurants.length === 0 && (
                            <tr>
                              <td colSpan={5} className="py-8 text-center text-xs text-muted-foreground">
                                No restaurants onboarded yet. Click "Onboard Restaurant" above.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* RIGHT: PENDING OPERATIONS WIDGETS */}
                  <div className="space-y-6">
                    {/* Plan Requests Widget */}
                    <div className="rounded-2xl border border-border bg-card p-5 shadow-2xs space-y-3">
                      <div className="flex items-center justify-between border-b border-border pb-2.5">
                        <div className="flex items-center gap-2">
                          <Sparkles className="h-4 w-4 text-amber-500" />
                          <h4 className="font-serif text-sm font-bold text-foreground">
                            Plan Requests
                          </h4>
                        </div>
                        <span className="text-[11px] font-bold text-amber-600 dark:text-amber-400">
                          {planRequests.filter((r) => r.status === "PENDING").length} Pending
                        </span>
                      </div>

                      {planRequests.filter((r) => r.status === "PENDING").length === 0 ? (
                        <p className="py-6 text-center text-xs text-muted-foreground">
                          All tier upgrade requests are up to date.
                        </p>
                      ) : (
                        <div className="space-y-2.5">
                          {planRequests
                            .filter((r) => r.status === "PENDING")
                            .slice(0, 3)
                            .map((req) => (
                              <div
                                key={req.id}
                                className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 text-xs space-y-2"
                              >
                                <div className="flex justify-between">
                                  <span className="font-bold text-foreground">{req.restaurantName}</span>
                                  <span className="font-bold text-amber-600">{req.requestedPlan.toUpperCase()}</span>
                                </div>
                                <div className="flex gap-2 pt-1">
                                  <Button
                                    size="sm"
                                    onClick={() => handleApprovePlanRequest(req)}
                                    className="h-7 text-[10px] font-bold bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg flex-1"
                                  >
                                    Approve
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => {
                                      setRejectReasonModal(req);
                                      setRejectReasonText("");
                                    }}
                                    className="h-7 text-[10px] font-bold rounded-lg"
                                  >
                                    Decline
                                  </Button>
                                </div>
                              </div>
                            ))}
                        </div>
                      )}
                    </div>

                    {/* Pending Renewals Widget */}
                    <div className="rounded-2xl border border-border bg-card p-5 shadow-2xs space-y-3">
                      <div className="flex items-center justify-between border-b border-border pb-2.5">
                        <div className="flex items-center gap-2">
                          <CreditCard className="h-4 w-4 text-blue-500" />
                          <h4 className="font-serif text-sm font-bold text-foreground">
                            Subscription Payments
                          </h4>
                        </div>
                        <span className="text-[11px] font-bold text-blue-600 dark:text-blue-400">
                          {renewals.filter((r) => r.hasPendingPayment).length} To Verify
                        </span>
                      </div>

                      {renewals.filter((r) => r.hasPendingPayment).length === 0 ? (
                        <p className="py-6 text-center text-xs text-muted-foreground">
                          No pending renewal payment references.
                        </p>
                      ) : (
                        <div className="space-y-2.5">
                          {renewals
                            .filter((r) => r.hasPendingPayment)
                            .slice(0, 3)
                            .map((ren) => (
                              <div
                                key={ren.restaurantId}
                                className="rounded-xl border border-blue-500/30 bg-blue-500/5 p-3 text-xs space-y-2"
                              >
                                <div className="flex justify-between">
                                  <span className="font-bold text-foreground">{ren.restaurantName}</span>
                                  <span className="font-mono text-blue-600 font-bold">{ren.pendingSubmission?.paymentMethod}</span>
                                </div>
                                <p className="text-[10px] text-muted-foreground font-mono">
                                  Ref: {ren.pendingSubmission?.transactionReference}
                                </p>
                                <Button
                                  size="sm"
                                  onClick={() => handleVerifySubscriptionPayment(ren.restaurantId, ren.restaurantName || "Restaurant")}
                                  className="w-full h-7 text-[10px] font-bold bg-blue-600 hover:bg-blue-700 text-white rounded-lg"
                                >
                                  Verify &amp; Extend (+30 Days)
                                </Button>
                              </div>
                            ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}

        {/* SUBSCRIPTION RENEWALS TAB */}
        {activeTab === "renewals" && (
          <div className="space-y-6 animate-in fade-in duration-200" id="tab-renewals-container">
            {/* Header and Actions */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h3 className="font-display text-xl font-bold text-foreground">
                  Manual Subscription Renewals & Payments
                </h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  Review submitted UPI, bank transfer, and cash renewal references. Verify payments to grant 30-day subscription extensions.
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={fetchRenewals}
                disabled={loadingRenewals}
                className="gap-2 rounded-xl text-xs h-9 self-start sm:self-auto"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${loadingRenewals ? "animate-spin" : ""}`} />
                Refresh Renewals
              </Button>
            </div>

            {/* Quick Metrics Bar */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-2xl border border-border bg-card p-4">
                <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                  Total Restaurants Tracked
                </span>
                <p className="mt-1 text-2xl font-bold text-foreground">
                  {renewals.length}
                </p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  {renewals.filter((r) => r.subscription?.status === "ACTIVE").length} active subscriptions
                </p>
              </div>

              <div className="rounded-2xl border border-blue-500/30 bg-blue-500/5 p-4">
                <span className="text-[11px] font-semibold text-blue-700 dark:text-blue-300 uppercase tracking-wider">
                  Pending Verifications
                </span>
                <p className="mt-1 text-2xl font-bold text-blue-700 dark:text-blue-300">
                  {renewals.filter((r) => r.hasPendingPayment).length}
                </p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  Awaiting bank/UPI verification
                </p>
              </div>

              <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4">
                <span className="text-[11px] font-semibold text-amber-800 dark:text-amber-300 uppercase tracking-wider">
                  In 7-Day Grace Period
                </span>
                <p className="mt-1 text-2xl font-bold text-amber-800 dark:text-amber-300">
                  {renewals.filter((r) => r.subscription?.status === "GRACE_PERIOD").length}
                </p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  Operations active; renewal pending
                </p>
              </div>

              <div className="rounded-2xl border border-red-500/30 bg-red-500/5 p-4">
                <span className="text-[11px] font-semibold text-red-700 dark:text-red-400 uppercase tracking-wider">
                  Past Due (Ordering Paused)
                </span>
                <p className="mt-1 text-2xl font-bold text-red-700 dark:text-red-400">
                  {renewals.filter((r) => r.subscription?.status === "PAST_DUE").length}
                </p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  Customer table ordering paused
                </p>
              </div>
            </div>

            {/* Filter Tabs */}
            <div className="flex flex-wrap items-center gap-2">
              {[
                { id: "all", label: `All (${renewals.length})` },
                { id: "pending_verification", label: `Pending Verification (${renewals.filter((r) => r.hasPendingPayment).length})` },
                { id: "grace_period", label: `Grace Period (${renewals.filter((r) => r.subscription?.status === "GRACE_PERIOD").length})` },
                { id: "past_due", label: `Past Due (${renewals.filter((r) => r.subscription?.status === "PAST_DUE").length})` },
              ].map((filter) => (
                <button
                  key={filter.id}
                  onClick={() => setRenewalFilter(filter.id as any)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                    renewalFilter === filter.id
                      ? "bg-primary text-primary-foreground"
                      : "bg-card border border-border text-muted-foreground hover:bg-muted"
                  }`}
                >
                  {filter.label}
                </button>
              ))}
            </div>

            {/* Renewals List */}
            {(() => {
              const filtered = renewals.filter((item) => {
                if (renewalFilter === "pending_verification") return item.hasPendingPayment;
                if (renewalFilter === "grace_period") return item.subscription?.status === "GRACE_PERIOD";
                if (renewalFilter === "past_due") return item.subscription?.status === "PAST_DUE";
                return true;
              });

              if (filtered.length === 0) {
                return (
                  <div className="rounded-2xl border border-dashed border-border bg-card p-12 text-center">
                    <CheckCircle2 className="mx-auto h-8 w-8 text-muted-foreground/60" />
                    <h4 className="mt-3 text-sm font-semibold text-foreground">No Renewals Found</h4>
                    <p className="mt-1 text-xs text-muted-foreground">
                      There are currently no restaurant subscriptions matching this filter.
                    </p>
                  </div>
                );
              }

              return (
                <div className="space-y-4">
                  {filtered.map((item) => {
                    const sub = item.subscription;
                    const pending = item.pendingSubmission;
                    const isVerifying = verifyingPaymentId === item.restaurantId;

                    return (
                      <div
                        key={item.restaurantId}
                        className={`rounded-2xl border bg-card p-5 shadow-2xs transition-all ${
                          item.hasPendingPayment
                            ? "border-blue-500/40 ring-1 ring-blue-500/20"
                            : sub?.status === "PAST_DUE"
                            ? "border-red-500/40"
                            : sub?.status === "GRACE_PERIOD"
                            ? "border-amber-500/40"
                            : "border-border"
                        }`}
                      >
                        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                          {/* Left: Restaurant & Plan Info */}
                          <div className="space-y-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <h4 className="font-display text-base font-bold text-foreground">
                                {item.name}
                              </h4>
                              <span className="rounded-md bg-secondary px-2 py-0.5 text-[11px] font-mono font-medium text-foreground">
                                /{item.slug}
                              </span>
                              <span className="rounded-full bg-primary/10 text-primary px-2.5 py-0.5 text-[11px] font-semibold uppercase">
                                {item.planName || item.plan} • ₹{(item.monthlyFee || 0).toLocaleString("en-IN")}/mo
                              </span>
                              <span
                                className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider ${
                                  sub?.status === "ACTIVE"
                                    ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                                    : sub?.status === "GRACE_PERIOD"
                                    ? "bg-amber-500/20 text-amber-800 dark:text-amber-300"
                                    : "bg-red-500/20 text-red-700 dark:text-red-400 font-extrabold"
                                }`}
                              >
                                {sub?.status === "ACTIVE"
                                  ? "Active"
                                  : sub?.status === "GRACE_PERIOD"
                                  ? "Grace Period"
                                  : "Past Due"}
                              </span>
                            </div>
                            <p className="text-xs text-muted-foreground">
                              Owner: <span className="font-medium text-foreground">{item.ownerEmail || "—"}</span>
                              {item.phone && <span> • 📱 {item.phone}</span>}
                              {item.city && <span> • 📍 {item.city}</span>}
                            </p>
                          </div>

                          {/* Middle: Cycle Dates */}
                          <div className="grid grid-cols-2 gap-4 rounded-xl border border-border/60 bg-background/50 p-3 text-xs">
                            <div>
                              <span className="text-[10px] text-muted-foreground font-medium block">
                                Period End
                              </span>
                              <span className="font-mono font-semibold text-foreground">
                                {sub?.currentPeriodEnd
                                  ? new Date(sub.currentPeriodEnd).toLocaleDateString("en-IN")
                                  : "—"}
                              </span>
                            </div>
                            <div>
                              <span className="text-[10px] text-muted-foreground font-medium block">
                                Grace End
                              </span>
                              <span className="font-mono font-semibold text-foreground">
                                {sub?.gracePeriodEnd
                                  ? new Date(sub.gracePeriodEnd).toLocaleDateString("en-IN")
                                  : "—"}
                              </span>
                            </div>
                          </div>

                          {/* Right: Actions */}
                          <div className="flex items-center gap-2 self-start lg:self-center">
                            <Button
                              size="sm"
                              onClick={() => handleVerifySubscriptionPayment(item.restaurantId, item.name)}
                              disabled={isVerifying}
                              className="rounded-xl text-xs font-bold gap-1.5 h-9"
                              id={`button-verify-payment-${item.restaurantId}`}
                            >
                              {isVerifying ? (
                                <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <CheckCircle2 className="h-3.5 w-3.5" />
                              )}
                              {item.hasPendingPayment ? "Verify Submitted Payment" : "Manual +30d Renewal"}
                            </Button>
                          </div>
                        </div>

                        {/* Pending Payment Detail Box */}
                        {pending && (
                          <div className="mt-4 rounded-xl border border-blue-500/30 bg-blue-500/10 p-3.5 text-xs">
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                              <div>
                                <span className="font-bold text-blue-800 dark:text-blue-300 flex items-center gap-1.5">
                                  <Clock className="h-4 w-4 animate-pulse" />
                                  Submitted Payment for Verification:
                                </span>
                                <div className="mt-1 flex flex-wrap items-center gap-3 text-muted-foreground">
                                  <span>
                                    Method: <strong className="text-foreground">{pending.paymentMethod}</strong>
                                  </span>
                                  <span>
                                    Ref / UTR: <code className="bg-background/80 px-1.5 py-0.5 rounded font-mono font-bold text-foreground">{pending.transactionReference}</code>
                                  </span>
                                  <span>
                                    Amount: <strong className="text-emerald-600 dark:text-emerald-400">₹{(pending.amount || item.monthlyFee || 0).toLocaleString("en-IN")}</strong>
                                  </span>
                                  <span>
                                    Submitted: {pending.submittedAt ? new Date(pending.submittedAt).toLocaleString("en-IN") : "Recently"}
                                  </span>
                                </div>
                                {pending.notes && (
                                  <p className="mt-1 text-[11px] text-muted-foreground italic">
                                    Notes: {pending.notes}
                                  </p>
                                )}
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </div>
        )}

        {/* PLAN REQUESTS TAB */}
        {activeTab === "plan_requests" && (
          <div className="space-y-6 animate-in fade-in duration-200" id="tab-plan-requests-container">
            {/* Header and status filters */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h3 className="font-display text-xl font-bold text-foreground">
                  Restaurant Plan Upgrade Requests
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Review tenant requests to unlock higher dining capacities and premium features.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {[
                  { id: "all", label: `All (${planRequests.length})` },
                  { id: "PENDING", label: `Pending (${planRequests.filter((r) => r.status === "PENDING").length})` },
                  { id: "APPROVED", label: `Approved (${planRequests.filter((r) => r.status === "APPROVED").length})` },
                  { id: "REJECTED", label: `Declined (${planRequests.filter((r) => r.status === "REJECTED").length})` },
                ].map((pill) => (
                  <button
                    key={pill.id}
                    onClick={() => setPlanRequestStatusFilter(pill.id)}
                    className={`rounded-full px-3.5 py-1.5 text-xs font-bold transition-colors ${
                      planRequestStatusFilter === pill.id
                        ? "bg-primary text-primary-foreground shadow-xs"
                        : "bg-secondary text-muted-foreground hover:text-foreground"
                    }`}
                    id={`filter-plan-request-${pill.id}`}
                  >
                    {pill.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Requests List */}
            <div className="space-y-4">
              {planRequests
                .filter((r) => planRequestStatusFilter === "all" || r.status === planRequestStatusFilter)
                .map((req) => {
                  const isPending = req.status === "PENDING";
                  const isApproved = req.status === "APPROVED";
                  const isRejected = req.status === "REJECTED";
                  const isProcessing = processingRequestId === req.id;

                  return (
                    <div
                      key={req.id}
                      className={`rounded-2xl border p-5 transition-all ${
                        isPending
                          ? "border-amber-500/40 bg-amber-500/5 shadow-xs ring-1 ring-amber-500/10"
                          : "border-border bg-card shadow-2xs"
                      }`}
                      id={`plan-request-card-${req.id}`}
                    >
                      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5">
                        {/* Left: Restaurant Info */}
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <h4 className="font-display text-base font-bold text-foreground">
                              {req.restaurantName || "Unnamed Restaurant"}
                            </h4>
                            <span className="font-mono text-xs text-muted-foreground">
                              /{req.restaurantSlug}
                            </span>
                            <a
                              href={`/menu/${req.restaurantSlug}`}
                              target="_blank"
                              rel="noreferrer"
                              className="text-muted-foreground hover:text-foreground"
                              title="Open public menu"
                            >
                              <ExternalLink className="h-3.5 w-3.5" />
                            </a>
                          </div>

                          <p className="text-xs text-muted-foreground">
                            Requested by: <span className="text-foreground font-medium">{req.requestedBy || "Operator"}</span> •{" "}
                            {new Date(req.createdAt).toLocaleString()}
                          </p>
                        </div>

                        {/* Center: Upgrade Transition */}
                        <div className="flex items-center gap-3 rounded-xl bg-background/80 px-4 py-2 border border-border/60">
                          <div className="text-center">
                            <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider block">
                              Current
                            </span>
                            <span className="font-bold text-xs text-foreground uppercase">
                              {req.currentPlan || "Starter"}
                            </span>
                          </div>

                          <ArrowRight className="h-4 w-4 text-amber-500 shrink-0" />

                          <div className="text-center">
                            <span className="text-[10px] font-semibold text-amber-600 dark:text-amber-400 uppercase tracking-wider block">
                              Target
                            </span>
                            <span className="font-bold text-xs text-amber-600 dark:text-amber-400 uppercase">
                              {req.requestedPlan || "Growth"}
                            </span>
                          </div>
                        </div>

                        {/* Right: Status & Actions */}
                        <div className="flex items-center gap-3 self-end lg:self-center">
                          {isPending && (
                            <>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setRejectReasonModal(req)}
                                disabled={isProcessing}
                                className="rounded-xl text-xs text-muted-foreground hover:text-destructive"
                                id={`button-decline-plan-request-${req.id}`}
                              >
                                Decline
                              </Button>
                              <Button
                                size="sm"
                                onClick={() => handleApprovePlanRequest(req)}
                                disabled={isProcessing}
                                className="rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5 shadow-xs"
                                id={`button-approve-plan-request-${req.id}`}
                              >
                                <Check className="h-3.5 w-3.5" />
                                {isProcessing ? "Approving…" : "Approve & Upgrade"}
                              </Button>
                            </>
                          )}

                          {isApproved && (
                            <div className="text-right">
                              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-bold text-emerald-600 dark:text-emerald-400">
                                <CheckCircle2 className="h-3.5 w-3.5" /> Approved
                              </span>
                              {req.reviewedAt && (
                                <p className="text-[10px] text-muted-foreground mt-0.5">
                                  {new Date(req.reviewedAt).toLocaleDateString()}
                                </p>
                              )}
                            </div>
                          )}

                          {isRejected && (
                            <div className="text-right">
                              <span className="inline-flex items-center gap-1 rounded-full bg-red-500/10 px-2.5 py-1 text-xs font-bold text-red-600 dark:text-red-400">
                                Declined
                              </span>
                              {req.reviewNotes && (
                                <p className="text-[10px] text-muted-foreground mt-0.5 max-w-[200px] truncate">
                                  {req.reviewNotes}
                                </p>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}

              {planRequests.filter(
                (r) => planRequestStatusFilter === "all" || r.status === planRequestStatusFilter
              ).length === 0 && (
                <div className="rounded-2xl border border-dashed border-border bg-card/40 p-12 text-center">
                  <Sparkles className="h-8 w-8 text-muted-foreground/40 mx-auto mb-2" />
                  <h4 className="font-display font-bold text-foreground">No Plan Upgrade Requests</h4>
                  <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">
                    {planRequestStatusFilter === "PENDING"
                      ? "There are currently no pending plan requests awaiting review."
                      : "No plan upgrade requests match the selected filter."}
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* 2. LEADS PIPELINE TAB */}
        {activeTab === "leads" && (
          <div className="space-y-6 animate-in fade-in duration-200">
            {/* Filter pills */}
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex flex-wrap items-center gap-2">
                {["all", "new", "contacted", "qualified", "setup", "converted", "lost"].map((st) => (
                  <button
                    key={st}
                    onClick={() => setLeadStatusFilter(st)}
                    className={`rounded-full px-3.5 py-1 text-xs font-bold uppercase transition-colors ${
                      leadStatusFilter === st
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {st} {st !== "all" && `(${leads.filter((l) => l.status === st).length})`}
                  </button>
                ))}
              </div>

              <span className="text-xs text-muted-foreground font-mono">
                Showing {filteredLeads.length} leads
              </span>
            </div>

            {/* Leads Table */}
            <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-xs">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-border bg-muted/40 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                    <tr>
                      <th className="px-5 py-3.5">Restaurant</th>
                      <th className="px-5 py-3.5">Contact</th>
                      <th className="px-5 py-3.5">Location</th>
                      <th className="px-5 py-3.5">Tables</th>
                      <th className="px-5 py-3.5">Plan / Needs</th>
                      <th className="px-5 py-3.5">Status</th>
                      <th className="px-5 py-3.5 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {filteredLeads.map((l) => (
                      <tr key={l.id} className="hover:bg-muted/20 transition-colors">
                        <td className="px-5 py-4">
                          <p className="font-bold text-foreground">{l.restaurantName}</p>
                          <p className="text-[11px] text-muted-foreground">{l.ownerName}</p>
                        </td>
                        <td className="px-5 py-4 font-mono text-[11px]">
                          <div className="flex items-center gap-1">
                            <Phone className="h-3 w-3 text-muted-foreground" />
                            <span>{l.phone}</span>
                          </div>
                          <div className="flex items-center gap-1 text-muted-foreground mt-0.5">
                            <Mail className="h-3 w-3" />
                            <span>{l.email}</span>
                          </div>
                          <div className="mt-1">
                            {l.emailVerified ? (
                              <span className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-bold bg-emerald-500/15 text-emerald-800 dark:text-emerald-300 border border-emerald-500/30">
                                ✓ Email Verified
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-medium bg-amber-500/15 text-amber-800 dark:text-amber-300 border border-amber-500/30">
                                ⚠ Unverified
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-5 py-4">
                          <span className="inline-flex items-center gap-1 text-muted-foreground">
                            <MapPin className="h-3 w-3" /> {l.city}
                          </span>
                        </td>
                        <td className="px-5 py-4 font-mono font-bold">
                          {l.numberOfTables}
                        </td>
                        <td className="px-5 py-4">
                          <span className="rounded bg-secondary px-2 py-0.5 font-mono text-[10px] uppercase font-bold text-primary">
                            {l.requestedPlan}
                          </span>
                        </td>
                        <td className="px-5 py-4">
                          <select
                            value={l.status}
                            onChange={(e) => handleUpdateLeadStatus(l.id, e.target.value, l.notes)}
                            className="rounded-md border border-input bg-background px-2 py-1 text-xs font-semibold capitalize"
                          >
                            <option value="new">New</option>
                            <option value="contacted">Contacted</option>
                            <option value="qualified">Qualified</option>
                            <option value="setup">Setup</option>
                            <option value="converted">Converted</option>
                            <option value="lost">Lost</option>
                          </select>
                        </td>
                        <td className="px-5 py-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            {l.status !== "converted" ? (
                              <Button
                                size="sm"
                                disabled={convertingLeadId === l.id}
                                onClick={() => {
                                  setOnboardLeadModal(l);
                                  const rawPlan = String(l.requestedPlan || (l as any).preferredPlan || 'growth').toLowerCase().trim();
                                  const initialPlan: 'starter' | 'growth' | 'pro' =
                                    rawPlan === 'starter' || rawPlan === 'basic'
                                      ? 'starter'
                                      : rawPlan === 'scale' || rawPlan === 'pro' || rawPlan === 'enterprise'
                                      ? 'pro'
                                      : 'growth';
                                  setOnboardPlan(initialPlan);
                                }}
                                className="bg-accent text-accent-foreground hover:bg-accent/90 text-xs font-bold shadow-xs"
                                data-testid={`button-onboard-lead-${l.id}`}
                              >
                                {convertingLeadId === l.id ? "Converting..." : "1-Click Onboard ⚡"}
                              </Button>
                            ) : (
                              <Link
                                href={`/${l.convertedSlug || l.restaurantName.toLowerCase().replace(/\s+/g, "-")}/admin`}
                                className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700 hover:underline"
                              >
                                View Restaurant <ExternalLink className="h-3 w-3" />
                              </Link>
                            )}

                            {l.status !== "converted" && (
                              <button
                                type="button"
                                title="Permanently Delete Lead"
                                onClick={() => {
                                  setLeadToDelete(l);
                                  setLeadDeletePassword("");
                                }}
                                className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                    {filteredLeads.length === 0 && (
                      <tr>
                        <td colSpan={7} className="py-12 text-center text-xs text-muted-foreground">
                          No leads in this status category.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* 3. RESTAURANTS & SETUP WIZARD TAB */}
        {activeTab === "restaurants" && (
          <div className="space-y-6 animate-in fade-in duration-200">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-display text-2xl font-bold">Managed Restaurants</h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Tenant boundaries, operator roles, and live menu states.
                </p>
              </div>
              <Button onClick={() => setOpenAddModal(true)} className="gap-2 font-bold">
                <Plus className="h-4 w-4" /> Add Restaurant
              </Button>
            </div>

            {/* Modal for Adding Restaurant with Step Wizard */}
            {openAddModal && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs animate-in fade-in">
                <div className="w-full max-w-xl rounded-3xl border border-border bg-card p-6 shadow-2xl">
                  <div className="flex items-center justify-between border-b border-border pb-4">
                    <div>
                      <h3 className="font-display text-xl font-bold">Add New Restaurant</h3>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Automated setup: restaurant profile, tables, PINs, and owner auth.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setOpenAddModal(false)}
                      className="rounded-full p-2 text-muted-foreground hover:bg-muted"
                    >
                      ✕
                    </button>
                  </div>

                  <form onSubmit={handleCreateRestaurant} className="mt-6 space-y-4">
                    <div className="grid gap-4 sm:grid-cols-2">
                      <label className="space-y-1 text-xs font-bold">
                        <span>Restaurant Name *</span>
                        <Input
                          required
                          value={newRestForm.name}
                          onChange={(e) => {
                            const name = e.target.value;
                            const slug = name.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
                            setNewRestForm({ ...newRestForm, name, slug });
                          }}
                          placeholder="e.g. The Pepper Tree"
                        />
                      </label>
                      <label className="space-y-1 text-xs font-bold">
                        <span>Slug (URL identifier) *</span>
                        <Input
                          required
                          value={newRestForm.slug}
                          onChange={(e) => setNewRestForm({ ...newRestForm, slug: e.target.value })}
                          placeholder="e.g. the-pepper-tree"
                        />
                      </label>
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                      <label className="space-y-1 text-xs font-bold">
                        <span>Owner Full Name *</span>
                        <Input
                          required
                          value={newRestForm.ownerName}
                          onChange={(e) => setNewRestForm({ ...newRestForm, ownerName: e.target.value })}
                          placeholder="e.g. Sunita Nair"
                        />
                      </label>
                      <label className="space-y-1 text-xs font-bold">
                        <span>Owner Email (for login) *</span>
                        <Input
                          required
                          type="email"
                          value={newRestForm.ownerEmail}
                          onChange={(e) => setNewRestForm({ ...newRestForm, ownerEmail: e.target.value })}
                          placeholder="e.g. sunita@peppertree.com"
                        />
                      </label>
                    </div>

                    <div className="grid gap-4 sm:grid-cols-3">
                      <label className="space-y-1 text-xs font-bold">
                        <span>Phone *</span>
                        <Input
                          required
                          value={newRestForm.phone}
                          onChange={(e) => setNewRestForm({ ...newRestForm, phone: e.target.value })}
                          placeholder="+91 9876543210"
                        />
                      </label>
                      <label className="space-y-1 text-xs font-bold">
                        <span>City *</span>
                        <Input
                          required
                          value={newRestForm.city}
                          onChange={(e) => setNewRestForm({ ...newRestForm, city: e.target.value })}
                          placeholder="Bengaluru"
                        />
                      </label>
                      <label className="space-y-1 text-xs font-bold">
                        <span>Number of Tables</span>
                        <Input
                          required
                          type="number"
                          min="1"
                          max="100"
                          value={newRestForm.numberOfTables}
                          onChange={(e) => setNewRestForm({ ...newRestForm, numberOfTables: e.target.value })}
                        />
                      </label>
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                      <label className="space-y-1 text-xs font-bold">
                        <span>Subscription Plan</span>
                        <select
                          className="h-9 w-full rounded-md border border-input bg-background px-3 text-xs"
                          value={newRestForm.plan}
                          onChange={(e) => setNewRestForm({ ...newRestForm, plan: e.target.value })}
                        >
                          <option value="starter">Starter (Digital Menu)</option>
                          <option value="growth">Growth (Smart Ordering)</option>
                          <option value="scale">Scale (Pro Enterprise)</option>
                        </select>
                      </label>
                      <label className="space-y-1 text-xs font-bold">
                        <span>Initial Status</span>
                        <select
                          className="h-9 w-full rounded-md border border-input bg-background px-3 text-xs"
                          value={newRestForm.status}
                          onChange={(e) => setNewRestForm({ ...newRestForm, status: e.target.value })}
                        >
                          <option value="active">Active (Menu Live)</option>
                          <option value="setup">Setup (In Progress)</option>
                          <option value="inactive">Inactive</option>
                        </select>
                      </label>
                    </div>

                    <div className="rounded-xl border border-border/80 bg-background/50 p-3.5 space-y-1.5 text-xs">
                      <div className="flex items-center gap-2 font-bold text-accent">
                        <ShieldCheck className="h-4 w-4" />
                        <span>Owner Password & Activation Link</span>
                      </div>
                      <p className="text-[11px] text-muted-foreground leading-relaxed">
                        For production security, passwords are never stored in plaintext or configured by platform administrators. Once created, a secure account activation link will be generated for the owner to set their own private password.
                      </p>
                    </div>

                    <div className="flex justify-end gap-3 pt-4 border-t border-border">
                      <Button type="button" variant="outline" onClick={() => setOpenAddModal(false)}>
                        Cancel
                      </Button>
                      <Button type="submit" disabled={creatingRestaurant} className="font-bold">
                        {creatingRestaurant ? "Creating Workspace..." : "Launch Restaurant 🚀"}
                      </Button>
                    </div>
                  </form>
                </div>
              </div>
            )}

            {/* Modal for Managing Owner Account & Security */}
            {selectedAuthRestaurant && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs animate-in fade-in">
                <div className="w-full max-w-lg rounded-3xl border border-border bg-card p-6 shadow-2xl">
                  <div className="flex items-center justify-between border-b border-border pb-4">
                    <div>
                      <h3 className="font-display text-xl font-bold">Owner Security & Access</h3>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {selectedAuthRestaurant.name} (/{selectedAuthRestaurant.slug})
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setSelectedAuthRestaurant(null)}
                      className="rounded-full p-2 text-muted-foreground hover:bg-muted"
                    >
                      ✕
                    </button>
                  </div>

                  <div className="mt-6 space-y-6">
                    {/* Status & Deactivation Toggle */}
                    {(() => {
                      const isDeactivated =
                        selectedAuthRestaurant.accountStatus === "DEACTIVATED" ||
                        selectedAuthRestaurant.status === "inactive";
                      return (
                        <div
                          className={`flex items-center justify-between rounded-xl border p-4 transition-all ${
                            isDeactivated
                              ? "border-amber-500/40 bg-amber-500/10"
                              : "border-border/80 bg-background/50"
                          }`}
                          id="section-operator-account-access"
                        >
                          <div>
                            <div className="flex items-center gap-2">
                              <p className="font-bold text-xs">Operator Account Access</p>
                              <span
                                className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                                  isDeactivated
                                    ? "bg-amber-100 text-amber-800 dark:bg-amber-950/80 dark:text-amber-300 border border-amber-300 dark:border-amber-700"
                                    : "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700"
                                }`}
                                id="badge-account-status"
                              >
                                {isDeactivated ? "DEACTIVATED" : "ACTIVE"}
                              </span>
                            </div>
                            <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed">
                              {isDeactivated
                                ? "Account is deactivated. Operator sign-in, floor tables, and kitchen orders are blocked in Firebase."
                                : "Account is active. Operator and staff can access their workspace."}
                            </p>
                          </div>
                          <Button
                            size="sm"
                            variant={isDeactivated ? "default" : "destructive"}
                            disabled={updatingOwnerStatus}
                            onClick={() => handleToggleOwnerStatus(selectedAuthRestaurant)}
                            className="text-xs font-bold shrink-0 ml-4"
                            id="button-toggle-account-deactivation"
                          >
                            {updatingOwnerStatus
                              ? "Updating…"
                              : isDeactivated
                              ? "Reactivate Account"
                              : "Deactivate Account"}
                          </Button>
                        </div>
                      );
                    })()}

                    {/* Change Owner Email Form */}
                    <form onSubmit={handleUpdateOwnerEmail} className="space-y-4 rounded-xl border border-border/80 bg-background/50 p-4">
                      <div>
                        <span className="font-mono text-[10px] uppercase font-bold tracking-wider text-accent">
                          Firebase Auth Synchronization
                        </span>
                        <h4 className="font-bold text-sm mt-0.5">Change Registered Owner Email</h4>
                        <p className="text-[11px] text-muted-foreground mt-0.5">
                          Updates the Firebase Authentication login email and tenant metadata. This action is audited.
                        </p>
                      </div>

                      <div className="space-y-1 text-xs font-bold">
                        <span>Current Registered Email</span>
                        <Input
                          disabled
                          readOnly
                          value={selectedAuthRestaurant.ownerEmail}
                          className="bg-muted text-xs font-mono"
                        />
                      </div>

                      <div className="space-y-1 text-xs font-bold">
                        <span>New Owner Email *</span>
                        <Input
                          type="email"
                          required
                          value={newOwnerEmail}
                          onChange={(e) => setNewOwnerEmail(e.target.value)}
                          placeholder="newowner@restaurant.com"
                          className="text-xs"
                        />
                      </div>

                      <div className="flex justify-end pt-2">
                        <Button
                          type="submit"
                          disabled={updatingOwnerEmail || !newOwnerEmail.trim() || newOwnerEmail.trim() === selectedAuthRestaurant.ownerEmail}
                          className="text-xs font-bold gap-1.5"
                        >
                          <Lock className="h-3.5 w-3.5" />
                          {updatingOwnerEmail ? "Updating Auth..." : "Apply Email Change"}
                        </Button>
                      </div>
                    </form>
                  </div>
                </div>
              </div>
            )}

            {/* 1-Click Onboard Confirmation Modal */}
            {onboardLeadModal && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs animate-in fade-in">
                <div className="w-full max-w-md rounded-3xl border border-border bg-card p-6 shadow-2xl space-y-5">
                  <div className="flex items-center justify-between border-b border-border pb-3">
                    <div>
                      <span className="font-mono text-[10px] uppercase font-bold tracking-wider text-accent">
                        One-Click Provisioning
                      </span>
                      <h3 className="font-display text-xl font-bold">Onboard Restaurant</h3>
                    </div>
                    <button
                      type="button"
                      onClick={() => setOnboardLeadModal(null)}
                      className="rounded-full p-1.5 text-muted-foreground hover:bg-muted"
                    >
                      ✕
                    </button>
                  </div>

                  <div className="rounded-2xl border border-border/80 bg-background/60 p-4 space-y-2 text-xs">
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground">Restaurant:</span>
                      <span className="font-bold text-foreground">{onboardLeadModal.restaurantName}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground">Owner:</span>
                      <span className="font-semibold">{((onboardLeadModal as any).contactPerson || (onboardLeadModal as any).name || 'Restaurant Owner')}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground">Email:</span>
                      <span className="font-mono font-medium">{onboardLeadModal.email}</span>
                    </div>
                    <div className="pt-2 border-t border-border/50 space-y-1.5">
                      <div className="flex justify-between items-center">
                        <span className="text-muted-foreground font-medium">Assigned Subscription Plan:</span>
                        <span className="text-[11px] text-muted-foreground">
                          Requested: <strong className="text-foreground uppercase font-mono">{onboardLeadModal.requestedPlan || (onboardLeadModal as any).preferredPlan || 'growth'}</strong>
                        </span>
                      </div>
                      <select
                        value={onboardPlan}
                        onChange={(e) => setOnboardPlan(e.target.value as any)}
                        className="w-full rounded-xl border border-input bg-background px-3 py-2 text-xs font-semibold focus:ring-1 focus:ring-accent"
                        id="select-onboard-plan"
                      >
                        <option value="starter">Starter Plan — ₹499/mo (Up to 5 tables)</option>
                        <option value="growth">Growth Plan — ₹1,299/mo (Up to 30 tables + Waiter Calls)</option>
                        <option value="pro">Pro Plan — ₹2,499/mo (Unlimited tables + Full KDS & Floor Ops)</option>
                      </select>
                    </div>
                  </div>

                  {/* Credential Security Notice */}
                  <div className="rounded-xl border border-emerald-200/80 bg-emerald-50/70 dark:bg-emerald-950/30 p-3.5 text-xs text-emerald-900 dark:text-emerald-300">
                    <p className="font-semibold flex items-center gap-1.5 text-emerald-950 dark:text-emerald-200">
                      <ShieldCheck className="h-4 w-4 text-emerald-700" />
                      Email-Verified Password Setup
                    </p>
                    <p className="mt-1 text-[11.5px] leading-relaxed">
                      A single-use 6-digit verification code will be dispatched directly to <span className="font-bold">{onboardLeadModal.email}</span>. The owner will verify their email and choose their private password.
                    </p>
                  </div>

                  <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-border">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setOnboardLeadModal(null)}
                      className="text-xs"
                    >
                      Cancel
                    </Button>
                    <Button
                      type="button"
                      disabled={convertingLeadId === onboardLeadModal.id}
                      onClick={async () => {
                        const lead = onboardLeadModal;
                        const plan = onboardPlan;
                        setOnboardLeadModal(null);
                        await handleConvertLead(lead, plan);
                      }}
                      className="bg-accent text-accent-foreground hover:bg-accent/90 text-xs font-bold"
                    >
                      {convertingLeadId === onboardLeadModal.id ? 'Onboarding...' : 'Complete Onboarding ⚡'}
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {/* Modal for Immediate Lead Deletion with Admin Password */}
            {leadToDelete && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs animate-in fade-in">
                <div className="w-full max-w-md rounded-3xl border border-destructive/40 bg-card p-6 shadow-2xl space-y-5">
                  <div className="flex items-center justify-between border-b border-border pb-3">
                    <div className="flex items-center gap-2.5">
                      <div className="grid h-9 w-9 place-items-center rounded-xl bg-destructive/10 text-destructive">
                        <Trash2 className="h-4 w-4" />
                      </div>
                      <div>
                        <h3 className="font-display text-lg font-bold text-destructive">Delete Lead Record</h3>
                        <p className="text-xs text-muted-foreground">{leadToDelete.restaurantName || "Lead"}</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setLeadToDelete(null);
                        setLeadDeletePassword("");
                      }}
                      className="rounded-full p-2 text-muted-foreground hover:bg-muted"
                    >
                      ✕
                    </button>
                  </div>

                  <div className="space-y-4 text-xs">
                    <p className="text-muted-foreground leading-relaxed">
                      Are you sure you want to permanently remove the inquiry lead for{" "}
                      <strong className="text-foreground">{leadToDelete.restaurantName}</strong> ({leadToDelete.email})? This action cannot be undone.
                    </p>

                    <div>
                      <label className="text-xs font-semibold text-foreground mb-1.5 block">
                        Confirm with Platform Admin Password:
                      </label>
                      <Input
                        type="password"
                        placeholder="Enter admin password"
                        value={leadDeletePassword}
                        onChange={(e) => setLeadDeletePassword(e.target.value)}
                        className="rounded-xl text-xs"
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            handleDeleteLead();
                          }
                        }}
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-end gap-2 border-t border-border pt-4">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        setLeadToDelete(null);
                        setLeadDeletePassword("");
                      }}
                      className="text-xs"
                    >
                      Cancel
                    </Button>
                    <Button
                      type="button"
                      variant="destructive"
                      disabled={deletingLead || !leadDeletePassword.trim()}
                      onClick={handleDeleteLead}
                      className="text-xs font-bold gap-1.5"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      {deletingLead ? "Deleting..." : "Permanently Delete Lead"}
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {/* Modal for Onboarding Activation Link */}
            {onboardingSuccess && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs animate-in fade-in">
                <div className="w-full max-w-lg rounded-3xl border border-border bg-card p-6 shadow-2xl">
                  <div className="flex items-center justify-between border-b border-border pb-4">
                    <div className="flex items-center gap-3">
                      <div className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-500/10 text-emerald-600">
                        <Check className="h-5 w-5 stroke-[2.5]" />
                      </div>
                      <div>
                        <h3 className="font-display text-xl font-bold">
                          {onboardingSuccess.alreadyConverted ? "Lead Already Onboarded" : "Restaurant Onboarded Successfully"}
                        </h3>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {onboardingSuccess.restaurantName} (/{onboardingSuccess.slug})
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setOnboardingSuccess(null)}
                      className="rounded-full p-2 text-muted-foreground hover:bg-muted"
                    >
                      ✕
                    </button>
                  </div>

                  <div className="mt-6 space-y-5">
                    <div className="rounded-2xl border border-border/80 bg-background/60 p-4 space-y-3">
                      <div>
                        <span className="font-mono text-[10px] uppercase font-bold tracking-wider text-muted-foreground">
                          Owner Account
                        </span>
                        <p className="font-semibold text-sm mt-0.5">{onboardingSuccess.ownerEmail}</p>
                      </div>

                      <div>
                        <span className="font-mono text-[10px] uppercase font-bold tracking-wider text-amber-700 dark:text-amber-400">
                          Status
                        </span>
                        <div className="mt-1">
                          <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-300 bg-amber-50 px-2.5 py-0.5 font-mono text-[11px] font-semibold text-amber-900 dark:border-amber-700/60 dark:bg-amber-950/40 dark:text-amber-300">
                            <span className="h-1.5 w-1.5 rounded-full bg-amber-600 animate-pulse" />
                            Awaiting Email Verification / Password Setup
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-3.5 text-xs text-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300 leading-relaxed">
                      <p className="font-semibold flex items-center gap-1.5 text-emerald-950 dark:text-emerald-200">
                        <ShieldCheck className="h-4 w-4 text-emerald-700" />
                        Zero-Knowledge Credential Security
                      </p>
                      <p className="mt-1">
                        A single-use verification code and password setup instructions have been dispatched directly to the registered email address. Platform administrators cannot view, copy, or manually generate owner passwords.
                      </p>
                    </div>

                    {resendNotice && (
                      <div className="rounded-xl border border-emerald-300 bg-emerald-50 p-3 text-xs text-emerald-900 font-medium animate-in fade-in">
                        {resendNotice}
                      </div>
                    )}

                    <div className="flex items-center justify-between pt-2 border-t border-border">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={resendingVerification || !onboardingSuccess.restaurantId}
                        onClick={async () => {
                          if (!onboardingSuccess.restaurantId) return;
                          setResendingVerification(true);
                          setResendNotice("");
                          try {
                            const headers = await getAuthHeaders(true);
                            const res = await fetch(`/api/platform/restaurants/${onboardingSuccess.restaurantId}/resend-verification`, {
                              method: "POST",
                              headers,
                            });
                            const data = await res.json();
                            if (res.ok) {
                              setResendNotice(data.message || "Fresh verification code dispatched!");
                            } else {
                              setResendNotice(data.error || "Failed to dispatch verification code.");
                            }
                          } catch {
                            setResendNotice("Could not send verification email.");
                          } finally {
                            setResendingVerification(false);
                          }
                        }}
                        className="text-xs gap-1.5"
                      >
                        <Mail className="h-3.5 w-3.5" />
                        {resendingVerification ? "Sending..." : "Resend Verification"}
                      </Button>

                      <Button
                        type="button"
                        onClick={() => setOnboardingSuccess(null)}
                        className="font-bold text-xs"
                      >
                        Done
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Modal for Permanently Removing Restaurant & 24h Safety Lock */}
            {deletionModalRestaurant && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs animate-in fade-in">
                <div className="w-full max-w-lg rounded-3xl border border-border bg-card p-6 shadow-2xl">
                  <div className="flex items-center justify-between border-b border-border pb-4">
                    <div className="flex items-center gap-3">
                      <div className="grid h-10 w-10 place-items-center rounded-xl bg-destructive/10 text-destructive">
                        <Trash2 className="h-5 w-5 stroke-[2.2]" />
                      </div>
                      <div>
                        <h3 className="font-display text-xl font-bold">
                          {deletionModalRestaurant.status === "DELETION_PENDING"
                            ? "Deletion Lock & Safety Period"
                            : "Permanently Remove Restaurant"}
                        </h3>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {deletionModalRestaurant.name} (/{deletionModalRestaurant.slug})
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setDeletionModalRestaurant(null);
                        setDeleteConfirmName("");
                        setAdminReauthPassword("");
                      }}
                      className="rounded-full p-2 text-muted-foreground hover:bg-muted"
                    >
                      ✕
                    </button>
                  </div>

                  {deletionModalRestaurant.status === "DELETION_PENDING" ? (
                    /* STAGE 2: Restaurant is currently locked in 24h safety period */
                    <div className="mt-6 space-y-5">
                      <div className="rounded-2xl border border-rose-300 bg-rose-50/80 dark:border-rose-900/60 dark:bg-rose-950/30 p-4 space-y-3">
                        <div className="flex items-center gap-2 text-rose-800 dark:text-rose-300 font-bold text-sm">
                          <ShieldAlert className="h-4 w-4" />
                          <span>Restaurant Locked &amp; Pending Deletion</span>
                        </div>
                        <p className="text-xs text-rose-700 dark:text-rose-400 leading-relaxed">
                          All operator sessions, floor tables, and guest ordering are strictly disabled. The database and associated Firebase Authentication users will be irreversibly wiped after the 24-hour safety period.
                        </p>
                        <div className="rounded-xl border border-rose-200 bg-white/70 dark:bg-black/30 p-3 flex items-center justify-between">
                          <span className="text-[11px] font-bold uppercase tracking-wider text-rose-800 dark:text-rose-300">
                            Time to Permanent Wipe
                          </span>
                          <span className="font-mono text-xs font-bold text-rose-900 dark:text-rose-200">
                            {formatDeletionCountdown(deletionModalRestaurant.deletionScheduledFor)}
                          </span>
                        </div>
                      </div>

                      <div className="rounded-2xl border border-border/80 bg-background/60 p-4 space-y-2 text-xs">
                        <div className="flex justify-between items-center">
                          <span className="text-muted-foreground">Tenant Slug:</span>
                          <span className="font-mono font-bold text-foreground">/{deletionModalRestaurant.slug}</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-muted-foreground">Owner Email:</span>
                          <span className="font-mono">{deletionModalRestaurant.ownerEmail}</span>
                        </div>
                        {deletionModalRestaurant.deletionScheduledFor && (
                          <div className="flex justify-between items-center">
                            <span className="text-muted-foreground">Wipe Timestamp:</span>
                            <span className="font-mono text-[11px] text-muted-foreground">
                              {new Date(deletionModalRestaurant.deletionScheduledFor).toLocaleString()}
                            </span>
                          </div>
                        )}
                      </div>

                      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-3 border-t border-border">
                        <Button
                          type="button"
                          variant="outline"
                          disabled={cancellingDeletion}
                          onClick={() => handleCancelDeletion(deletionModalRestaurant)}
                          className="w-full sm:w-auto text-xs font-semibold"
                        >
                          {cancellingDeletion ? "Restoring..." : "Cancel Deletion & Restore"}
                        </Button>

                        <Button
                          type="button"
                          variant="destructive"
                          disabled={
                            executingDeletion ||
                            (deletionModalRestaurant.deletionScheduledFor &&
                              nowTimestamp < deletionModalRestaurant.deletionScheduledFor)
                          }
                          onClick={() => handleExecuteDeletion(deletionModalRestaurant)}
                          className="w-full sm:w-auto text-xs font-bold gap-1.5"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          {executingDeletion
                            ? "Purging Data..."
                            : deletionModalRestaurant.deletionScheduledFor &&
                              nowTimestamp < deletionModalRestaurant.deletionScheduledFor
                            ? "Locked (24h Safety Period)"
                            : "Execute Permanent Wipe Now"}
                        </Button>
                      </div>
                    </div>
                  ) : (
                    /* STAGE 1: Initiate Deletion & 24h Safety Lock */
                    <div className="mt-6 space-y-5">
                      <div className="rounded-2xl border border-amber-300 bg-amber-50/80 dark:border-amber-900/60 dark:bg-amber-950/30 p-4 space-y-2">
                        <div className="flex items-center gap-2 text-amber-900 dark:text-amber-300 font-bold text-xs uppercase tracking-wider">
                          <AlertTriangle className="h-4 w-4 text-amber-600" />
                          <span>High-Gravity Administrative Action</span>
                        </div>
                        <p className="text-xs text-amber-800 dark:text-amber-400 leading-relaxed">
                          Scheduling permanent removal immediately revokes all operator logins, cancels active sessions, and blocks customer ordering. A 24-hour safety timer begins, after which all menus, tables, orders, and authentication records are permanently erased.
                        </p>
                      </div>

                      {/* Step 1: Type restaurant name */}
                      <div className="space-y-1.5 text-xs font-bold">
                        <label className="text-foreground">
                          1. Type <span className="font-mono text-destructive underline">{deletionModalRestaurant.name}</span> to confirm:
                        </label>
                        <Input
                          value={deleteConfirmName}
                          onChange={(e) => setDeleteConfirmName(e.target.value)}
                          placeholder={deletionModalRestaurant.name}
                          className="text-xs font-medium"
                        />
                      </div>

                      {/* Step 2: Administrator Password Re-auth */}
                      <div className="space-y-1.5 text-xs font-bold">
                        <label className="text-foreground flex items-center justify-between">
                          <span>2. Enter your Platform Admin Password to re-authenticate:</span>
                          <span className="text-[10px] text-muted-foreground font-normal">Never stored</span>
                        </label>
                        <Input
                          type="password"
                          value={adminReauthPassword}
                          onChange={(e) => setAdminReauthPassword(e.target.value)}
                          placeholder="Platform admin password"
                          className="text-xs"
                        />
                      </div>

                      <div className="flex items-center justify-end gap-3 pt-3 border-t border-border">
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => {
                            setDeletionModalRestaurant(null);
                            setDeleteConfirmName("");
                            setAdminReauthPassword("");
                          }}
                          className="text-xs"
                        >
                          Cancel
                        </Button>
                        <Button
                          type="button"
                          variant="destructive"
                          disabled={
                            schedulingDeletion ||
                            deleteConfirmName.trim().toLowerCase() !== deletionModalRestaurant.name.trim().toLowerCase() ||
                            adminReauthPassword.length < 6
                          }
                          onClick={() => handleScheduleDeletion(deletionModalRestaurant)}
                          className="text-xs font-bold gap-1.5"
                        >
                          <ShieldAlert className="h-3.5 w-3.5" />
                          {schedulingDeletion ? "Locking & Scheduling..." : "Lock & Schedule Permanent Deletion"}
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Restaurant Cards Table */}
            <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-xs">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-border bg-muted/40 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="px-5 py-3.5">Restaurant</th>
                    <th className="px-5 py-3.5">Owner / Contact</th>
                    <th className="px-5 py-3.5">Tables</th>
                    <th className="px-5 py-3.5">Plan</th>
                    <th className="px-5 py-3.5">Status</th>
                    <th className="px-5 py-3.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {loadingRestaurants && restaurants.length === 0 && (
                    <tr>
                      <td colSpan={6} className="py-12 text-center text-xs text-muted-foreground font-medium">
                        <PlatformAdminLoader message="Connecting to database and loading restaurants…" />
                      </td>
                    </tr>
                  )}

                  {!loadingRestaurants && restaurantError && restaurants.length === 0 && (
                    <tr>
                      <td colSpan={6} className="py-12 text-center">
                        <div className="flex flex-col items-center justify-center gap-2">
                          <AlertTriangle className="h-6 w-6 text-destructive" />
                          <p className="font-bold text-sm text-foreground">Could not load restaurants.</p>
                          <p className="text-xs text-muted-foreground max-w-sm">
                            {restaurantError}
                          </p>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => fetchRestaurants()}
                            className="mt-2 font-bold text-xs gap-1.5"
                          >
                            <RefreshCw className="h-3.5 w-3.5" /> Retry
                          </Button>
                        </div>
                      </td>
                    </tr>
                  )}

                  {!loadingRestaurants && !restaurantError && restaurants.length === 0 && (
                    <tr>
                      <td colSpan={6} className="py-12 text-center">
                        <div className="flex flex-col items-center justify-center gap-2">
                          <Building className="h-6 w-6 text-muted-foreground/50" />
                          <p className="font-bold text-sm text-foreground">No restaurants yet.</p>
                          <p className="text-xs text-muted-foreground max-w-sm">
                            No restaurants have been provisioned yet. Click Add Restaurant to create one.
                          </p>
                          <Button
                            size="sm"
                            onClick={() => setOpenAddModal(true)}
                            className="mt-2 font-bold text-xs gap-1.5"
                          >
                            <Plus className="h-3.5 w-3.5" /> Add Restaurant
                          </Button>
                        </div>
                      </td>
                    </tr>
                  )}

                  {restaurants.map((r) => (
                    <tr key={r.id} className="hover:bg-muted/20 transition-colors">
                      <td className="px-5 py-4">
                        <p className="font-bold text-foreground">{r.name}</p>
                        <p className="font-mono text-[10px] text-muted-foreground">
                          /{r.slug} · {r.city}
                        </p>
                      </td>
                      <td className="px-5 py-4">
                        <p className="text-foreground">{r.ownerEmail}</p>
                        <p className="text-[10px] text-muted-foreground">{r.phone}</p>
                      </td>
                      <td className="px-5 py-4 font-mono font-bold">
                        {r.tableCount || 0} tables
                      </td>
                      <td className="px-5 py-4">
                        <select
                          value={r.plan || "starter"}
                          onChange={(e) => handleUpdateRestaurantPlan(r.id, e.target.value)}
                          className="h-7 rounded border border-border bg-card px-2 text-[11px] font-mono font-bold uppercase text-primary outline-none hover:border-accent cursor-pointer"
                          data-testid={`select-restaurant-plan-${r.id}`}
                        >
                          <option value="starter">Starter</option>
                          <option value="growth">Growth</option>
                          <option value="pro">Pro</option>
                        </select>
                      </td>
                      <td className="px-5 py-4">
                        {r.status === "DELETION_PENDING" ? (
                          <div className="space-y-1">
                            <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300 border border-rose-300 dark:border-rose-700 animate-pulse">
                              <span className="h-1.5 w-1.5 rounded-full bg-rose-600" />
                              Deletion Pending
                            </span>
                            <p className="text-[10px] font-mono text-rose-600 dark:text-rose-400 font-medium">
                              {formatDeletionCountdown(r.deletionScheduledFor)}
                            </p>
                          </div>
                        ) : (
                          <span
                            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                              r.status === "active"
                                ? "bg-emerald-100 text-emerald-800"
                                : "bg-amber-100 text-amber-800"
                            }`}
                          >
                            <span className="h-1.5 w-1.5 rounded-full bg-current" />
                            {r.status}
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          {r.status === "DELETION_PENDING" ? (
                            <Button
                              variant="destructive"
                              size="sm"
                              onClick={() => {
                                setDeletionModalRestaurant(r);
                                setDeleteConfirmName("");
                                setAdminReauthPassword("");
                              }}
                              className="h-7 text-[11px] font-semibold gap-1 rounded-lg bg-rose-600 hover:bg-rose-700 text-white"
                            >
                              <ShieldAlert className="h-3 w-3" />
                              Manage Deletion Lock
                            </Button>
                          ) : (
                            <>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  setSelectedAuthRestaurant(r);
                                  setNewOwnerEmail("");
                                }}
                                className="h-7 text-[11px] font-semibold gap-1 rounded-lg"
                              >
                                <KeyRound className="h-3 w-3" /> Owner & Auth
                              </Button>
                              <Link
                                href={`/${r.slug}/admin`}
                                className="inline-flex items-center gap-1 font-bold text-primary hover:text-accent text-xs"
                              >
                                Operator Space <ChevronRight className="h-4 w-4" />
                              </Link>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  setDeletionModalRestaurant(r);
                                  setDeleteConfirmName("");
                                  setAdminReauthPassword("");
                                }}
                                className="h-7 px-2 text-rose-600 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-lg"
                                title="Permanently Remove Restaurant"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* 4. PRICING PLANS TAB */}
        {activeTab === "plans" && (
          <div className="space-y-6 animate-in fade-in duration-200">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-display text-2xl font-bold">Subscription & Pricing Plans</h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Configure marketing tiers, setup fees, and monthly pricing displayed on the public site.
                </p>
              </div>
              <div className="flex items-center gap-2">
                {editingPlans ? (
                  <>
                    <Button variant="outline" size="sm" onClick={() => setEditingPlans(false)}>
                      Cancel
                    </Button>
                    <Button size="sm" onClick={handleSavePlans} disabled={savingPlans} className="font-bold">
                      {savingPlans ? "Saving..." : "Save Changes"}
                    </Button>
                  </>
                ) : (
                  <Button size="sm" onClick={() => setEditingPlans(true)} className="gap-1.5">
                    <Edit2 className="h-3.5 w-3.5" /> Edit Pricing
                  </Button>
                )}
              </div>
            </div>

            <div className="grid gap-6 md:grid-cols-3">
              {plans.map((p, idx) => (
                <div
                  key={p.id}
                  className="rounded-2xl border border-border bg-card p-6 shadow-xs flex flex-col justify-between"
                >
                  <div>
                    <h3 className="font-display text-xl font-bold">{p.name}</h3>
                    <p className="text-xs text-muted-foreground mt-1">{p.tagline}</p>

                    <div className="mt-6 border-b border-border pb-4">
                      {editingPlans ? (
                        <div className="space-y-3">
                          <label className="block text-[11px] font-bold">
                            Monthly Fee (₹)
                            <Input
                              type="number"
                              value={p.monthlyFee}
                              onChange={(e) => {
                                const copy = [...plans];
                                copy[idx].monthlyFee = Number(e.target.value);
                                setPlans(copy);
                              }}
                            />
                          </label>
                          <label className="block text-[11px] font-bold">
                            One-Time Setup Fee (₹)
                            <Input
                              type="number"
                              value={p.setupFee}
                              onChange={(e) => {
                                const copy = [...plans];
                                copy[idx].setupFee = Number(e.target.value);
                                setPlans(copy);
                              }}
                            />
                          </label>
                        </div>
                      ) : (
                        <div>
                          <p className="font-mono text-3xl font-bold">₹{p.monthlyFee} /mo</p>
                          <p className="text-[11px] font-mono text-muted-foreground mt-1">
                            + ₹{p.setupFee} setup fee
                          </p>
                        </div>
                      )}
                    </div>

                    <ul className="my-6 space-y-2 text-xs text-muted-foreground">
                      {Array.isArray(p.features) && p.features.map((f: string, fi: number) => (
                        <li key={fi} className="flex items-center gap-2">
                          <CheckCircle2 className="h-3.5 w-3.5 text-accent shrink-0" />
                          <span>{f}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 5. CONTROLLED SUPPORT MODE TAB */}
        {activeTab === "support" && (
          <div className="space-y-6 animate-in fade-in duration-200">
            <div className="rounded-3xl border border-amber-300 bg-amber-50/70 p-6 text-amber-950">
              <div className="flex items-start gap-4">
                <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-amber-200 text-amber-900">
                  <ShieldAlert className="h-6 w-6" />
                </div>
                <div>
                  <h3 className="font-display text-xl font-bold">Controlled Support Mode</h3>
                  <p className="mt-1 text-xs text-amber-900/80 leading-relaxed max-w-2xl">
                    Strict adherence to Section 10: Platform operators may enter a restaurant's admin space
                    only for explicit customer support or troubleshooting. All entries are cryptographically
                    logged in the tenant's audit trail (<code>SUPPORT_MODE_STARTED</code>) with the operator's email and stated reason.
                  </p>
                </div>
              </div>

              <div className="mt-8 rounded-2xl border border-amber-200 bg-white p-6 space-y-4 max-w-xl shadow-xs">
                <label className="block space-y-1 text-xs font-bold text-foreground">
                  <span>Target Restaurant</span>
                  <select
                    className="h-10 w-full rounded-md border border-input bg-background px-3 text-xs"
                    value={supportRestaurantId}
                    onChange={(e) => setSupportRestaurantId(e.target.value)}
                  >
                    <option value="">Select a restaurant to assist...</option>
                    {restaurants.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name} (/{r.slug})
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block space-y-1 text-xs font-bold text-foreground">
                  <span>Reason for Support Access (Required for Audit Log)</span>
                  <Input
                    value={supportReason}
                    onChange={(e) => setSupportReason(e.target.value)}
                    placeholder="e.g. Verifying KOT printer dispatch failure for Table 03"
                  />
                </label>

                <Button
                  onClick={handleStartSupportMode}
                  className="w-full bg-amber-600 text-white hover:bg-amber-700 font-bold"
                >
                  Enter Restaurant Workspace as Support Operator →
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Decline Plan Upgrade Request Modal */}
        {rejectReasonModal && (
          <div
            className="fixed inset-0 z-60 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs animate-in fade-in duration-200"
            id="modal-decline-plan-request"
          >
            <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-2xl space-y-4">
              <div className="flex items-center justify-between border-b border-border/60 pb-3">
                <h3 className="font-display text-base font-bold text-foreground">
                  Decline Upgrade Request
                </h3>
                <button
                  type="button"
                  onClick={() => setRejectReasonModal(null)}
                  className="rounded-lg p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
                >
                  ✕
                </button>
              </div>

              <div className="space-y-3 text-xs text-muted-foreground">
                <p>
                  Restaurant: <strong className="text-foreground">{rejectReasonModal.restaurantName}</strong>
                </p>
                <p>
                  Target Plan: <strong className="text-foreground">{rejectReasonModal.requestedPlan.toUpperCase()}</strong> (Current: {rejectReasonModal.currentPlan.toUpperCase()})
                </p>

                <label className="block space-y-1.5">
                  <span className="font-semibold text-foreground">Reason for Declining (Sent to Operator)</span>
                  <Input
                    value={rejectReasonText}
                    onChange={(e) => setRejectReasonText(e.target.value)}
                    placeholder="e.g. Account verification required before scaling table capacity"
                    className="h-10 text-xs"
                    id="input-decline-reason"
                  />
                </label>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-border/60">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setRejectReasonModal(null)}
                  disabled={Boolean(processingRequestId)}
                  className="rounded-xl text-xs"
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => handleRejectPlanRequest(rejectReasonModal, rejectReasonText)}
                  disabled={Boolean(processingRequestId)}
                  className="rounded-xl text-xs font-semibold"
                  id="button-confirm-decline-plan-request"
                >
                  {processingRequestId ? "Declining…" : "Confirm Decline"}
                </Button>
              </div>
            </div>
          </div>
        )}
      </main>
        </div>
      </div>
    </div>
  );
}
