import React from "react";
import {
  TablelineLoader,
  TablelinePageLoader,
  TablelineInlineLoader,
  TablelineSkeleton,
  TablelineSymbol,
  type TablelineLoaderProps,
} from "./TablelineLoading";

export {
  TablelineLoader,
  TablelinePageLoader,
  TablelineInlineLoader,
  TablelineSkeleton,
  TablelineSymbol,
};

interface LegacyLoaderProps {
  message?: string;
  subtext?: string;
  restaurantName?: string;
  tableNumber?: string;
  className?: string;
  onRetry?: () => void;
}

/**
 * Customer QR Digital Menu Loader
 * Employs Tableline's signature Table → Order → Service symbol.
 */
export function CustomerMenuLoader({
  message = "Preparing your menu…",
  subtext,
  restaurantName,
  tableNumber,
  className = "",
  onRetry,
}: LegacyLoaderProps) {
  return (
    <div
      className={`min-h-[70vh] flex flex-col items-center justify-center p-6 bg-[#FAF6F0] dark:bg-[#141211] text-[#241B16] dark:text-[#FBF8F2] ${className}`}
      id="customer-menu-loader"
    >
      <TablelineLoader
        variant="page"
        size="lg"
        message={message}
        subtext={subtext}
        restaurantName={restaurantName}
        tableNumber={tableNumber}
        onRetry={onRetry}
      />
    </div>
  );
}

/**
 * Operational Workspace Loader for Owner Dashboard & Live Floor
 */
export function OwnerWorkspaceLoader({
  message = "Loading your restaurant…",
  subtext = "Connecting to live floor, kitchen and orders…",
  className = "",
  onRetry,
}: LegacyLoaderProps) {
  return (
    <div
      className={`flex min-h-[420px] flex-col items-center justify-center p-8 text-center ${className}`}
      id="owner-workspace-loader"
    >
      <TablelineLoader
        variant="page"
        size="lg"
        message={message}
        subtext={subtext}
        onRetry={onRetry}
      />
    </div>
  );
}

/**
 * Platform Admin Loader
 */
export function PlatformAdminLoader({
  message = "Preparing admin workspace…",
  subtext = "Connecting to platform services…",
  className = "",
  onRetry,
}: LegacyLoaderProps) {
  return (
    <div
      className={`flex min-h-[380px] flex-col items-center justify-center p-8 text-center ${className}`}
      id="platform-admin-loader"
    >
      <TablelineLoader
        variant="card"
        size="md"
        message={message}
        subtext={subtext}
        onRetry={onRetry}
      />
    </div>
  );
}

/**
 * Login & Auth Workspace Loader
 */
export function LoginCafeLoader({
  message = "Opening your workspace…",
}: {
  message?: string;
}) {
  return (
    <div
      className="grid min-h-[100dvh] place-items-center bg-[#FAF6F0] dark:bg-[#141211] p-6 text-[#241B16] dark:text-[#FBF8F2]"
      id="login-cafe-loader"
    >
      <TablelineLoader
        variant="page"
        size="lg"
        message={message}
      />
    </div>
  );
}

/**
 * Compact inline loader for section-level data updates
 */
export function InlineCafeLoader({
  label = "Loading…",
  className = "",
}: {
  label?: string;
  className?: string;
}) {
  return (
    <TablelineInlineLoader
      message={label}
      className={className}
      size="sm"
    />
  );
}
