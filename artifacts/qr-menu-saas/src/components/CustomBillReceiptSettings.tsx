import React, { useEffect, useState } from "react";
import {
  Receipt,
  Printer,
  Sparkles,
  Save,
  Check,
  ShieldCheck,
  Lock,
  ArrowRight,
  Eye,
  FileText,
  HelpCircle,
  Building2,
  Phone,
  Tag,
  Hash,
  MessageSquare,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { getIdToken } from "@/lib/firebase";
import { canUseFeature, normalizePlanId, PLAN_DEFINITIONS } from "@/lib/plans";
import {
  BillPrintSettings,
  printBillDocument,
  DEFAULT_BILL_SETTINGS,
} from "@/lib/billPrinter";
import { TablelineLoader } from "./TablelineLoading";

interface CustomBillReceiptSettingsProps {
  slug: string;
  currentPlan?: string;
  onNavigateToPlans?: () => void;
}

export function CustomBillReceiptSettings({
  slug,
  currentPlan = "starter",
  onNavigateToPlans,
}: CustomBillReceiptSettingsProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testingPrint, setTestingPrint] = useState(false);

  const [settings, setSettings] = useState<BillPrintSettings>({
    ...DEFAULT_BILL_SETTINGS,
    restaurantName: "My Restaurant",
  });
  const [canCustomize, setCanCustomize] = useState(false);
  const [serverPlan, setServerPlan] = useState(currentPlan);

  // Fetch bill settings
  const fetchSettings = async () => {
    try {
      setLoading(true);
      const token = await getIdToken();
      const res = await fetch(`/api/restaurants/${slug}/bill-settings`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (res.ok) {
        const data = await res.json();
        if (data.billSettings) {
          setSettings((prev) => ({
            ...prev,
            ...data.billSettings,
          }));
        }
        setCanCustomize(Boolean(data.canCustomize));
        if (data.plan) {
          setServerPlan(data.plan);
        }
      }
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Could not load bill settings",
        description: err?.message || "Using default bill settings.",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSettings();
  }, [slug]);

  const effectivePlan = normalizePlanId(serverPlan || currentPlan);
  const isPro = canUseFeature(effectivePlan, "custom_bill_receipt");

  // Save settings handler
  const handleSave = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!isPro) {
      toast({
        variant: "destructive",
        title: "Pro Plan Required",
        description: "Custom Bill & Receipt formatting is an exclusive Pro plan feature.",
      });
      return;
    }

    setSaving(true);
    try {
      const token = await getIdToken();
      const res = await fetch(`/api/restaurants/${slug}/bill-settings`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(settings),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.message || "Failed to update bill settings");
      }

      const data = await res.json();
      if (data.billSettings) {
        setSettings((prev) => ({ ...prev, ...data.billSettings }));
      }

      toast({
        title: "Bill Settings Saved",
        description: "Custom bill and receipt format is now live across all printers.",
      });
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Could not save bill settings",
        description: err.message || "Please check your inputs and try again.",
      });
    } finally {
      setSaving(false);
    }
  };

  // Sample order for test printing and live preview
  const sampleOrder = {
    id: "ord-sample-992",
    orderNumber: "104",
    tableNumber: "04",
    tableName: "Table 4 (Patio)",
    staffName: "Rahul Sharma",
    createdAt: new Date().toISOString(),
    items: [
      { id: "1", name: "Artisanal Cappuccino", quantity: 2, price: 180, subtotal: 360 },
      { id: "2", name: "Truffle Mushroom Bruschetta", quantity: 1, price: 340, subtotal: 340 },
      { id: "3", name: "Sparkling Citrus Cooler", quantity: 1, price: 160, subtotal: 160 },
    ],
    subtotal: 860,
    taxRate: 5,
    taxAmount: 43,
    serviceCharge: 0,
    total: 903,
    paymentStatus: "PAID",
    paymentMethod: "UPI",
    customerNote: "Extra cinnamon powder on coffee",
  };

  const handleTestPrint = () => {
    setTestingPrint(true);
    try {
      printBillDocument(sampleOrder, settings, settings.paperSize || "thermal_80mm");
    } finally {
      setTestingPrint(false);
    }
  };

  if (loading) {
    return (
      <TablelineLoader
        variant="card"
        message="Loading bill & receipt preferences…"
        subtext="Formatting print layouts, tax rules & thermal printer styles…"
      />
    );
  }

  return (
    <div className="space-y-6" id="custom-bill-receipt-settings">
      {/* Top Banner & Heading */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-border/70 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="font-display text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
              <Receipt className="h-6 w-6 text-[#c86d51]" />
              Custom Bill & Receipt
            </h2>
            <span
              className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-extrabold tracking-wider uppercase ${
                isPro
                  ? "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-300 border border-amber-300 dark:border-amber-800"
                  : "bg-muted text-muted-foreground"
              }`}
            >
              {isPro ? (
                <>
                  <ShieldCheck className="h-3 w-3 text-amber-700 dark:text-amber-400" />
                  Pro Feature Active
                </>
              ) : (
                <>
                  <Lock className="h-3 w-3" />
                  Pro Only
                </>
              )}
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Format printed receipts, kitchen bills, and customer invoices with your logo, GSTIN, and paper sizing.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleTestPrint}
            disabled={testingPrint}
            className="rounded-xl font-semibold gap-1.5 h-9 bg-card hover:bg-secondary text-foreground"
            id="button-test-print-bill"
            title="Send sample formatted receipt to your printer"
          >
            <Printer className="h-3.5 w-3.5 text-[#c86d51]" />
            <span>Print Sample</span>
          </Button>

          {isPro && (
            <Button
              type="button"
              size="sm"
              onClick={() => handleSave()}
              disabled={saving}
              className="rounded-xl font-semibold gap-1.5 h-9 bg-primary text-primary-foreground hover:bg-primary/90"
              id="button-save-bill-settings-top"
            >
              <Save className="h-3.5 w-3.5" />
              {saving ? "Saving…" : "Save Changes"}
            </Button>
          )}
        </div>
      </div>

      {/* Non-Pro Upgrade Banner */}
      {!isPro && (
        <div
          className="rounded-2xl border border-amber-300 bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-950/40 dark:to-stone-900 p-5 shadow-xs"
          id="banner-pro-receipt-locked"
        >
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                <h3 className="text-sm font-bold text-amber-900 dark:text-amber-200">
                  Unlock Custom Bill & Receipt on Tableline Pro
                </h3>
              </div>
              <p className="text-xs text-amber-800/90 dark:text-amber-300/80 max-w-xl">
                Elevate customer trust with your restaurant logo, official GSTIN tax numbers, custom footer greetings,
                and switch between 80mm thermal slips and A4 invoices.
              </p>
            </div>
            {onNavigateToPlans && (
              <Button
                type="button"
                onClick={onNavigateToPlans}
                className="shrink-0 rounded-xl bg-[#2c1810] text-white hover:bg-[#1a0f0a] gap-1.5 text-xs font-semibold"
                id="button-upgrade-to-pro-receipt"
              >
                <span>Upgrade to Pro</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Main Content Layout: Form Controls on Left, Live Interactive Preview on Right */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Settings Form (7 cols on desktop) */}
        <div className="lg:col-span-7 space-y-6">
          <form
            onSubmit={handleSave}
            className={`rounded-2xl border border-border bg-card p-5 sm:p-6 space-y-6 ${
              !isPro ? "opacity-75 pointer-events-none select-none" : ""
            }`}
            id="form-bill-settings"
          >
            {/* Paper Size Selector */}
            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-wider text-foreground flex items-center justify-between">
                <span>Receipt Paper Size & Format</span>
                <span className="text-[11px] font-normal text-muted-foreground lowercase">thermal vs sheet</span>
              </label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setSettings({ ...settings, paperSize: "thermal_80mm" })}
                  className={`flex flex-col items-center justify-center p-3.5 rounded-xl border text-center transition-all ${
                    settings.paperSize === "thermal_80mm"
                      ? "border-primary bg-primary/5 text-primary ring-1 ring-primary"
                      : "border-border bg-card text-muted-foreground hover:bg-secondary"
                  }`}
                  id="button-format-thermal"
                >
                  <Receipt className="h-5 w-5 mb-1.5" />
                  <span className="text-xs font-bold">80mm Thermal (POS)</span>
                  <span className="text-[10px] text-muted-foreground mt-0.5">Standard roll for receipt printers</span>
                </button>

                <button
                  type="button"
                  onClick={() => setSettings({ ...settings, paperSize: "a4" })}
                  className={`flex flex-col items-center justify-center p-3.5 rounded-xl border text-center transition-all ${
                    settings.paperSize === "a4"
                      ? "border-primary bg-primary/5 text-primary ring-1 ring-primary"
                      : "border-border bg-card text-muted-foreground hover:bg-secondary"
                  }`}
                  id="button-format-a4"
                >
                  <FileText className="h-5 w-5 mb-1.5" />
                  <span className="text-xs font-bold">A4 Full Sheet</span>
                  <span className="text-[10px] text-muted-foreground mt-0.5">Full page tax invoice with borders</span>
                </button>
              </div>
            </div>

            <div className="border-t border-border/60 pt-5 space-y-4">
              <h4 className="text-xs font-bold uppercase tracking-wider text-foreground flex items-center gap-1.5">
                <Building2 className="h-3.5 w-3.5 text-[#c86d51]" />
                Brand & Business Information
              </h4>

              {/* Logo URL */}
              <div>
                <label className="text-xs font-semibold text-foreground flex items-center justify-between">
                  <span>Restaurant Logo URL (Optional)</span>
                  {settings.logoUrl && (
                    <button
                      type="button"
                      onClick={() => setSettings({ ...settings, logoUrl: "" })}
                      className="text-[10px] text-muted-foreground hover:text-destructive"
                    >
                      Clear Logo
                    </button>
                  )}
                </label>
                <Input
                  value={settings.logoUrl || ""}
                  onChange={(e) => setSettings({ ...settings, logoUrl: e.target.value })}
                  placeholder="https://example.com/logo.png"
                  className="mt-1 text-xs rounded-xl bg-background"
                  id="input-bill-logo-url"
                />
                <p className="text-[10px] text-muted-foreground mt-1">
                  Square or horizontal PNG/JPG. Rendered in grayscale contrast for thermal printers.
                </p>
              </div>

              {/* Tagline */}
              <div>
                <label className="text-xs font-semibold text-foreground">Tagline / Subtitle</label>
                <Input
                  value={settings.tagline || ""}
                  onChange={(e) => setSettings({ ...settings, tagline: e.target.value })}
                  placeholder="e.g. Fine Dining & Craft Cocktails"
                  className="mt-1 text-xs rounded-xl bg-background"
                  id="input-bill-tagline"
                  maxLength={120}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* FSSAI License Number (CRITICAL INDIAN STATUTORY LAW) */}
                <div>
                  <label className="text-xs font-semibold text-foreground flex items-center justify-between">
                    <span>FSSAI Lic. Number</span>
                    <span className="text-[10px] text-amber-700 dark:text-amber-400 font-bold">Mandatory in India</span>
                  </label>
                  <Input
                    value={settings.fssai || ""}
                    onChange={(e) => setSettings({ ...settings, fssai: e.target.value.replace(/\D/g, "") })}
                    placeholder="14-digit FSSAI (e.g. 11523001000452)"
                    className="mt-1 text-xs rounded-xl bg-background font-mono"
                    id="input-bill-fssai"
                    maxLength={14}
                  />
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    14-digit food safety registration printed on all customer checks
                  </p>
                </div>

                {/* GSTIN / Tax ID */}
                <div>
                  <label className="text-xs font-semibold text-foreground">GSTIN (15 Digits)</label>
                  <Input
                    value={settings.gstin || ""}
                    onChange={(e) => setSettings({ ...settings, gstin: e.target.value.toUpperCase() })}
                    placeholder="e.g. 27AAPCA1234F1Z5"
                    className="mt-1 text-xs rounded-xl bg-background font-mono uppercase"
                    id="input-bill-gstin"
                    maxLength={15}
                  />
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    Required for 2.5% CGST + 2.5% SGST compliance
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Phone */}
                <div>
                  <label className="text-xs font-semibold text-foreground">Contact Phone</label>
                  <Input
                    value={settings.phone || ""}
                    onChange={(e) => setSettings({ ...settings, phone: e.target.value })}
                    placeholder="e.g. +91 98230 12345"
                    className="mt-1 text-xs rounded-xl bg-background"
                    id="input-bill-phone"
                  />
                </div>

                {/* Address */}
                <div>
                  <label className="text-xs font-semibold text-foreground">Premise Physical Address</label>
                  <Input
                    value={settings.address || ""}
                    onChange={(e) => setSettings({ ...settings, address: e.target.value })}
                    placeholder="Registered physical address of premise"
                    className="mt-1 text-xs rounded-xl bg-background"
                    id="input-bill-address"
                    maxLength={250}
                  />
                </div>
              </div>
            </div>

            {/* Custom Messages & Notes */}
            <div className="border-t border-border/60 pt-5 space-y-4">
              <h4 className="text-xs font-bold uppercase tracking-wider text-foreground flex items-center gap-1.5">
                <MessageSquare className="h-3.5 w-3.5 text-[#c86d51]" />
                Footer Greetings & Notes
              </h4>

              <div>
                <label className="text-xs font-semibold text-foreground">Primary Thank You Message</label>
                <Input
                  value={settings.footerMessage || ""}
                  onChange={(e) => setSettings({ ...settings, footerMessage: e.target.value })}
                  placeholder="Thank you for dining with us!"
                  className="mt-1 text-xs rounded-xl bg-background"
                  id="input-bill-footer-message"
                  maxLength={180}
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-foreground">Secondary Footer Note (Optional)</label>
                <Input
                  value={settings.footerNote || ""}
                  onChange={(e) => setSettings({ ...settings, footerNote: e.target.value })}
                  placeholder="e.g. Free Wi-Fi: CafeGuest2026 • Follow us @ourcafe"
                  className="mt-1 text-xs rounded-xl bg-background"
                  id="input-bill-footer-note"
                  maxLength={180}
                />
              </div>
            </div>

            {/* Granular Visibility Toggles */}
            <div className="border-t border-border/60 pt-5 space-y-3">
              <h4 className="text-xs font-bold uppercase tracking-wider text-foreground">
                Display Fields on Receipts
              </h4>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <label className="flex items-center gap-2 text-xs text-foreground cursor-pointer rounded-lg p-1.5 hover:bg-secondary/40">
                  <input
                    type="checkbox"
                    checked={settings.showTableNumber !== false}
                    onChange={(e) => setSettings({ ...settings, showTableNumber: e.target.checked })}
                    className="rounded border-border text-primary focus:ring-primary"
                  />
                  <span>Show Table Number</span>
                </label>

                <label className="flex items-center gap-2 text-xs text-foreground cursor-pointer rounded-lg p-1.5 hover:bg-secondary/40">
                  <input
                    type="checkbox"
                    checked={settings.showOrderNumber !== false}
                    onChange={(e) => setSettings({ ...settings, showOrderNumber: e.target.checked })}
                    className="rounded border-border text-primary focus:ring-primary"
                  />
                  <span>Show Order Token / Number</span>
                </label>

                <label className="flex items-center gap-2 text-xs text-foreground cursor-pointer rounded-lg p-1.5 hover:bg-secondary/40">
                  <input
                    type="checkbox"
                    checked={settings.showDateTime !== false}
                    onChange={(e) => setSettings({ ...settings, showDateTime: e.target.checked })}
                    className="rounded border-border text-primary focus:ring-primary"
                  />
                  <span>Show Date & Time</span>
                </label>

                <label className="flex items-center gap-2 text-xs text-foreground cursor-pointer rounded-lg p-1.5 hover:bg-secondary/40">
                  <input
                    type="checkbox"
                    checked={settings.showTax !== false}
                    onChange={(e) => setSettings({ ...settings, showTax: e.target.checked })}
                    className="rounded border-border text-primary focus:ring-primary"
                  />
                  <span>Show Tax & Subtotal Breakdown</span>
                </label>

                <label className="flex items-center gap-2 text-xs text-foreground cursor-pointer rounded-lg p-1.5 hover:bg-secondary/40">
                  <input
                    type="checkbox"
                    checked={settings.showPaymentDetails !== false}
                    onChange={(e) => setSettings({ ...settings, showPaymentDetails: e.target.checked })}
                    className="rounded border-border text-primary focus:ring-primary"
                  />
                  <span>Show Payment Method & Paid Status</span>
                </label>

                <label className="flex items-center gap-2 text-xs text-foreground cursor-pointer rounded-lg p-1.5 hover:bg-secondary/40">
                  <input
                    type="checkbox"
                    checked={settings.showContactInfo !== false}
                    onChange={(e) => setSettings({ ...settings, showContactInfo: e.target.checked })}
                    className="rounded border-border text-primary focus:ring-primary"
                  />
                  <span>Show Address & Phone Header</span>
                </label>
              </div>
            </div>

            {/* Bottom Save Action */}
            {isPro && (
              <div className="flex justify-end border-t border-border/60 pt-4">
                <Button
                  type="submit"
                  disabled={saving}
                  className="rounded-xl font-semibold gap-1.5 text-xs bg-primary text-primary-foreground hover:bg-primary/90"
                  id="button-save-bill-settings-bottom"
                >
                  <Save className="h-4 w-4" />
                  {saving ? "Saving…" : "Save Changes"}
                </Button>
              </div>
            )}
          </form>
        </div>

        {/* Live Interactive Receipt Preview (5 cols on desktop) */}
        <div className="lg:col-span-5 space-y-3">
          <div className="flex items-center justify-between px-1">
            <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <Eye className="h-3.5 w-3.5" />
              Live Receipt Preview
            </h3>
            <span className="text-[11px] font-mono text-muted-foreground">
              {settings.paperSize === "a4" ? "A4 Sheet (Preview)" : "80mm Thermal (Scale 1:1)"}
            </span>
          </div>

          {/* Paper Container */}
          <div className="rounded-2xl border border-border bg-stone-100 dark:bg-stone-900/60 p-4 sm:p-6 flex justify-center shadow-inner overflow-hidden">
            {settings.paperSize === "a4" ? (
              // A4 Sheet Preview
              <div className="w-full max-w-[340px] bg-white text-stone-900 border border-stone-300 rounded-lg p-5 shadow-md font-sans text-xs select-none">
                <div className="border-b-2 border-stone-800 pb-3 flex items-start justify-between">
                  <div>
                    {settings.logoUrl && (
                      <img
                        src={settings.logoUrl}
                        alt="Logo"
                        className="max-h-8 max-w-[90px] object-contain mb-1"
                        onError={(e) => {
                          (e.target as HTMLElement).style.display = "none";
                        }}
                      />
                    )}
                    <div className="font-extrabold text-sm uppercase tracking-wide">
                      {settings.restaurantName || "The Roasted Bean Cafe"}
                    </div>
                    {settings.tagline && (
                      <div className="text-[10px] text-stone-600 italic">{settings.tagline}</div>
                    )}
                    <div className="text-[9px] text-stone-500 mt-1">
                      {settings.address || "Shop 4, Ground Floor, Heritage Hub, FC Road, Pune 411004"}
                    </div>
                    {settings.phone && (
                      <div className="text-[9px] text-stone-500">Ph: {settings.phone}</div>
                    )}
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      <span className="text-[9px] font-bold text-amber-800 bg-amber-50 border border-amber-200 px-1 rounded">
                        FSSAI: {settings.fssai || "11523001000452"}
                      </span>
                      <span className="text-[9px] font-mono text-stone-700 bg-stone-100 border border-stone-200 px-1 rounded font-semibold">
                        GSTIN: {settings.gstin || "27AAPCA1234F1Z5"}
                      </span>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="inline-block bg-stone-900 text-white font-extrabold text-[9px] px-2 py-0.5 rounded uppercase tracking-wider">
                      Tax Invoice
                    </span>
                    <div className="text-[9px] font-mono font-bold mt-1 text-stone-800">
                      INV-260929-001
                    </div>
                  </div>
                </div>

                {/* Metadata Row */}
                <div className="grid grid-cols-2 gap-2 py-2.5 border-b border-stone-200 text-[10px]">
                  <div>
                    <div>
                      <strong>Invoice #:</strong> INV-260929-001
                    </div>
                    <div>
                      <strong>Table:</strong> Table 04
                    </div>
                  </div>
                  <div className="text-right">
                    <div>
                      <strong>Date:</strong> 29-Sep-2026 | 19:44 PM
                    </div>
                    <div className="font-bold text-emerald-700">PAID VIA UPI</div>
                  </div>
                </div>

                {/* Items Table */}
                <table className="w-full my-2.5 text-[10px] border-collapse">
                  <thead>
                    <tr className="border-b border-stone-300 font-bold text-stone-700">
                      <th className="py-1 text-center w-8">Qty</th>
                      <th className="py-1 text-left">Item Name</th>
                      <th className="py-1 text-right">Unit Price</th>
                      <th className="py-1 text-right">Total Price</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-b border-stone-100">
                      <td className="py-1 text-center font-mono">2</td>
                      <td className="py-1 text-left font-semibold">
                        Flat White
                        <div className="text-[9px] text-stone-500 pl-2">↳ + Oat Milk (+₹30)</div>
                      </td>
                      <td className="py-1 text-right font-mono">₹210</td>
                      <td className="py-1 text-right font-mono font-bold">₹420</td>
                    </tr>
                    <tr className="border-b border-stone-100">
                      <td className="py-1 text-center font-mono">1</td>
                      <td className="py-1 text-left font-semibold">
                        Avocado Toast
                        <div className="text-[9px] text-stone-500 pl-2">↳ + Extra Cheese (+₹40)</div>
                      </td>
                      <td className="py-1 text-right font-mono">₹440</td>
                      <td className="py-1 text-right font-mono font-bold">₹440</td>
                    </tr>
                  </tbody>
                </table>

                {/* Strict Financial Ledger with 2.5% CGST + 2.5% SGST */}
                <div className="space-y-1 text-[10px] border-t border-stone-300 pt-2 text-right">
                  <div className="flex justify-between">
                    <span>Subtotal (before taxes):</span>
                    <span className="font-mono">₹860.00</span>
                  </div>
                  <div className="flex justify-between text-stone-600">
                    <span>CGST (2.5%):</span>
                    <span className="font-mono">₹21.50</span>
                  </div>
                  <div className="flex justify-between text-stone-600">
                    <span>SGST (2.5%):</span>
                    <span className="font-mono">₹21.50</span>
                  </div>
                  <div className="text-xs font-black border-t-2 border-stone-900 pt-1 flex justify-between">
                    <span>GRAND TOTAL:</span>
                    <span className="font-mono">₹903.00</span>
                  </div>
                  <div className="text-[10px] font-bold text-center bg-sky-50 border border-sky-200 text-sky-900 py-1 rounded mt-1">
                    PAID VIA UPI
                  </div>
                </div>

                {/* Footers */}
                <div className="mt-4 pt-3 border-t border-stone-200 text-center text-[9px] text-stone-500">
                  <div className="font-medium text-stone-700">{settings.footerMessage}</div>
                  <div className="text-[8px] text-stone-400 mt-0.5">
                    FSSAI Lic. No: {settings.fssai || "11523001000452"} • Tableline POS India
                  </div>
                </div>
              </div>
            ) : (
              // 80mm Thermal Slip Preview
              <div className="w-[270px] bg-white text-stone-900 border border-stone-300 rounded-lg p-4 shadow-md font-mono text-[11px] select-none leading-tight">
                <div className="text-center pb-2 border-b border-dashed border-stone-400">
                  {settings.logoUrl && (
                    <img
                      src={settings.logoUrl}
                      alt="Logo"
                      className="max-h-7 max-w-[80px] object-contain mx-auto mb-1.5 grayscale"
                      onError={(e) => {
                        (e.target as HTMLElement).style.display = "none";
                      }}
                    />
                  )}
                  <div className="font-extrabold text-xs tracking-wider uppercase">
                    {settings.restaurantName || "The Roasted Bean Cafe"}
                  </div>
                  {settings.tagline && (
                    <div className="text-[9px] text-stone-600 mt-0.5">{settings.tagline}</div>
                  )}
                  <div className="text-[9px] text-stone-500 mt-1">
                    {settings.address || "Shop 4, Ground Floor, Heritage Hub, FC Road, Pune 411004"}
                  </div>
                  {settings.phone && (
                    <div className="text-[9px] text-stone-500">Tel: {settings.phone}</div>
                  )}
                  <div className="text-[9px] font-bold text-stone-700 mt-1">
                    GSTIN: {settings.gstin || "27AAPCA1234F1Z5"}
                  </div>
                  <div className="text-[9.5px] font-extrabold text-stone-900 mt-0.5">
                    *** FSSAI Lic: {settings.fssai || "11523001000452"} ***
                  </div>
                </div>

                {/* Metadata */}
                <div className="py-2 border-b border-dashed border-stone-400 text-[10px] space-y-0.5">
                  <div className="flex justify-between font-bold">
                    <span>INVOICE: INV-260929-001</span>
                    <span>TABLE 04</span>
                  </div>
                  <div className="text-stone-600 text-[9px]">
                    29-Sep-2026 | 19:44 PM
                  </div>
                </div>

                {/* Items */}
                <div className="py-2 border-b border-dashed border-stone-400 space-y-1 text-[10px]">
                  <div className="flex justify-between font-bold border-b border-stone-200 pb-0.5">
                    <span>QTY ITEM</span>
                    <span>RATE  AMT</span>
                  </div>
                  <div>
                    <div className="flex justify-between font-semibold">
                      <span>2x Flat White</span>
                      <span>210  420</span>
                    </div>
                    <div className="text-[8.5px] text-stone-600 pl-2">↳ + Oat Milk</div>
                  </div>
                  <div>
                    <div className="flex justify-between font-semibold">
                      <span>1x Avocado Toast</span>
                      <span>440  440</span>
                    </div>
                    <div className="text-[8.5px] text-stone-600 pl-2">↳ + Extra Cheese</div>
                  </div>
                </div>

                {/* Totals */}
                <div className="py-2 border-b-2 border-stone-800 text-[10px] space-y-0.5">
                  <div className="flex justify-between">
                    <span>Subtotal:</span>
                    <span>₹860.00</span>
                  </div>
                  <div className="flex justify-between text-stone-600">
                    <span>CGST (2.5%):</span>
                    <span>₹21.50</span>
                  </div>
                  <div className="flex justify-between text-stone-600">
                    <span>SGST (2.5%):</span>
                    <span>₹21.50</span>
                  </div>
                  <div className="flex justify-between font-extrabold text-xs pt-1 border-t-2 border-stone-900">
                    <span>GRAND TOTAL:</span>
                    <span>₹903.00</span>
                  </div>
                </div>

                {/* Explicit Payment Mode */}
                <div className="py-1.5 border-b border-dashed border-stone-400 text-[10px] text-center font-black">
                  *** PAID VIA UPI ***
                </div>

                {/* Footer Messages */}
                <div className="pt-2 text-center text-[9px] text-stone-600 space-y-0.5">
                  <div className="font-semibold text-stone-800">{settings.footerMessage}</div>
                  <div className="text-[8px] text-stone-500">FSSAI Lic: {settings.fssai || "11523001000452"}</div>
                  <div className="text-[8px] text-stone-400 pt-1">*** Tableline POS India ***</div>
                </div>
              </div>
            )}
          </div>

          <p className="text-[11px] text-muted-foreground text-center">
            Prints automatically on thermal receipt printers (Epson, Star, Sunmi, Xprinter) and standard desktop printers.
          </p>
        </div>
      </div>
    </div>
  );
}
