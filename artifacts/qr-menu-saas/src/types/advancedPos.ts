/**
 * Advanced POS & Guest Hospitality Schema
 * Tableline / Khaata Desk - Classic Rich Indian Cafe POS
 */

export type CourseStatus = "NORMAL" | "HOLD" | "FIRED";
export type DishCategoryType = "BAKES_ESPRESSO" | "PLATES_MAINS" | "BEVERAGES" | "DESSERTS";

export interface PaymentBreakdown {
  cash: number;
  upi: number;
  card?: number;
  changeGiven?: number;
  tenderType: "FULL_UPI" | "FULL_CASH" | "SPLIT" | "CARD";
  settledAt: string; // ISO 8601
  settledByStaff?: string;
}

export interface MenuItemModifier {
  name: string;
  price: number;
}

export interface AdvancedMenuItem {
  id: string;
  restaurantId: string;
  name: string;
  description?: string;
  price: number;
  category: string;
  categoryType: DishCategoryType; // 'BAKES_ESPRESSO' | 'PLATES_MAINS'
  imageUrl?: string;
  isVeg: boolean;
  isAvailable: boolean;
  
  // Module 4: Highlight Reel
  is_highlighted?: boolean; // Exactly 4 items can be highlighted simultaneously
  highlight_tag?: string; // e.g. "Signature Pour", "Chef Special", "High-Margin Pick"
  highlight_order?: number; // 1, 2, 3, 4
  
  // Prep metadata
  standardPrepTimeMins: number; // e.g. 8 for espresso, 20 for mains
  station: "BARISTA" | "BAKERY" | "HOT_LINE" | "COLD_PREP";
}

export interface OrderItemCourse {
  menuItemId: string;
  name: string;
  price: number;
  quantity: number;
  category: string;
  categoryType: DishCategoryType;
  specialInstructions?: string | null;
  selectedModifiers?: Array<{
    groupId: string;
    groupName: string;
    optionId: string;
    optionName: string;
    price: number;
  }>;
  addedByDiner?: string;
  
  // Module 2: The Course Hold KDS State
  courseStatus: CourseStatus; // 'HOLD' for Plates/Mains until line cook fires
  firedAt?: number | null; // Unix timestamp
  firedByStaff?: string | null;
  readyAt?: number | null;
}

export interface AdvancedOrderTicket {
  order_id: string; // e.g. "T04_1042"
  restaurantId: string;
  tableId: string;
  tableNumber: string; // e.g. "04"
  dinerFirstName: string; // The "First Name Only" Anchor (e.g. "Vivek")
  total_bill: number;
  subtotal: number;
  taxes: number;
  status: "NEW" | "NEEDS_APPROVAL" | "APPROVED" | "PREPARING" | "READY" | "COMPLETED" | "settled" | "CANCELLED";
  paymentStatus: "PENDING" | "PAID" | "settled";
  
  // Module 5: Split Tender Breakdown
  payment_breakdown?: PaymentBreakdown;
  
  // Course-separated items
  items: OrderItemCourse[];
  
  // Module 1: Throttling & Wait Times
  estimatedWaitMins?: number;
  isKitchenThrottled?: boolean;
  
  // Warnings & Flags
  isHostBypassed?: boolean;
  warningTag?: string;
  customerNote?: string | null;
  
  createdAt: string; // ISO timestamp
  updatedAt: string;
}

export interface GallaDailySummary {
  date: string; // YYYY-MM-DD
  restaurantId: string;
  totalOrders: number;
  totalRevenue: number;
  expectedCashInDrawer: number; // Sum of payment_breakdown.cash
  totalUpiInBank: number;       // Sum of payment_breakdown.upi
  totalCard: number;
  unsettledAmount: number;
  discrepancyCash?: number;
}
