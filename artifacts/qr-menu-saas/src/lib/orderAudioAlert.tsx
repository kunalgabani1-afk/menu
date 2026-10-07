// Centralized Audio Alert & Notification Engine for Tableline
// Handles browser autoplay unlock, cross-component deduplication, volume presets,
// and strict event routing for:
// 1. ORDER_NEEDS_APPROVAL (Orders workspace only)
// 2. ORDER_APPROVED_FOR_KDS (KDS workspace only)
// 3. WAITER_CALL (Waiter Call workspace only)

import React, { useState, useEffect } from "react";
import { toast } from "@/hooks/use-toast";

const SOUND_ENABLED_KEY = "tableline_order_sound_enabled";
const SOUND_VOLUME_KEY = "tableline_order_sound_volume";
const SOUND_PRESET_KEY = "tableline_order_sound_preset";
const ORDER_CHANNEL_KEY = "tableline_channel_orders_enabled";
const KITCHEN_CHANNEL_KEY = "tableline_channel_kitchen_enabled";
const WAITER_CHANNEL_KEY = "tableline_channel_waiter_enabled";

export type SoundVolumeLevel = "muted" | "low" | "standard" | "high";

export const VOLUME_LEVELS: Record<SoundVolumeLevel, { label: string; volume: number; description: string }> = {
  muted: { label: "Muted", volume: 0.0, description: "Silent alerts (visual only)" },
  low: { label: "Low", volume: 0.35, description: "Subtle background chimes" },
  standard: { label: "Standard Volume", volume: 0.7, description: "Clear, attention-grabbing chime (Default)" },
  high: { label: "High", volume: 1.0, description: "Loud chime for busy environments" },
};

export type NotificationEventType =
  | "ORDER_NEEDS_APPROVAL"
  | "ORDER_APPROVED_FOR_KDS"
  | "WAITER_CALL";

export interface TablelineNotificationEvent {
  eventId: string;
  eventType: NotificationEventType;
  restaurantId: string;
  restaurantSlug: string;
  createdAt: string;
  orderId?: string;
  orderNumber?: number | string;
  tableId?: string;
  tableNumber?: string;
  itemsCount?: number;
  total?: number;
  currency?: string;
  serviceType?: string;
  notes?: string;
  requestId?: string;
}

export type WorkspaceChannel = "orders" | "kds" | "waiter-calls" | "overview" | "all";

// Generates an in-memory Data URI WAV audio beep fallback so audio can play even if Web Audio suspended
function createToneWavDataUri(freq1: number, freq2: number, durationSec: number = 0.5): string {
  if (typeof window === "undefined") return "";
  try {
    const sampleRate = 22050;
    const numSamples = Math.floor(sampleRate * durationSec);
    const buffer = new ArrayBuffer(44 + numSamples * 2);
    const view = new DataView(buffer);

    // RIFF identifier
    view.setUint32(0, 0x52494646, false); // "RIFF"
    view.setUint32(4, 36 + numSamples * 2, true);
    view.setUint32(8, 0x57415645, false); // "WAVE"
    // format chunk
    view.setUint32(12, 0x666d7420, false); // "fmt "
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true); // PCM
    view.setUint16(22, 1, true); // Mono
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true);
    view.setUint16(32, 2, true); // block align
    view.setUint16(34, 16, true); // bits per sample
    // data chunk
    view.setUint32(36, 0x64617461, false); // "data"
    view.setUint32(40, numSamples * 2, true);

    const half = Math.floor(numSamples / 2);
    for (let i = 0; i < numSamples; i++) {
      const t = i / sampleRate;
      const f = i < half ? freq1 : freq2;
      const decay = Math.exp(-3 * (i / numSamples));
      const sample = Math.sin(2 * Math.PI * f * t) * decay * 0.5;
      const intSample = Math.max(-32768, Math.min(32767, Math.floor(sample * 32767)));
      view.setInt16(44 + i * 2, intSample, true);
    }

    const bytes = new Uint8Array(buffer);
    let binary = "";
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return `data:audio/wav;base64,${btoa(binary)}`;
  } catch {
    return "";
  }
}

class CentralNotificationManager {
  private ctx: AudioContext | null = null;
  private lastPlayedAt = 0;
  private isMuted = false;
  private volume = 0.7; // Standard default volume (0.0 to 1.0)
  private volumeLevel: SoundVolumeLevel = "standard";

  // Individual Logical Channels
  private orderAlertsEnabled = true;
  private kitchenAlertsEnabled = true;
  private waiterAlertsEnabled = true;

  // Current Workspace Context
  private currentWorkspace: WorkspaceChannel = "all";

  // Event Deduplication: composite key tracking
  private playedEventKeys = new Set<string>();

  // Active toast dismiss functions keyed by orderId / orderNumber
  private activeOrderToasts = new Map<string, () => void>();

  // Subscribers for audio status changes
  private subscribers = new Set<() => void>();

  // SSE Stream Management
  private activeEventSource: EventSource | null = null;
  private connectedSlug: string | null = null;

  // Event Listeners for components
  private refreshListeners = new Set<() => void>();
  private orderNeedsApprovalListeners = new Set<(event: TablelineNotificationEvent) => void>();
  private orderApprovedListeners = new Set<(event: TablelineNotificationEvent) => void>();
  private waiterCallListeners = new Set<(event: TablelineNotificationEvent) => void>();
  private newOrderListeners = new Set<(order: any) => void>();

  // Pre-generated fallback audio data URIs
  private orderWavUri: string = "";
  private kitchenWavUri: string = "";
  private waiterWavUri: string = "";

  constructor() {
    if (typeof window !== "undefined") {
      const savedMuted = localStorage.getItem(SOUND_ENABLED_KEY);
      this.isMuted = savedMuted === "false";

      const savedPreset = localStorage.getItem(SOUND_PRESET_KEY) as SoundVolumeLevel | null;
      if (savedPreset && VOLUME_LEVELS[savedPreset]) {
        this.volumeLevel = savedPreset;
        this.volume = VOLUME_LEVELS[savedPreset].volume;
      } else {
        const savedVolume = localStorage.getItem(SOUND_VOLUME_KEY);
        if (savedVolume !== null) {
          const parsed = parseFloat(savedVolume);
          if (!isNaN(parsed) && parsed >= 0 && parsed <= 1) {
            this.volume = parsed;
            this.volumeLevel = this.getNearestPreset(parsed);
          }
        }
      }

      this.orderAlertsEnabled = localStorage.getItem(ORDER_CHANNEL_KEY) !== "false";
      this.kitchenAlertsEnabled = localStorage.getItem(KITCHEN_CHANNEL_KEY) !== "false";
      this.waiterAlertsEnabled = localStorage.getItem(WAITER_CHANNEL_KEY) !== "false";

      // Initialize fallback audio clips
      try {
        this.orderWavUri = createToneWavDataUri(784, 1046.5, 0.45);
        this.kitchenWavUri = createToneWavDataUri(1046.5, 1318.5, 0.4);
        this.waiterWavUri = createToneWavDataUri(880, 1174.6, 0.5);
      } catch {}

      // Eagerly inspect AudioContext state so isAudioBlocked reflects accurately
      try {
        const AudioCtxClass =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        if (AudioCtxClass) {
          this.ctx = new AudioCtxClass();
        }
      } catch {}

      // Global capture-phase user gesture listeners to unlock AudioContext seamlessly
      const gestureUnlock = () => {
        this.unlock();
      };

      const eventTypes = ["click", "pointerdown", "touchstart", "touchend", "keydown", "focus"];
      eventTypes.forEach((evt) => {
        window.addEventListener(evt, gestureUnlock, { capture: true, passive: true });
        document.addEventListener(evt, gestureUnlock, { capture: true, passive: true });
      });
    }
  }

  private getNearestPreset(vol: number): SoundVolumeLevel {
    if (vol <= 0.05) return "muted";
    if (vol < 0.5) return "low";
    if (vol < 0.85) return "standard";
    return "high";
  }

  private notifySubscribers() {
    this.subscribers.forEach((fn) => {
      try {
        fn();
      } catch {}
    });
  }

  public subscribe(listener: () => void): () => void {
    this.subscribers.add(listener);
    return () => {
      this.subscribers.delete(listener);
    };
  }

  public onDataRefresh(listener: () => void): () => void {
    this.refreshListeners.add(listener);
    return () => {
      this.refreshListeners.delete(listener);
    };
  }

  public onOrderNeedsApproval(listener: (event: TablelineNotificationEvent) => void): () => void {
    this.orderNeedsApprovalListeners.add(listener);
    return () => {
      this.orderNeedsApprovalListeners.delete(listener);
    };
  }

  public onOrderApprovedForKds(listener: (event: TablelineNotificationEvent) => void): () => void {
    this.orderApprovedListeners.add(listener);
    return () => {
      this.orderApprovedListeners.delete(listener);
    };
  }

  public onWaiterCall(listener: (event: TablelineNotificationEvent) => void): () => void {
    this.waiterCallListeners.add(listener);
    return () => {
      this.waiterCallListeners.delete(listener);
    };
  }

  public onNewOrder(listener: (order: any) => void): () => void {
    this.newOrderListeners.add(listener);
    return () => {
      this.newOrderListeners.delete(listener);
    };
  }

  private getContext(): AudioContext | null {
    if (typeof window === "undefined") return null;
    if (!this.ctx) {
      const AudioCtxClass =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtxClass) {
        this.ctx = new AudioCtxClass();
      }
    }
    return this.ctx;
  }

  public isUnlocked(): boolean {
    return Boolean(this.ctx && this.ctx.state === "running");
  }

  public isAudioBlocked(): boolean {
    if (typeof window === "undefined") return false;
    if (this.isMuted || this.volume <= 0) return false;
    const ctx = this.getContext();
    if (!ctx) return false;
    return ctx.state !== "running";
  }

  public async unlock(): Promise<boolean> {
    const ctx = this.getContext();
    if (!ctx) return false;
    try {
      if (ctx.state === "suspended") {
        await ctx.resume();
      }
      const isRunning = ctx.state === "running";
      if (isRunning) {
        this.notifySubscribers();
      }
      return isRunning;
    } catch {
      return false;
    }
  }

  public isSoundEnabled(): boolean {
    return !this.isMuted && this.volume > 0;
  }

  public isAudioEnabled(): boolean {
    return this.isSoundEnabled();
  }

  public setSoundEnabled(enabled: boolean): void {
    this.isMuted = !enabled;
    if (typeof window !== "undefined") {
      localStorage.setItem(SOUND_ENABLED_KEY, enabled ? "true" : "false");
    }
    if (enabled) {
      if (this.volume <= 0) {
        this.volume = 0.7;
        this.volumeLevel = "standard";
        if (typeof window !== "undefined") {
          localStorage.setItem(SOUND_VOLUME_KEY, "0.7");
          localStorage.setItem(SOUND_PRESET_KEY, "standard");
        }
      }
      this.unlock();
    } else {
      this.volumeLevel = "muted";
    }
    this.notifySubscribers();
  }

  public setAudioEnabled(enabled: boolean): void {
    this.setSoundEnabled(enabled);
  }

  public getVolume(): number {
    return this.isMuted ? 0 : this.volume;
  }

  public getVolumeLevel(): SoundVolumeLevel {
    if (this.isMuted || this.volume <= 0) return "muted";
    return this.volumeLevel;
  }

  public setVolumeLevel(level: SoundVolumeLevel): void {
    this.volumeLevel = level;
    if (level === "muted") {
      this.isMuted = true;
      if (typeof window !== "undefined") {
        localStorage.setItem(SOUND_ENABLED_KEY, "false");
        localStorage.setItem(SOUND_PRESET_KEY, "muted");
      }
    } else {
      this.isMuted = false;
      this.volume = VOLUME_LEVELS[level].volume;
      if (typeof window !== "undefined") {
        localStorage.setItem(SOUND_ENABLED_KEY, "true");
        localStorage.setItem(SOUND_VOLUME_KEY, String(this.volume));
        localStorage.setItem(SOUND_PRESET_KEY, level);
      }
      this.unlock();
    }
    this.notifySubscribers();
  }

  public setVolume(vol: number): void {
    const clamped = Math.max(0, Math.min(1, vol));
    this.volume = clamped;
    this.volumeLevel = this.getNearestPreset(clamped);

    if (typeof window !== "undefined") {
      localStorage.setItem(SOUND_VOLUME_KEY, String(clamped));
      localStorage.setItem(SOUND_PRESET_KEY, this.volumeLevel);
    }

    if (clamped <= 0) {
      this.isMuted = true;
      if (typeof window !== "undefined") localStorage.setItem(SOUND_ENABLED_KEY, "false");
    } else {
      this.isMuted = false;
      if (typeof window !== "undefined") localStorage.setItem(SOUND_ENABLED_KEY, "true");
      this.unlock();
    }
    this.notifySubscribers();
  }

  // Logical Channel Controls
  public isOrderAlertsEnabled(): boolean {
    return this.orderAlertsEnabled && this.isSoundEnabled();
  }
  public setOrderAlertsEnabled(enabled: boolean): void {
    this.orderAlertsEnabled = enabled;
    if (typeof window !== "undefined") localStorage.setItem(ORDER_CHANNEL_KEY, String(enabled));
    this.notifySubscribers();
  }

  public isKitchenAlertsEnabled(): boolean {
    return this.kitchenAlertsEnabled && this.isSoundEnabled();
  }
  public setKitchenAlertsEnabled(enabled: boolean): void {
    this.kitchenAlertsEnabled = enabled;
    if (typeof window !== "undefined") localStorage.setItem(KITCHEN_CHANNEL_KEY, String(enabled));
    this.notifySubscribers();
  }

  public isWaiterAlertsEnabled(): boolean {
    return this.waiterAlertsEnabled && this.isSoundEnabled();
  }
  public setWaiterAlertsEnabled(enabled: boolean): void {
    this.waiterAlertsEnabled = enabled;
    if (typeof window !== "undefined") localStorage.setItem(WAITER_CHANNEL_KEY, String(enabled));
    this.notifySubscribers();
  }

  // Active Workspace Context
  public setActiveWorkspace(workspace: WorkspaceChannel): void {
    this.currentWorkspace = workspace;
  }

  public getActiveWorkspace(): WorkspaceChannel {
    return this.currentWorkspace;
  }

  /**
   * Deduplication tracking
   */
  public hasEventBeenProcessed(key: string): boolean {
    return this.playedEventKeys.has(key);
  }

  public recordEventProcessed(key: string): void {
    this.playedEventKeys.add(key);
    if (this.playedEventKeys.size > 2000) {
      const toRemove = Array.from(this.playedEventKeys).slice(0, 500);
      toRemove.forEach((k) => this.playedEventKeys.delete(k));
    }
  }

  /**
   * Marks initial orders and waiter calls loaded at mount time so NO historical sound
   * plays on page load or refresh.
   */
  public markInitialRecordsSeen(
    orders?: Array<string | number | { id?: string | number; orderNumber?: string | number; status?: string }>,
    waiterRequests?: Array<string | number | { id?: string | number; tableNumber?: string | number; status?: string }>,
  ): void {
    if (Array.isArray(orders)) {
      orders.forEach((item) => {
        const idStr = typeof item === "object" && item ? String(item.id || "") : String(item || "");
        if (idStr) {
          this.recordEventProcessed(`init_seen_order:${idStr}`);
        }
      });
    }

    if (Array.isArray(waiterRequests)) {
      waiterRequests.forEach((item) => {
        const idStr = typeof item === "object" && item ? String(item.id || "") : String(item || "");
        if (idStr) {
          this.recordEventProcessed(`init_seen_waiter:${idStr}`);
        }
      });
    }
  }

  public markInitialOrdersSeen(orders: Array<string | number | { id?: string | number; orderNumber?: string | number; status?: string }>): void {
    this.markInitialRecordsSeen(orders, undefined);
  }

  /**
   * Connect to Server-Authoritative Realtime SSE Stream for the restaurant.
   * Single connection shared across workspaces.
   */
  public connect(restaurantSlug: string): void {
    if (typeof window === "undefined" || !restaurantSlug) return;
    if (this.activeEventSource && this.connectedSlug === restaurantSlug) return;

    if (this.activeEventSource) {
      try {
        this.activeEventSource.close();
      } catch {}
      this.activeEventSource = null;
    }

    this.connectedSlug = restaurantSlug;

    try {
      const es = new EventSource(`/api/restaurants/${restaurantSlug}/orders/stream`);
      this.activeEventSource = es;

      // Authoritative central notification event handler
      es.addEventListener("notification_event", (e: MessageEvent) => {
        try {
          const rawEvent = JSON.parse(e.data);
          this.handleIncomingNotificationEvent(rawEvent);
        } catch (err) {
          console.warn("[Tableline Notification] Error parsing notification_event:", err);
        }
      });

      // Typed SSE events fallback
      es.addEventListener("order_needs_approval", (e: MessageEvent) => {
        try {
          const rawEvent = JSON.parse(e.data);
          this.handleIncomingNotificationEvent({ ...rawEvent, eventType: "ORDER_NEEDS_APPROVAL" });
        } catch {}
      });

      es.addEventListener("order_approved_for_kds", (e: MessageEvent) => {
        try {
          const rawEvent = JSON.parse(e.data);
          this.handleIncomingNotificationEvent({ ...rawEvent, eventType: "ORDER_APPROVED_FOR_KDS" });
        } catch {}
      });

      es.addEventListener("waiter_call", (e: MessageEvent) => {
        try {
          const rawEvent = JSON.parse(e.data);
          this.handleIncomingNotificationEvent({ ...rawEvent, eventType: "WAITER_CALL" });
        } catch {}
      });

      // Data refreshing listeners
      es.addEventListener("order_status_updated", () => {
        this.triggerDataRefresh();
      });

      es.addEventListener("new_order", (e: MessageEvent) => {
        try {
          const raw = JSON.parse(e.data);
          const order = raw?.order || raw;
          if (order && order.id) {
            this.newOrderListeners.forEach((fn) => {
              try {
                fn(order);
              } catch {}
            });
          }
        } catch {}
        this.triggerDataRefresh();
      });

      es.addEventListener("waiter_request", (e: MessageEvent) => {
        try {
          const req = JSON.parse(e.data);
          // If server didn't emit notification_event, dispatch fallback
          const fallbackEventId = `evt_wcall_${req.id || Date.now()}`;
          if (!this.hasEventBeenProcessed(`${this.connectedSlug}:WAITER_CALL:${fallbackEventId}`)) {
            this.handleIncomingNotificationEvent({
              eventId: fallbackEventId,
              eventType: "WAITER_CALL",
              restaurantId: req.restaurantId || this.connectedSlug || "",
              restaurantSlug: this.connectedSlug || "",
              requestId: req.id,
              tableId: req.tableId,
              tableNumber: req.tableNumber,
              serviceType: req.serviceType,
              notes: req.notes,
              createdAt: new Date().toISOString(),
            });
          }
        } catch {}
        this.triggerDataRefresh();
      });

      es.addEventListener("waiter_request_updated", () => {
        this.triggerDataRefresh();
      });

      es.onerror = () => {
        // EventSource will automatically reconnect
      };
    } catch (err) {
      console.warn("[Tableline Notification] Failed to initialize EventSource stream:", err);
    }
  }

  public disconnect(): void {
    if (this.activeEventSource) {
      try {
        this.activeEventSource.close();
      } catch {}
      this.activeEventSource = null;
      this.connectedSlug = null;
    }
  }

  private triggerDataRefresh(): void {
    this.refreshListeners.forEach((fn) => {
      try {
        fn();
      } catch {}
    });
  }

  /**
   * Authoritative Core Event Dispatcher
   * Implements strict deduplication, tenant isolation, workspace routing, and sound rules.
   */
  public handleIncomingNotificationEvent(event: Partial<TablelineNotificationEvent>): void {
    if (!event || !event.eventType) return;

    const eventType = event.eventType as NotificationEventType;
    const eventId = String(event.eventId || `evt_${Date.now()}`);
    const restId = String(event.restaurantId || event.restaurantSlug || this.connectedSlug || "");
    const orderId = event.orderId ? String(event.orderId) : "";
    const orderNumber = event.orderNumber !== undefined && event.orderNumber !== null ? String(event.orderNumber) : "";
    const requestId = event.requestId ? String(event.requestId) : "";
    const tableNumber = String(event.tableNumber || event.tableId || "—");

    // Deduplication Key: restaurantId + eventType + eventId
    const dedupKey = `${restId}:${eventType}:${eventId}`;

    if (this.hasEventBeenProcessed(dedupKey)) {
      return;
    }
    this.recordEventProcessed(dedupKey);

    const fullEvent: TablelineNotificationEvent = {
      eventId,
      eventType,
      restaurantId: restId,
      restaurantSlug: event.restaurantSlug || this.connectedSlug || "",
      createdAt: event.createdAt || new Date().toISOString(),
      orderId,
      orderNumber: event.orderNumber,
      tableId: event.tableId,
      tableNumber,
      itemsCount: event.itemsCount,
      total: event.total,
      currency: event.currency || "₹",
      serviceType: event.serviceType,
      notes: event.notes,
      requestId,
    };

    // ROUTING RULE 1: ORDER_NEEDS_APPROVAL
    if (eventType === "ORDER_NEEDS_APPROVAL") {
      this.routeOrderNeedsApproval(fullEvent);
    }
    // ROUTING RULE 2: ORDER_APPROVED_FOR_KDS
    else if (eventType === "ORDER_APPROVED_FOR_KDS") {
      this.routeOrderApprovedForKds(fullEvent);
    }
    // ROUTING RULE 3: WAITER_CALL
    else if (eventType === "WAITER_CALL") {
      this.routeWaiterCall(fullEvent);
    }

    // Notify data refresh listeners
    this.triggerDataRefresh();
  }

  /**
   * 1. CUSTOMER ORDER -> NEEDS APPROVAL
   * Orders page: SOUND ONCE, NOTIFICATION with ORDER NUMBER visible.
   * KDS page: SOUND NO, NOTIFICATION NO, ORDER NUMBER NO.
   */
  private routeOrderNeedsApproval(event: TablelineNotificationEvent): void {
    const ws = this.currentWorkspace;

    // Strict KDS Isolation: KDS MUST NOT receive sound, notification, or order number before approval!
    if (ws === "kds") {
      return;
    }

    // Play order sound ONCE (only for Orders workspace or overview dashboard)
    if (this.isOrderAlertsEnabled()) {
      this.playOrdersChimeSound();
    }

    // Format display data
    const rawTable = String(event.tableNumber || "—");
    const formattedTable = /^\d+$/.test(rawTable) ? `Table ${rawTable.padStart(2, "0")}` : `Table ${rawTable}`;
    const itemsCount = event.itemsCount || 1;
    const itemsText = `${itemsCount} item${itemsCount !== 1 ? "s" : ""}`;
    const totalText = `${event.currency || "₹"}${event.total ?? 0}`;
    const orderNumText = event.orderNumber ? `Order #${event.orderNumber}` : "New Order";

    // Show premium Tableline notification with visible Order Number
    const toastHandle = toast({
      title: "🔔 New Order",
      description: (
        <div className="mt-1 space-y-1">
          <div className="flex items-center justify-between text-xs font-semibold text-[#2C1810] dark:text-[#FDF8F2]">
            <span className="font-bold text-[#C87D55]">{orderNumText}</span>
            <span>{formattedTable}</span>
          </div>
          <div className="text-[11px] text-[#5C4D44] dark:text-[#D5C7BC]">
            {itemsText} • {totalText}
          </div>
          <div className="inline-flex items-center text-[10px] font-semibold text-[#C87D55] bg-[#C87D55]/10 px-2 py-0.5 rounded-full">
            Needs Approval
          </div>
        </div>
      ),
      duration: 4500,
    });

    // Store active toast dismiss function so approval immediately resolves it!
    if (event.orderNumber) {
      this.activeOrderToasts.set(String(event.orderNumber), () => toastHandle.dismiss());
    }
    if (event.orderId) {
      this.activeOrderToasts.set(event.orderId, () => toastHandle.dismiss());
    }

    // Dispatch to registered components
    this.orderNeedsApprovalListeners.forEach((fn) => {
      try {
        fn(event);
      } catch {}
    });
  }

  /**
   * 2. ORDER APPROVAL -> KDS
   * Orders page: Resolves previous "Needs Approval" notification. Order sound STOPPED. NO new notification.
   * KDS page: ACTIVE approval notification with ORDER NUMBER visible. KDS sound PLAY ONCE.
   */
  private routeOrderApprovedForKds(event: TablelineNotificationEvent): void {
    // 1. Immediately resolve and dismiss previous "Needs Approval" notification from Orders state
    if (event.orderNumber) {
      const dismissByNum = this.activeOrderToasts.get(String(event.orderNumber));
      if (dismissByNum) {
        try {
          dismissByNum();
        } catch {}
        this.activeOrderToasts.delete(String(event.orderNumber));
      }
    }
    if (event.orderId) {
      const dismissById = this.activeOrderToasts.get(event.orderId);
      if (dismissById) {
        try {
          dismissById();
        } catch {}
        this.activeOrderToasts.delete(event.orderId);
      }
    }

    const ws = this.currentWorkspace;

    // Strict Orders Isolation: Orders page does NOT receive new approval notification or order sound!
    if (ws === "orders") {
      this.orderApprovedListeners.forEach((fn) => {
        try {
          fn(event);
        } catch {}
      });
      return;
    }

    // Play KDS Kitchen Sound ONCE (only for KDS workspace or overview dashboard)
    if (this.isKitchenAlertsEnabled()) {
      this.playKitchenChimeSound();
    }

    const rawTable = String(event.tableNumber || "—");
    const formattedTable = /^\d+$/.test(rawTable) ? `Table ${rawTable.padStart(2, "0")}` : `Table ${rawTable}`;
    const itemsCount = event.itemsCount || 1;
    const itemsText = `${itemsCount} item${itemsCount !== 1 ? "s" : ""}`;
    const totalText = `${event.currency || "₹"}${event.total ?? 0}`;
    const orderNumText = event.orderNumber ? `Order #${event.orderNumber}` : "Kitchen Order";

    // Show KDS notification with visible Order Number
    toast({
      title: "🔔 New Kitchen Order",
      description: (
        <div className="mt-1 space-y-1">
          <div className="flex items-center justify-between text-xs font-semibold text-[#2C1810] dark:text-[#FDF8F2]">
            <span className="font-bold text-[#C87D55]">{orderNumText}</span>
            <span>{formattedTable}</span>
          </div>
          <div className="text-[11px] text-[#5C4D44] dark:text-[#D5C7BC]">
            {itemsText} • {totalText}
          </div>
          <div className="inline-flex items-center text-[10px] font-semibold text-emerald-700 dark:text-emerald-300 bg-emerald-500/10 px-2 py-0.5 rounded-full">
            Send to Kitchen
          </div>
        </div>
      ),
      duration: 5000,
    });

    this.orderApprovedListeners.forEach((fn) => {
      try {
        fn(event);
      } catch {}
    });
  }

  /**
   * 3. WAITER CALL — COMPLETELY SEPARATE SOUND & NOTIFICATION
   * Prominently shows Table 07 (NO order number!).
   * Distinct concierge 2-bell sound pattern.
   * Multiple calls from different tables each play sound ONCE.
   */
  private routeWaiterCall(event: TablelineNotificationEvent): void {
    // Play distinct Waiter Call sound ONCE
    if (this.isWaiterAlertsEnabled()) {
      this.playWaiterCallChimeSound();
    }

    const rawTable = String(event.tableNumber || event.tableId || "—");
    const formattedTable = /^\d+$/.test(rawTable) ? `Table ${rawTable.padStart(2, "0")}` : `Table ${rawTable}`;
    const detail = event.notes || event.serviceType || "Customer needs assistance";

    // Prominently show Table number. Do NOT show an order number because this is not an order event!
    toast({
      title: "🔔 Waiter Call",
      description: (
        <div className="mt-1 space-y-0.5">
          <div className="text-sm font-bold text-[#2C1810] dark:text-[#FDF8F2]">
            {formattedTable}
          </div>
          <div className="text-xs text-[#5C4D44] dark:text-[#D5C7BC]">
            {detail}
          </div>
          <div className="text-[10px] text-[#8C7A6B]">
            Just now
          </div>
        </div>
      ),
      duration: 5000,
    });

    this.waiterCallListeners.forEach((fn) => {
      try {
        fn(event);
      } catch {}
    });
  }

  // --- MANUAL SOUND TRIGGERS ---
  public playNewOrderAlert(orderId?: string | number, eventType: string = "NEEDS_APPROVAL"): boolean {
    if (!this.isOrderAlertsEnabled()) return false;

    if (orderId) {
      const key = `manual:${orderId}:${eventType}`;
      if (this.hasEventBeenProcessed(key)) return false;
      this.recordEventProcessed(key);
    }

    const nowTime = Date.now();
    if (nowTime - this.lastPlayedAt < 300) return false;
    this.lastPlayedAt = nowTime;

    this.playOrdersChimeSound();
    return true;
  }

  public playKitchenApprovedAlert(orderId?: string | number): boolean {
    if (!this.isKitchenAlertsEnabled()) return false;

    if (orderId) {
      const key = `manual:${orderId}:APPROVED`;
      if (this.hasEventBeenProcessed(key)) return false;
      this.recordEventProcessed(key);
    }

    const nowTime = Date.now();
    if (nowTime - this.lastPlayedAt < 300) return false;
    this.lastPlayedAt = nowTime;

    this.playKitchenChimeSound();
    return true;
  }

  public playLoudKitchenOrderAlert(orderId?: string | number): boolean {
    return this.playKitchenApprovedAlert(orderId);
  }

  public playWaiterCallAlert(requestId?: string | number): boolean {
    if (!this.isWaiterAlertsEnabled()) return false;

    if (requestId) {
      const key = `manual:${requestId}:WAIT_CALL`;
      if (this.hasEventBeenProcessed(key)) return false;
      this.recordEventProcessed(key);
    }

    const nowTime = Date.now();
    if (nowTime - this.lastPlayedAt < 300) return false;
    this.lastPlayedAt = nowTime;

    this.playWaiterCallChimeSound();
    return true;
  }

  public async testSound(): Promise<void> {
    await this.unlock();
    this.playOrdersChimeSound();
  }

  public async testKitchenSound(): Promise<void> {
    await this.unlock();
    this.playKitchenChimeSound();
  }

  public async testWaiterSound(): Promise<void> {
    await this.unlock();
    this.playWaiterCallChimeSound();
  }

  public async testLoudSound(): Promise<void> {
    await this.unlock();
    this.playKitchenChimeSound();
  }

  public playTestChime(): Promise<void> {
    return this.testSound();
  }

  // --- AUDIO PLAYBACK WITH RESUME HANDLING & FALLBACK ---

  private playHtmlAudioFallback(type: "orders" | "kitchen" | "waiter"): void {
    if (typeof window === "undefined" || this.isMuted || this.volume <= 0) return;
    try {
      let uri = this.orderWavUri;
      if (type === "kitchen") uri = this.kitchenWavUri;
      if (type === "waiter") uri = this.waiterWavUri;
      if (!uri) return;

      const audio = new Audio(uri);
      audio.volume = Math.max(0, Math.min(1, this.volume));
      audio.play().catch(() => {});
    } catch {}
  }

  /**
   * Sound 1: Elegant, warm, ascending chime for Orders Dashboard
   * (High G5 -> C6 ascending chime with warm harmonic sparkle)
   */
  private playOrdersChimeSound(): void {
    const ctx = this.getContext();
    if (!ctx) {
      this.playHtmlAudioFallback("orders");
      return;
    }

    if (ctx.state === "suspended") {
      ctx.resume().then(() => {
        this.renderOrdersChime(ctx);
      }).catch(() => {
        this.playHtmlAudioFallback("orders");
      });
      return;
    }

    this.renderOrdersChime(ctx);
  }

  private renderOrdersChime(ctx: AudioContext): void {
    try {
      const t = ctx.currentTime;
      const master = ctx.createGain();
      master.gain.setValueAtTime(0.6 * this.volume, t);
      master.connect(ctx.destination);

      // Primary High Bell G5 -> C6
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.type = "sine";
      osc1.frequency.setValueAtTime(784, t); // G5
      osc1.frequency.exponentialRampToValueAtTime(1046.5, t + 0.08); // Ascend to C6

      gain1.gain.setValueAtTime(0.65, t);
      gain1.gain.exponentialRampToValueAtTime(0.001, t + 0.7);

      osc1.connect(gain1);
      gain1.connect(master);
      osc1.start(t);
      osc1.stop(t + 0.7);

      // Harmonic Sparkle E6 Accent after 130ms
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = "triangle";
      osc2.frequency.setValueAtTime(1318.5, t + 0.13); // E6

      gain2.gain.setValueAtTime(0.0001, t);
      gain2.gain.setValueAtTime(0.55, t + 0.13);
      gain2.gain.exponentialRampToValueAtTime(0.001, t + 0.9);

      osc2.connect(gain2);
      gain2.connect(master);
      osc2.start(t + 0.13);
      osc2.stop(t + 0.9);

      // Warm Sub-bell E5 foundation
      const osc3 = ctx.createOscillator();
      const gain3 = ctx.createGain();
      osc3.type = "sine";
      osc3.frequency.setValueAtTime(659.25, t + 0.13); // E5

      gain3.gain.setValueAtTime(0.0001, t);
      gain3.gain.setValueAtTime(0.35, t + 0.13);
      gain3.gain.exponentialRampToValueAtTime(0.001, t + 0.8);

      osc3.connect(gain3);
      gain3.connect(master);
      osc3.start(t + 0.13);
      osc3.stop(t + 0.8);
    } catch (e) {
      console.warn("[Tableline Audio] Orders sound error:", e);
      this.playHtmlAudioFallback("orders");
    }
  }

  /**
   * Sound 2: Crisp, clear, dual-burst service bell for Kitchen / KDS
   */
  private playKitchenChimeSound(): void {
    const ctx = this.getContext();
    if (!ctx) {
      this.playHtmlAudioFallback("kitchen");
      return;
    }

    if (ctx.state === "suspended") {
      ctx.resume().then(() => {
        this.renderKitchenChime(ctx);
      }).catch(() => {
        this.playHtmlAudioFallback("kitchen");
      });
      return;
    }

    this.renderKitchenChime(ctx);
  }

  private renderKitchenChime(ctx: AudioContext): void {
    try {
      const t = ctx.currentTime;
      const master = ctx.createGain();
      master.gain.setValueAtTime(0.75 * this.volume, t);
      master.connect(ctx.destination);

      // Burst 1: High crisp triad (C6 + E6 + G6)
      [
        { freq: 1046.5, delay: 0, dur: 0.5, gain: 0.6 },
        { freq: 1318.5, delay: 0.04, dur: 0.55, gain: 0.55 },
        { freq: 1567.98, delay: 0.08, dur: 0.6, gain: 0.5 },
        // Burst 2: Second confirming tone after 200ms
        { freq: 1046.5, delay: 0.2, dur: 0.5, gain: 0.6 },
        { freq: 1318.5, delay: 0.24, dur: 0.55, gain: 0.55 },
        { freq: 1760.0, delay: 0.28, dur: 0.7, gain: 0.65 },
      ].forEach((tone) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(tone.freq, t + tone.delay);

        gain.gain.setValueAtTime(0.0001, t);
        gain.gain.setValueAtTime(tone.gain, t + tone.delay);
        gain.gain.exponentialRampToValueAtTime(0.001, t + tone.delay + tone.dur);

        osc.connect(gain);
        gain.connect(master);
        osc.start(t + tone.delay);
        osc.stop(t + tone.delay + tone.dur);
      });
    } catch (e) {
      console.warn("[Tableline Audio] Kitchen sound error:", e);
      this.playHtmlAudioFallback("kitchen");
    }
  }

  /**
   * Sound 3: Completely distinct 2-bell concierge desk chime for Waiter Call
   * (Resonant A5 880Hz -> bright D6 1175Hz with pure acoustic bell decay)
   */
  private playWaiterCallChimeSound(): void {
    const ctx = this.getContext();
    if (!ctx) {
      this.playHtmlAudioFallback("waiter");
      return;
    }

    if (ctx.state === "suspended") {
      ctx.resume().then(() => {
        this.renderWaiterCallChime(ctx);
      }).catch(() => {
        this.playHtmlAudioFallback("waiter");
      });
      return;
    }

    this.renderWaiterCallChime(ctx);
  }

  private renderWaiterCallChime(ctx: AudioContext): void {
    try {
      const t = ctx.currentTime;
      const master = ctx.createGain();
      master.gain.setValueAtTime(0.7 * this.volume, t);
      master.connect(ctx.destination);

      // Bell 1: Resonant front desk ding (A5 880Hz)
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.type = "sine";
      osc1.frequency.setValueAtTime(880, t);
      gain1.gain.setValueAtTime(0.7, t);
      gain1.gain.exponentialRampToValueAtTime(0.001, t + 0.45);
      osc1.connect(gain1);
      gain1.connect(master);
      osc1.start(t);
      osc1.stop(t + 0.45);

      // Bell 2: Bright harmonic response after 140ms (D6 1174.6Hz)
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = "sine";
      osc2.frequency.setValueAtTime(1174.6, t + 0.14);
      gain2.gain.setValueAtTime(0.0001, t);
      gain2.gain.setValueAtTime(0.75, t + 0.14);
      gain2.gain.exponentialRampToValueAtTime(0.001, t + 0.75);
      osc2.connect(gain2);
      gain2.connect(master);
      osc2.start(t + 0.14);
      osc2.stop(t + 0.75);

      // Subtle metallic overtone (F#6 1480Hz) for authentic concierge bell shimmer
      const osc3 = ctx.createOscillator();
      const gain3 = ctx.createGain();
      osc3.type = "triangle";
      osc3.frequency.setValueAtTime(1479.98, t + 0.14);
      gain3.gain.setValueAtTime(0.0001, t);
      gain3.gain.setValueAtTime(0.35, t + 0.14);
      gain3.gain.exponentialRampToValueAtTime(0.001, t + 0.55);
      osc3.connect(gain3);
      gain3.connect(master);
      osc3.start(t + 0.14);
      osc3.stop(t + 0.55);
    } catch (e) {
      console.warn("[Tableline Audio] Waiter call sound error:", e);
      this.playHtmlAudioFallback("waiter");
    }
  }
}

export const orderAudioAlert = new CentralNotificationManager();
export const centralNotificationManager = orderAudioAlert;

/**
 * React hook to observe audio status, volume presets, channel toggles, and autoplay restrictions
 */
export function useAudioAlertStatus() {
  const [isSoundEnabled, setIsSoundEnabled] = useState(() => orderAudioAlert.isSoundEnabled());
  const [isBlocked, setIsBlocked] = useState(() => orderAudioAlert.isAudioBlocked());
  const [volume, setVolumeState] = useState(() => orderAudioAlert.getVolume());
  const [volumeLevel, setVolumeLevelState] = useState<SoundVolumeLevel>(() => orderAudioAlert.getVolumeLevel());
  const [orderAlertsEnabled, setOrderAlertsEnabledState] = useState(() => orderAudioAlert.isOrderAlertsEnabled());
  const [kitchenAlertsEnabled, setKitchenAlertsEnabledState] = useState(() => orderAudioAlert.isKitchenAlertsEnabled());
  const [waiterAlertsEnabled, setWaiterAlertsEnabledState] = useState(() => orderAudioAlert.isWaiterAlertsEnabled());

  useEffect(() => {
    const update = () => {
      setIsSoundEnabled(orderAudioAlert.isSoundEnabled());
      setIsBlocked(orderAudioAlert.isAudioBlocked());
      setVolumeState(orderAudioAlert.getVolume());
      setVolumeLevelState(orderAudioAlert.getVolumeLevel());
      setOrderAlertsEnabledState(orderAudioAlert.isOrderAlertsEnabled());
      setKitchenAlertsEnabledState(orderAudioAlert.isKitchenAlertsEnabled());
      setWaiterAlertsEnabledState(orderAudioAlert.isWaiterAlertsEnabled());
    };

    const unsubscribe = orderAudioAlert.subscribe(update);
    update();

    const interval = setInterval(update, 1500);
    return () => {
      unsubscribe();
      clearInterval(interval);
    };
  }, []);

  const unlock = async () => {
    const res = await orderAudioAlert.unlock();
    setIsBlocked(orderAudioAlert.isAudioBlocked());
    return res;
  };

  const testSound = async () => {
    await orderAudioAlert.testSound();
    setIsBlocked(orderAudioAlert.isAudioBlocked());
  };

  const testKitchenSound = async () => {
    await orderAudioAlert.testKitchenSound();
    setIsBlocked(orderAudioAlert.isAudioBlocked());
  };

  const testWaiterSound = async () => {
    await orderAudioAlert.testWaiterSound();
    setIsBlocked(orderAudioAlert.isAudioBlocked());
  };

  const toggleSound = (enabled: boolean) => {
    orderAudioAlert.setSoundEnabled(enabled);
    setIsSoundEnabled(enabled);
    setIsBlocked(orderAudioAlert.isAudioBlocked());
  };

  const setVolume = (vol: number) => {
    orderAudioAlert.setVolume(vol);
    setVolumeState(orderAudioAlert.getVolume());
    setVolumeLevelState(orderAudioAlert.getVolumeLevel());
  };

  const setVolumeLevel = (level: SoundVolumeLevel) => {
    orderAudioAlert.setVolumeLevel(level);
    setVolumeLevelState(level);
    setVolumeState(orderAudioAlert.getVolume());
    setIsSoundEnabled(orderAudioAlert.isSoundEnabled());
    setIsBlocked(orderAudioAlert.isAudioBlocked());
  };

  const setOrderAlerts = (enabled: boolean) => {
    orderAudioAlert.setOrderAlertsEnabled(enabled);
    setOrderAlertsEnabledState(enabled);
  };

  const setKitchenAlerts = (enabled: boolean) => {
    orderAudioAlert.setKitchenAlertsEnabled(enabled);
    setKitchenAlertsEnabledState(enabled);
  };

  const setWaiterAlerts = (enabled: boolean) => {
    orderAudioAlert.setWaiterAlertsEnabled(enabled);
    setWaiterAlertsEnabledState(enabled);
  };

  return {
    isSoundEnabled,
    isBlocked,
    volume,
    volumeLevel,
    orderAlertsEnabled,
    kitchenAlertsEnabled,
    waiterAlertsEnabled,
    setVolume,
    setVolumeLevel,
    setOrderAlerts,
    setKitchenAlerts,
    setWaiterAlerts,
    unlock,
    testSound,
    testKitchenSound,
    testWaiterSound,
    toggleSound,
  };
}
