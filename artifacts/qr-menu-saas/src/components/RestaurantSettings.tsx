import React, { useEffect, useState } from "react";
import { Store, Check, Save, Receipt, Sparkles, Shield, Lock, RefreshCw, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import {
  useGetRestaurantSettings,
  useUpdateRestaurantSettings,
  getGetRestaurantSettingsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { CustomBillReceiptSettings } from "./CustomBillReceiptSettings";
import { getFirebaseAuth } from "@/lib/firebase";
import { TablelineLoader } from "./TablelineLoading";

interface RestaurantSettingsProps {
  slug: string;
  currentPlan?: string;
  onNavigateToPlans?: () => void;
  defaultTab?: "general" | "bill" | "security";
}

export function RestaurantSettings({
  slug,
  currentPlan = "starter",
  onNavigateToPlans,
  defaultTab = "general",
}: RestaurantSettingsProps) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<"general" | "bill" | "security">(defaultTab);
  const { data: serverSettings, isLoading } = useGetRestaurantSettings(slug);
  const updateSettings = useUpdateRestaurantSettings();

  const [form, setForm] = useState({
    name: "",
    phone: "",
    currency: "₹",
    taxRate: "5",
    serviceCharge: "0",
    restaurantStatus: "active" as "active" | "inactive",
    requireCashPhoneVerification: false,
    maxCashOrderWithoutPhone: "2000",
  });

  const [saving, setSaving] = useState(false);

  // Security / Password Change States
  const [secCooldown, setSecCooldown] = useState(0);
  const [secOtpSent, setSecOtpSent] = useState(false);
  const [secOtpCode, setSecOtpCode] = useState("");
  const [secNewPassword, setSecNewPassword] = useState("");
  const [secConfirmPassword, setSecConfirmPassword] = useState("");
  const [secShowPassword, setSecShowPassword] = useState(false);
  const [secLoading, setSecLoading] = useState(false);
  const [secSuccess, setSecSuccess] = useState(false);
  const [secError, setSecError] = useState("");

  useEffect(() => {
    if (secCooldown <= 0) return;
    const timer = setInterval(() => {
      setSecCooldown((c) => (c > 0 ? c - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [secCooldown]);

  useEffect(() => {
    if (serverSettings) {
      setForm((prev) => {
        const sAny = serverSettings as any;
        const nextName = sAny.restaurantName || sAny.name || "My Restaurant";
        const nextPhone = sAny.phone || "";
        const nextCurrency = sAny.currency || "₹";
        const nextTax = String(sAny.taxRate ?? 5);
        const nextService = String(sAny.serviceCharge ?? 0);
        const nextStatus = sAny.restaurantStatus === "inactive" ? "inactive" : "active";
        const nextCashPhone = sAny.requireCashPhoneVerification === true;
        const nextMaxCash = String(sAny.maxCashOrderWithoutPhone ?? 2000);

        if (
          prev.name === nextName &&
          prev.phone === nextPhone &&
          prev.currency === nextCurrency &&
          prev.taxRate === nextTax &&
          prev.serviceCharge === nextService &&
          prev.restaurantStatus === nextStatus &&
          prev.requireCashPhoneVerification === nextCashPhone &&
          prev.maxCashOrderWithoutPhone === nextMaxCash
        ) {
          return prev;
        }

        return {
          name: nextName,
          phone: nextPhone,
          currency: nextCurrency,
          taxRate: nextTax,
          serviceCharge: nextService,
          restaurantStatus: nextStatus,
          requireCashPhoneVerification: nextCashPhone,
          maxCashOrderWithoutPhone: nextMaxCash,
        };
      });
    }
  }, [serverSettings]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await updateSettings.mutateAsync({
        restaurantSlug: slug,
        data: {
          restaurantName: form.name.trim(),
          phone: form.phone.trim(),
          currency: form.currency.trim() || "₹",
          taxRate: Number(form.taxRate) || 0,
          serviceCharge: Number(form.serviceCharge) || 0,
          restaurantStatus: form.restaurantStatus,
          menuEnabled: true,
          orderingEnabled: form.restaurantStatus === "active",
          requireCashPhoneVerification: form.requireCashPhoneVerification,
          maxCashOrderWithoutPhone: Number(form.maxCashOrderWithoutPhone) || 2000,
        } as any,
      });
      qc.invalidateQueries({ queryKey: getGetRestaurantSettingsQueryKey(slug) });
      toast({ title: "Settings saved successfully" });
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Could not save settings",
        description: err.message || "Please check inputs.",
      });
    } finally {
      setSaving(false);
    }
  };

  if (isLoading) {
    return (
      <TablelineLoader
        variant="card"
        message="Loading settings…"
        subtext="Fetching dining configuration, receipt preferences & security…"
        onRetry={() => qc.invalidateQueries({ queryKey: getGetRestaurantSettingsQueryKey(slug) })}
      />
    );
  }

  const isOpen = form.restaurantStatus === "active";

  return (
    <div className={`mx-auto ${activeTab === "bill" ? "max-w-5xl" : "max-w-2xl"} space-y-6`} id="restaurant-settings">
      {/* Subtabs Header */}
      <div className="flex items-center gap-2 border-b border-border/70 pb-3">
        <button
          type="button"
          onClick={() => setActiveTab("general")}
          className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition-all ${
            activeTab === "general"
              ? "bg-primary text-primary-foreground shadow-xs"
              : "text-muted-foreground hover:text-foreground hover:bg-secondary"
          }`}
          id="tab-settings-general"
        >
          <Store className="h-4 w-4" />
          <span>General Settings</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("bill")}
          className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition-all ${
            activeTab === "bill"
              ? "bg-primary text-primary-foreground shadow-xs"
              : "text-muted-foreground hover:text-foreground hover:bg-secondary"
          }`}
          id="tab-settings-bill"
        >
          <Receipt className="h-4 w-4" />
          <span>Custom Bill & Receipt</span>
          <span className="rounded-full bg-amber-500/20 text-amber-800 dark:text-amber-300 text-[10px] px-1.5 py-0.2 font-extrabold uppercase tracking-wider border border-amber-500/30">
            PRO
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("security")}
          className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition-all ${
            activeTab === "security"
              ? "bg-primary text-primary-foreground shadow-xs"
              : "text-muted-foreground hover:text-foreground hover:bg-secondary"
          }`}
          id="tab-settings-security"
        >
          <Shield className="h-4 w-4" />
          <span>Account & Security</span>
        </button>
      </div>

      {activeTab === "bill" ? (
        <CustomBillReceiptSettings
          slug={slug}
          currentPlan={currentPlan}
          onNavigateToPlans={onNavigateToPlans}
        />
      ) : activeTab === "security" ? (
        <div className="space-y-6">
          <div className="border-b border-border/70 pb-5">
            <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
              Account & Password Security
            </h1>
            <p className="text-xs text-muted-foreground">
              Manage operator credentials with multi-step email verification.
            </p>
          </div>

          <div className="rounded-2xl border border-border bg-card p-6 shadow-xs space-y-5">
            <div>
              <div className="flex items-center gap-2 text-sm font-bold text-foreground">
                <Lock className="h-4 w-4 text-primary" />
                <span>Verified Password Change</span>
              </div>
              <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                To safeguard your dining room from unauthorized changes, updating your password requires a 6-digit verification code sent to your registered email (
                <strong className="text-foreground">{getFirebaseAuth()?.currentUser?.email || "registered address"}</strong>).
              </p>
            </div>

            {secSuccess && (
              <div className="rounded-xl border border-emerald-300 bg-emerald-50 dark:bg-emerald-950/40 p-4 text-xs text-emerald-900 dark:text-emerald-200 flex items-start gap-2.5">
                <Check className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
                <div>
                  <p className="font-bold">Password Successfully Updated</p>
                  <p className="mt-0.5">Your account password has been updated. All active operator sessions remain verified.</p>
                </div>
              </div>
            )}

            {secError && (
              <div className="rounded-xl border border-rose-200 bg-rose-50 dark:bg-rose-950/40 p-3 text-xs text-rose-800 dark:text-rose-200">
                {secError}
              </div>
            )}

            {!secOtpSent ? (
              <div className="pt-2">
                <Button
                  type="button"
                  onClick={async () => {
                    setSecLoading(true);
                    setSecError("");
                    setSecSuccess(false);
                    try {
                      const token = await getFirebaseAuth()?.currentUser?.getIdToken();
                      const res = await fetch("/api/auth/request-password-change-otp", {
                        method: "POST",
                        headers: {
                          Authorization: `Bearer ${token}`,
                          "Content-Type": "application/json",
                        },
                      });
                      const data = await res.json();
                      if (!res.ok) {
                        if (data.cooldownRemaining) setSecCooldown(data.cooldownRemaining);
                        setSecError(data.error || "Failed to send verification code.");
                      } else {
                        setSecOtpSent(true);
                        setSecCooldown(60);
                        toast({
                          title: "Verification Code Dispatched",
                          description: "A 6-digit verification code has been sent to your email.",
                        });
                      }
                    } catch {
                      setSecError("Network error requesting verification code.");
                    } finally {
                      setSecLoading(false);
                    }
                  }}
                  disabled={secLoading || secCooldown > 0}
                  className="rounded-xl text-xs font-bold gap-2"
                  id="button-request-change-otp"
                >
                  <Shield className="h-3.5 w-3.5" />
                  {secCooldown > 0 ? `Resend Code (${secCooldown}s)` : "Send Verification Code to Email"}
                </Button>
              </div>
            ) : (
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  setSecLoading(true);
                  setSecError("");
                  setSecSuccess(false);

                  if (secNewPassword.length < 8) {
                    setSecError("New password must be at least 8 characters.");
                    setSecLoading(false);
                    return;
                  }
                  if (!/[A-Z]/.test(secNewPassword) || !/[a-z]/.test(secNewPassword) || !/[0-9]/.test(secNewPassword) || !/[^A-Za-z0-9]/.test(secNewPassword)) {
                    setSecError("Password must include uppercase, lowercase, numbers, and special characters.");
                    setSecLoading(false);
                    return;
                  }
                  if (secNewPassword !== secConfirmPassword) {
                    setSecError("Passwords do not match.");
                    setSecLoading(false);
                    return;
                  }

                  try {
                    const token = await getFirebaseAuth()?.currentUser?.getIdToken();
                    const res = await fetch("/api/auth/change-password", {
                      method: "POST",
                      headers: {
                        Authorization: `Bearer ${token}`,
                        "Content-Type": "application/json",
                      },
                      body: JSON.stringify({
                        code: secOtpCode.trim(),
                        newPassword: secNewPassword,
                      }),
                    });
                    const data = await res.json();
                    if (!res.ok) {
                      setSecError(data.error || "Failed to change password.");
                    } else {
                      setSecSuccess(true);
                      setSecOtpSent(false);
                      setSecOtpCode("");
                      setSecNewPassword("");
                      setSecConfirmPassword("");
                      toast({
                        title: "Password Updated Successfully",
                        description: "Your new credentials are now active.",
                      });
                    }
                  } catch {
                    setSecError("Network error updating password.");
                  } finally {
                    setSecLoading(false);
                  }
                }}
                className="space-y-4 pt-2"
                id="form-change-password"
              >
                <div>
                  <label className="text-xs font-semibold text-foreground block mb-1">
                    6-Digit Verification Code
                  </label>
                  <Input
                    type="text"
                    required
                    maxLength={6}
                    pattern="[0-9]{6}"
                    value={secOtpCode}
                    onChange={(e) => setSecOtpCode(e.target.value.replace(/\D/g, ""))}
                    placeholder="000000"
                    className="max-w-xs font-mono text-base tracking-[0.3em] font-bold text-center rounded-xl bg-background"
                    id="input-change-password-otp"
                  />
                  <p className="text-[10.5px] text-muted-foreground mt-1">
                    Check your registered inbox. Code expires in 10 minutes.
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-semibold text-foreground block mb-1">
                      New Password
                    </label>
                    <div className="relative">
                      <Input
                        type={secShowPassword ? "text" : "password"}
                        required
                        minLength={8}
                        value={secNewPassword}
                        onChange={(e) => setSecNewPassword(e.target.value)}
                        placeholder="••••••••••••"
                        className="text-xs rounded-xl bg-background pr-9"
                        id="input-change-password-new"
                      />
                      <button
                        type="button"
                        onClick={() => setSecShowPassword(!secShowPassword)}
                        className="absolute right-2.5 top-2.5 text-muted-foreground hover:text-foreground"
                      >
                        {secShowPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-foreground block mb-1">
                      Confirm New Password
                    </label>
                    <Input
                      type={secShowPassword ? "text" : "password"}
                      required
                      minLength={8}
                      value={secConfirmPassword}
                      onChange={(e) => setSecConfirmPassword(e.target.value)}
                      placeholder="••••••••••••"
                      className="text-xs rounded-xl bg-background"
                      id="input-change-password-confirm"
                    />
                  </div>
                </div>

                {/* Password Criteria */}
                <div className="rounded-xl border border-border/80 bg-muted/30 p-3 space-y-1 text-[11px] text-muted-foreground">
                  <span className="font-semibold text-foreground block mb-1">Password Requirements:</span>
                  <div className="grid grid-cols-2 gap-1">
                    <span className={secNewPassword.length >= 8 ? "text-emerald-600 font-medium" : ""}>✓ 8+ characters</span>
                    <span className={/[A-Z]/.test(secNewPassword) ? "text-emerald-600 font-medium" : ""}>✓ Uppercase letter</span>
                    <span className={/[a-z]/.test(secNewPassword) ? "text-emerald-600 font-medium" : ""}>✓ Lowercase letter</span>
                    <span className={/[0-9]/.test(secNewPassword) ? "text-emerald-600 font-medium" : ""}>✓ Number (0-9)</span>
                    <span className={/[^A-Za-z0-9]/.test(secNewPassword) ? "text-emerald-600 font-medium col-span-2" : "col-span-2"}>✓ Special character (!@#$%^&*)</span>
                  </div>
                </div>

                <div className="flex items-center gap-3 pt-2">
                  <Button
                    type="submit"
                    disabled={secLoading || secOtpCode.length !== 6 || secNewPassword.length < 8 || secNewPassword !== secConfirmPassword}
                    className="rounded-xl text-xs font-bold gap-2"
                    id="button-submit-change-password"
                  >
                    <Save className="h-3.5 w-3.5" />
                    {secLoading ? "Saving…" : "Save New Password"}
                  </Button>

                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={secLoading || secCooldown > 0}
                    onClick={async () => {
                      setSecLoading(true);
                      try {
                        const token = await getFirebaseAuth()?.currentUser?.getIdToken();
                        const res = await fetch("/api/auth/request-password-change-otp", {
                          method: "POST",
                          headers: {
                            Authorization: `Bearer ${token}`,
                            "Content-Type": "application/json",
                          },
                        });
                        if (res.ok) {
                          setSecCooldown(60);
                          toast({ title: "Fresh Code Dispatched" });
                        }
                      } finally {
                        setSecLoading(false);
                      }
                    }}
                    className="text-xs text-muted-foreground hover:text-foreground"
                  >
                    <RefreshCw className="h-3 w-3 mr-1" />
                    {secCooldown > 0 ? `Resend (${secCooldown}s)` : "Resend Code"}
                  </Button>
                </div>
              </form>
            )}
          </div>
        </div>
      ) : (
        <>
          <div className="border-b border-border/70 pb-5">
            <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
              Restaurant Settings
            </h1>
            <p className="text-xs text-muted-foreground">
              Core information, currency, tax rates, and open status.
            </p>
          </div>

          <form onSubmit={handleSave} className="rounded-2xl border border-border bg-card p-6 shadow-2xs space-y-6" id="form-settings">
            {/* Restaurant Status */}
            <div className="flex items-center justify-between border-b border-border/60 pb-5">
              <div>
                <p className="text-sm font-semibold text-foreground">Restaurant Status</p>
                <p className="text-xs text-muted-foreground">
                  {isOpen ? "Accepting orders and welcoming guests." : "Temporarily paused or closed."}
                </p>
              </div>
              <button
                type="button"
                onClick={() =>
                  setForm({
                    ...form,
                    restaurantStatus: isOpen ? "inactive" : "active",
                  })
                }
                className={`flex items-center gap-2 rounded-full px-4 py-1.5 text-xs font-bold transition-colors ${
                  isOpen
                    ? "bg-emerald-100 text-emerald-900"
                    : "bg-muted text-muted-foreground"
                }`}
                id="button-toggle-restaurant-open"
              >
                <span
                  className={`h-2 w-2 rounded-full ${
                    isOpen ? "bg-emerald-600" : "bg-muted-foreground"
                  }`}
                />
                {isOpen ? "Open" : "Closed"}
              </button>
            </div>

            {/* Inputs Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Restaurant Name */}
              <div className="sm:col-span-2">
                <label className="text-xs font-semibold text-foreground">Restaurant Name *</label>
                <Input
                  required
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="mt-1 text-xs rounded-xl bg-background"
                  id="input-settings-name"
                />
              </div>

              {/* Phone */}
              <div>
                <label className="text-xs font-semibold text-foreground">Phone Number</label>
                <Input
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  placeholder="+91 98765 43210"
                  className="mt-1 text-xs rounded-xl bg-background"
                  id="input-settings-phone"
                />
              </div>

              {/* Currency */}
              <div>
                <label className="text-xs font-semibold text-foreground">Currency Symbol</label>
                <Input
                  value={form.currency}
                  onChange={(e) => setForm({ ...form, currency: e.target.value })}
                  placeholder="₹"
                  className="mt-1 text-xs rounded-xl bg-background font-mono"
                  id="input-settings-currency"
                />
              </div>

              {/* Tax Rate */}
              <div>
                <label className="text-xs font-semibold text-foreground">Tax Rate (%) (Optional)</label>
                <Input
                  type="number"
                  step="0.1"
                  value={form.taxRate}
                  onChange={(e) => setForm({ ...form, taxRate: e.target.value })}
                  placeholder="5"
                  className="mt-1 text-xs rounded-xl bg-background"
                  id="input-settings-tax"
                />
              </div>

              {/* Service Charge */}
              <div>
                <label className="text-xs font-semibold text-foreground">Service Charge (%) (Optional)</label>
                <Input
                  type="number"
                  step="0.1"
                  value={form.serviceCharge}
                  onChange={(e) => setForm({ ...form, serviceCharge: e.target.value })}
                  placeholder="0"
                  className="mt-1 text-xs rounded-xl bg-background"
                  id="input-settings-service-charge"
                />
              </div>
            </div>

            {/* Anti-Abuse & Cash Security Section */}
            <div className="rounded-2xl border border-border/80 bg-secondary/30 p-4 space-y-3">
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-[#1c1917]">Cash &amp; Order Verification Rules</h4>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Protect kitchen operations from fake table orders and spam.
                </p>
              </div>

              <div className="flex items-start gap-2.5 pt-1">
                <input
                  type="checkbox"
                  id="requireCashPhoneVerification"
                  checked={form.requireCashPhoneVerification}
                  onChange={(e) => setForm({ ...form, requireCashPhoneVerification: e.target.checked })}
                  className="mt-0.5 rounded border-border text-[#1c1917] focus:ring-1"
                />
                <label htmlFor="requireCashPhoneVerification" className="text-xs cursor-pointer">
                  <span className="font-semibold text-foreground block">Enforce Phone Number for Cash Orders</span>
                  <span className="text-[11px] text-muted-foreground">Customers paying at table must enter their mobile number to place the order.</span>
                </label>
              </div>

              <div>
                <label className="text-xs font-semibold text-foreground">
                  Maximum Cash Order Amount without Phone Verification ({form.currency})
                </label>
                <Input
                  type="number"
                  value={form.maxCashOrderWithoutPhone}
                  onChange={(e) => setForm({ ...form, maxCashOrderWithoutPhone: e.target.value })}
                  placeholder="2000"
                  className="mt-1 max-w-xs text-xs rounded-xl bg-background"
                  id="input-settings-max-cash"
                />
                <p className="text-[10px] text-muted-foreground mt-1">
                  Orders above this limit will require customer phone verification even if general enforcement is off.
                </p>
              </div>
            </div>

            {/* Save Button */}
            <div className="flex justify-end border-t border-border/60 pt-4">
              <Button
                type="submit"
                disabled={saving}
                className="rounded-xl font-semibold gap-1.5"
                id="button-save-settings"
              >
                <Save className="h-4 w-4" />
                {saving ? "Saving…" : "Save Changes"}
              </Button>
            </div>
          </form>
        </>
      )}
    </div>
  );
}
