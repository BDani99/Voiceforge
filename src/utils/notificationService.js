import { toast } from 'react-hot-toast';

/**
 * Maps raw backend errors to user-friendly messages
 * @param {Error|Object|string} error - The error object or string
 * @param {string} defaultMessage - Fallback message if mapping fails
 * @returns {string} User-friendly error message
 */
export const getErrorMessage = (error, defaultMessage = 'An unexpected error occurred') => {
  if (!error) return defaultMessage;

  const errorString = typeof error === 'string' ? error : (error.message || error.error_description || JSON.stringify(error));
  const lowerError = errorString.toLowerCase();

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
  if (lowerError.includes('row level security') || lowerError.includes('42501')) {
    return "You don't have permission to perform this action.";
  }
  if (error.code === '23505' || lowerError.includes('unique constraint')) {
    return 'This record already exists.';
  }

  // Network Errors
  if (lowerError.includes('failed to fetch') || lowerError.includes('network error')) {
    return 'Network error. Please check your internet connection and try again.';
  }

  // Credits / Custom Errors
  if (lowerError.includes('not enough credits') || lowerError.includes('insufficient credits')) {
    return "You don't have enough credits for this generation.";
  }

  // Invalid email update (Supabase specific)
  if (lowerError.includes('is invalid') && lowerError.includes('email')) {
    return 'Please use a valid email provider (e.g., @gmail.com). Fake domains are blocked by the security filter.';
  }

  return defaultMessage === 'An unexpected error occurred' && error.message 
    ? error.message 
    : defaultMessage;
};

/**
 * Centralized notification service
 */
export const notify = {
  success: (message) => {
    toast.success(message, {
      style: {
        background: '#1e293b',
        color: '#f8fafc',
        border: '1px solid #334155',
      },
      iconTheme: {
        primary: '#22c55e',
        secondary: '#f8fafc',
      },
    });
  },
  
  error: (error, fallbackMessage = 'An error occurred') => {
    const message = getErrorMessage(error, fallbackMessage);
    toast.error(message, {
      style: {
        background: '#1e293b',
        color: '#f8fafc',
        border: '1px solid #ef4444',
      },
      iconTheme: {
        primary: '#ef4444',
        secondary: '#f8fafc',
      },
      duration: 5000,
    });
  },

  warning: (message) => {
    toast(message, {
      icon: '⚠️',
      style: {
        background: '#1e293b',
        color: '#f8fafc',
        border: '1px solid #eab308',
      },
      duration: 4000,
    });
  },

  info: (message, icon = 'ℹ️') => {
    toast(message, {
      icon,
      style: {
        background: '#1e293b',
        color: '#f8fafc',
        border: '1px solid #3b82f6',
      },
    });
  }
};
