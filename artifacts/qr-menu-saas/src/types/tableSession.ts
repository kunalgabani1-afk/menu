/**
 * Table Firestore Interface & Session Types
 * Refactored to strictly bind guests to a temporary sessionId, eliminating the "Ghost Host" bug.
 */

export type TableStatus = 'empty' | 'active';

/**
 * Table Firestore Document Schema
 * Must include status ('empty' | 'active'), currentSessionId (nullable string), and hostDeviceId (nullable string).
 */
export interface TableFirestoreDoc {
  /** Unique table identifier or slug (e.g. "table_04", "t_uuid") */
  id: string;

  /** Numerical or display table number (e.g. "04", 4) */
  tableNumber: string | number;

  /**
   * Table Session Lifecycle Status:
   * - 'empty': Table is free. The next QR scan will claim host and initialize a fresh session.
   * - 'active': An active dining session is in progress with an assigned currentSessionId.
   */
  status: TableStatus;

  /**
   * Temporary unique session identifier (e.g. "sess_1727839200000_x9a8").
   * Nullable string. Set to null when session is closed.
   */
  currentSessionId: string | null;

  /**
   * Device ID of the guest who claimed Host status on an empty table scan.
   * Nullable string. Set to null when table is reset to 'empty'.
   */
  hostDeviceId: string | null;

  /** Optional name of the Host (e.g. "Vivek", "Guest Host") */
  hostName?: string | null;

  /** Timestamp in ms when the session was created */
  sessionStartedAt?: number | null;

  /** Timestamp in ms when the session was terminated / settled */
  sessionEndedAt?: number | null;

  /** Physical floor or section name (e.g. "Ground", "Rooftop") */
  location?: string | null;

  /** Parent restaurant slug */
  restaurantSlug?: string;

  /** Parent restaurant ID */
  restaurantId?: string;

  /** Last modified timestamp */
  updatedAt?: number | null;

  /** Legacy active flag for menu availability */
  active?: boolean;
}

export interface TableSessionState {
  tableId: string;
  tableNumber: string;
  status: TableStatus;
  currentSessionId: string | null;
  hostDeviceId: string | null;
  isHost: boolean;
  isSessionActive: boolean;
  isSessionClosed: boolean;
  sessionStartedAt: number | null;
  isLoading: boolean;
  error: string | null;
}
