import { type PlanId } from "./plans";

export type SubscriptionStatus = "ACTIVE" | "GRACE_PERIOD" | "PAST_DUE" | "DEACTIVATED";
export type SubscriptionPaymentStatus = "VERIFIED" | "SUBMITTED" | "DUE_SOON" | "PENDING";
export type ManualPaymentMethod = "UPI" | "BANK_TRANSFER" | "CASH";

export interface PendingPaymentSubmission {
  paymentMethod: ManualPaymentMethod;
  transactionReference: string;
  amount: number;
  notes?: string;
  submittedAt: number;
  submittedBy?: string;
}

export interface PaymentHistoryRecord {
  paymentId: string;
  restaurantId: string;
  restaurantSlug: string;
  restaurantName: string;
  plan: PlanId;
  amount: number;
  paymentMethod: ManualPaymentMethod;
  transactionReference: string;
  notes?: string;
  submittedAt: number;
  verifiedAt: number;
  verifiedBy: string;
  billingPeriodStart: number;
  billingPeriodEnd: number;
  status: "VERIFIED";
}

export interface SubscriptionData {
  plan: PlanId;
  status: SubscriptionStatus;
  paymentStatus: SubscriptionPaymentStatus;
  subscriptionStart: number;
  currentPeriodEnd: number;
  gracePeriodEnd: number;
  lastPaymentVerifiedAt?: number;
  pendingSubmission?: PendingPaymentSubmission | null;
  reminder?: {
    type: "7_DAYS_BEFORE" | "3_DAYS_BEFORE" | "DUE_TODAY" | "GRACE_PERIOD" | "PAST_DUE" | null;
    daysRemaining: number;
    renewalAmount: number;
    message: string;
  } | null;
}

export const TABLELINE_PAYMENT_DETAILS = {
  upiId: "tableline.pay@icici",
  bankName: "HDFC Bank",
  accountName: "Tableline Technologies Pvt Ltd",
  accountNumber: "50200084729104",
  ifscCode: "HDFC0001234",
  branch: "Connaught Place, New Delhi",
};
