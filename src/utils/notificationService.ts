import { toast } from 'react-hot-toast';

const DEFAULT_ERROR = 'An unexpected error occurred';

interface ErrorFields {
  message?: unknown;
  error_description?: unknown;
  code?: unknown;
}

const isRecord = (value: unknown): value is ErrorFields => typeof value === 'object' && value !== null;

/** Best-effort text of anything that can be thrown (Error, Supabase error, string, plain object). */
function describeError(error: unknown): string {
  if (typeof error === 'string') return error;
  if (isRecord(error)) {
    if (typeof error.message === 'string' && error.message) return error.message;
    if (typeof error.error_description === 'string' && error.error_description) return error.error_description;
  }
  return JSON.stringify(error) ?? String(error);
}

/**
 * Maps raw backend errors to user-friendly messages.
 * @param error - The error object or string
 * @param defaultMessage - Fallback message if no mapping applies
 */
export const getErrorMessage = (error: unknown, defaultMessage: string = DEFAULT_ERROR): string => {
  if (!error) return defaultMessage;

  const errorString = describeError(error);
  const lowerError = errorString.toLowerCase();

  // Edge Function rate limit (checked first: it also contains "too many requests")
  if (lowerError.includes('too many requests, please slow down')) {
    return 'You are sending requests too fast. Please wait a moment.';
  }

  // Supabase Auth Errors
  if (lowerError.includes('invalid login credentials') || lowerError.includes('invalid_grant')) {
    return 'Incorrect email or password. Please try again.';
  }
  if (lowerError.includes('user already registered') || lowerError.includes('already exists')) {
    return 'An account with this email already exists.';
  }
  if (lowerError.includes('weak_password') || lowerError.includes('password should be at least')) {
    return 'Your password is too weak. Please use a stronger password.';
  }
  if (lowerError.includes('email_not_confirmed') || lowerError.includes('email not confirmed')) {
    return 'Please verify your email address before logging in.';
  }
  if (lowerError.includes('rate_limit') || lowerError.includes('too many requests')) {
    return 'Too many attempts. Please wait a moment and try again.';
  }

  // Session / JWT Errors
  if (lowerError.includes('jwt expired') || lowerError.includes('token expired')) {
    return 'Your session has expired. Please log in again.';
  }
  if (lowerError.includes('jwt malformed') || lowerError.includes('invalid token')) {
    return 'Authentication error. Please log in again.';
  }

  // Database / PostgREST Errors
  if (/row[- ]level security/.test(lowerError) || lowerError.includes('42501')) {
    return "You don't have permission to perform this action.";
  }
  if ((isRecord(error) && error.code === '23505') || lowerError.includes('unique constraint')) {
    return 'This record already exists.';
  }

  // Network Errors
  if (lowerError.includes('failed to fetch') || lowerError.includes('network error')) {
    return 'Network error. Please check your internet connection and try again.';
  }

  // Credits / Edge Function
  if (lowerError.includes('not enough credits') || lowerError.includes('insufficient credits')) {
    return "You don't have enough credits for this generation.";
  }
  if (lowerError.includes('account suspended')) {
    return 'Your account has been suspended.';
  }

  // Invalid email update (Supabase specific)
  if (lowerError.includes('is invalid') && lowerError.includes('email')) {
    return 'Please use a valid email provider (e.g., @gmail.com). Fake domains are blocked by the security filter.';
  }

  // Without an explicit fallback the original message is the most useful thing to show.
  return defaultMessage === DEFAULT_ERROR && isRecord(error) && typeof error.message === 'string' && error.message
    ? error.message
    : defaultMessage;
};

const baseStyle = { background: '#1e293b', color: '#f8fafc' };

/** Centralized notification service. */
export const notify = {
  success: (message: string): void => {
    toast.success(message, {
      style: { ...baseStyle, border: '1px solid #334155' },
      iconTheme: { primary: '#22c55e', secondary: '#f8fafc' },
    });
  },

  error: (error: unknown, fallbackMessage = 'An error occurred'): void => {
    toast.error(getErrorMessage(error, fallbackMessage), {
      style: { ...baseStyle, border: '1px solid #ef4444' },
      iconTheme: { primary: '#ef4444', secondary: '#f8fafc' },
      duration: 5000,
    });
  },

  warning: (message: string): void => {
    toast(message, {
      icon: '⚠️',
      style: { ...baseStyle, border: '1px solid #eab308' },
      duration: 4000,
    });
  },

  info: (message: string, icon = 'ℹ️'): void => {
    toast(message, {
      icon,
      style: { ...baseStyle, border: '1px solid #3b82f6' },
    });
  },
};
