/**
 * Tableline Email Validation Utility
 *
 * Rules:
 * - Accept emails from legitimate mainstream providers (Gmail, Outlook, Yahoo, iCloud, Proton, etc.)
 * - Accept legitimate custom business domains (valid syntax, RFC format, standard TLD)
 * - Normalize domain to lowercase
 * - Reject subdomain tricks (e.g. attacker@gmail.com.fake.com or attacker@mail.gmail.com)
 * - Reject temporary/disposable email providers
 * - Reject malformed or unknown/untrusted domains
 * - Standardized error message:
 *   "Please use a valid email from a supported email provider (e.g. Gmail, Outlook, Yahoo, or iCloud). Temporary/disposable emails are not accepted."
 */

export const MAINSTREAM_EMAIL_DOMAINS = new Set<string>([
  "gmail.com",
  "googlemail.com",
  "outlook.com",
  "hotmail.com",
  "live.com",
  "msn.com",
  "yahoo.com",
  "yahoo.co.in",
  "yahoo.co.uk",
  "ymail.com",
  "icloud.com",
  "me.com",
  "mac.com",
  "proton.me",
  "protonmail.com",
  "pm.me",
  "zoho.com",
  "aol.com",
]);

export const DEFAULT_DISPOSABLE_DOMAINS = new Set<string>([
  "10minutemail.com",
  "10minutemail.net",
  "tempmail.com",
  "temp-mail.org",
  "temp-mail.io",
  "mailinator.com",
  "guerrillamail.com",
  "guerrillamailblock.com",
  "sharklasers.com",
  "grr.la",
  "throwawaymail.com",
  "dispostable.com",
  "yopmail.com",
  "yopmail.fr",
  "yopmail.net",
  "trashmail.com",
  "trashmail.net",
  "trashmail.org",
  "getairmail.com",
  "fakemailgenerator.com",
  "crazymailing.com",
  "nada.ltd",
  "inboxkitten.com",
  "maildrop.cc",
  "mohmal.com",
  "burnermail.io",
  "mytemp.email",
  "minutemailbox.com",
  "emailondeck.com",
  "tempail.com",
  "generator.email",
  "guerrillamail.info",
  "guerrillamail.biz",
  "guerrillamail.de",
  "guerrillamail.net",
  "guerrillamail.org",
  "mailnesia.com",
  "harakirimail.com",
  "jetable.org",
  "tempr.email",
  "discard.email",
  "discardmail.com",
  "spambog.com",
  "mailcatch.com",
  "tempinbox.com",
  "fakeinbox.com",
  "boun.cr",
  "bugmenot.com",
  "mailtemp.net",
  "tmail.com",
  "throwaway.email",
  "tmpmail.net",
  "tmpmail.org",
  "guerrillamail.org",
  "dropmail.me",
  "getnada.com",
  "inboxbear.com",
  "tempm.com",
]);

export const UNTRUSTED_TLDS = new Set<string>([
  "local",
  "localhost",
  "test",
  "example",
  "invalid",
  "temp",
  "disposable",
  "throwaway",
]);

export const STANDARD_EMAIL_ERROR =
  "Please use a valid email from a supported email provider. Temporary or disposable email addresses are not accepted.";

export interface EmailValidationResult {
  valid: boolean;
  normalizedEmail: string;
  domain: string;
  error?: string;
  isMainstream: boolean;
  isBusinessDomain: boolean;
}

/**
 * Validates an email for contact and restaurant onboarding.
 */
export function validateOnboardingEmail(rawEmail: unknown): EmailValidationResult {
  if (typeof rawEmail !== "string") {
    return {
      valid: false,
      normalizedEmail: "",
      domain: "",
      error: STANDARD_EMAIL_ERROR,
      isMainstream: false,
      isBusinessDomain: false,
    };
  }

  const trimmed = rawEmail.trim();
  if (!trimmed || trimmed.length > 254) {
    return {
      valid: false,
      normalizedEmail: "",
      domain: "",
      error: STANDARD_EMAIL_ERROR,
      isMainstream: false,
      isBusinessDomain: false,
    };
  }

  // Must have exactly one @ symbol
  const atIndex = trimmed.indexOf("@");
  if (atIndex === -1 || atIndex !== trimmed.lastIndexOf("@")) {
    return {
      valid: false,
      normalizedEmail: trimmed,
      domain: "",
      error: STANDARD_EMAIL_ERROR,
      isMainstream: false,
      isBusinessDomain: false,
    };
  }

  const localPart = trimmed.slice(0, atIndex);
  const rawDomainPart = trimmed.slice(atIndex + 1);

  // Local part validation
  if (!localPart || localPart.length > 64) {
    return {
      valid: false,
      normalizedEmail: trimmed,
      domain: "",
      error: STANDARD_EMAIL_ERROR,
      isMainstream: false,
      isBusinessDomain: false,
    };
  }

  // Reject local part starting or ending with dot, or containing consecutive dots
  if (localPart.startsWith(".") || localPart.endsWith(".") || localPart.includes("..")) {
    return {
      valid: false,
      normalizedEmail: trimmed,
      domain: "",
      error: STANDARD_EMAIL_ERROR,
      isMainstream: false,
      isBusinessDomain: false,
    };
  }

  // Domain normalization to lowercase
  const domain = rawDomainPart.trim().toLowerCase();

  // Basic domain checks
  if (
    !domain ||
    domain.length > 253 ||
    domain.startsWith(".") ||
    domain.endsWith(".") ||
    domain.startsWith("-") ||
    domain.endsWith("-") ||
    domain.includes("..") ||
    !domain.includes(".")
  ) {
    return {
      valid: false,
      normalizedEmail: `${localPart}@${domain}`,
      domain,
      error: STANDARD_EMAIL_ERROR,
      isMainstream: false,
      isBusinessDomain: false,
    };
  }

  const domainParts = domain.split(".");
  const tld = domainParts[domainParts.length - 1];

  // TLD must be at least 2 alpha characters
  if (!tld || tld.length < 2 || !/^[a-z]+$/.test(tld)) {
    return {
      valid: false,
      normalizedEmail: `${localPart}@${domain}`,
      domain,
      error: STANDARD_EMAIL_ERROR,
      isMainstream: false,
      isBusinessDomain: false,
    };
  }

  // Check untrusted / pseudo TLDs
  if (UNTRUSTED_TLDS.has(tld)) {
    return {
      valid: false,
      normalizedEmail: `${localPart}@${domain}`,
      domain,
      error: STANDARD_EMAIL_ERROR,
      isMainstream: false,
      isBusinessDomain: false,
    };
  }

  // Validate each domain label
  for (const part of domainParts) {
    if (!part || part.length > 63 || !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(part)) {
      return {
        valid: false,
        normalizedEmail: `${localPart}@${domain}`,
        domain,
        error: STANDARD_EMAIL_ERROR,
        isMainstream: false,
        isBusinessDomain: false,
      };
    }
  }

  // Check disposable / temporary domain denylist
  if (DEFAULT_DISPOSABLE_DOMAINS.has(domain)) {
    return {
      valid: false,
      normalizedEmail: `${localPart}@${domain}`,
      domain,
      error: STANDARD_EMAIL_ERROR,
      isMainstream: false,
      isBusinessDomain: false,
    };
  }

  // Check if domain is a subdomain of a disposable provider (e.g. xyz.mailinator.com)
  for (const disp of DEFAULT_DISPOSABLE_DOMAINS) {
    if (domain.endsWith(`.${disp}`)) {
      return {
        valid: false,
        normalizedEmail: `${localPart}@${domain}`,
        domain,
        error: STANDARD_EMAIL_ERROR,
        isMainstream: false,
        isBusinessDomain: false,
      };
    }
  }

  // Check if it is a supported mainstream provider
  const isMainstream = MAINSTREAM_EMAIL_DOMAINS.has(domain);

  // Check for subdomain tricks on mainstream providers
  // e.g. "gmail.com.fake.com" or "evil.gmail.com" - mainstream providers don't accept subdomains
  if (!isMainstream) {
    for (const mainstream of MAINSTREAM_EMAIL_DOMAINS) {
      if (domain.endsWith(`.${mainstream}`) || domain.startsWith(`${mainstream}.`)) {
        return {
          valid: false,
          normalizedEmail: `${localPart}@${domain}`,
          domain,
          error: STANDARD_EMAIL_ERROR,
          isMainstream: false,
          isBusinessDomain: false,
        };
      }
    }
  }

  // Allow mainstream providers and legitimate business/custom domains
  // Custom business domains must have a valid structure (at least domain.tld with standard alphanumeric labels)
  const normalizedEmail = `${localPart}@${domain}`;

  return {
    valid: true,
    normalizedEmail,
    domain,
    isMainstream,
    isBusinessDomain: !isMainstream,
  };
}
