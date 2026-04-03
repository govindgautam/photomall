// frontend/src/lib/utils.ts

/**
 * Get full image URL by adding backend prefix if needed
 * Handles cases where path might already have 'uploads/' prefix
 * 🔥 FIXED: Removes ALL occurrences of 'uploads/' to prevent double uploads
 */
export const getImageUrl = (url: string | null | undefined): string => {
  if (!url) return '';
  
  // Already absolute URL
  if (url.startsWith('http://') || url.startsWith('https://')) {
    return url;
  }
  
  const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://127.0.0.1:8000';
  
  // Debug logging (remove in production)
  if (process.env.NODE_ENV === 'development') {
    console.log('🔍 [getImageUrl] Original:', url);
  }
  
  let cleanUrl = url;
  
  // Remove leading slash if present
  if (cleanUrl.startsWith('/')) {
    cleanUrl = cleanUrl.substring(1);
  }
  
  // 🔥 CRITICAL FIX: Remove ALL 'uploads/' prefixes (handles double/triple uploads)
  // This while loop keeps removing 'uploads/' until it's gone
  while (cleanUrl.startsWith('uploads/')) {
    cleanUrl = cleanUrl.substring('uploads/'.length);
  }
  
  // Also remove any pattern like 'uploads/uploads/' that might be in the middle
  cleanUrl = cleanUrl.replace(/uploads\/uploads\//g, 'uploads/');
  cleanUrl = cleanUrl.replace(/\/uploads\//g, '/');
  
  // Remove any remaining 'uploads/' at the beginning after replacements
  if (cleanUrl.startsWith('uploads/')) {
    cleanUrl = cleanUrl.substring('uploads/'.length);
  }
  
  // Ensure no double slashes
  cleanUrl = cleanUrl.replace(/\/+/g, '/');
  
  // Remove any trailing slashes
  cleanUrl = cleanUrl.replace(/\/$/, '');
  
  // Add single 'uploads/' prefix
  const finalUrl = `${backendUrl}/uploads/${cleanUrl}`;
  
  // Debug logging (remove in production)
  if (process.env.NODE_ENV === 'development') {
    console.log('✅ [getImageUrl] Final:', finalUrl);
  }
  
  return finalUrl;
};

/**
 * Format file size to human readable format
 */
export const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

/**
 * Debounce function for search inputs
 */
export const debounce = <T extends (...args: unknown[]) => unknown>(
  func: T,
  wait: number
): ((...args: Parameters<T>) => void) => {
  let timeout: NodeJS.Timeout;
  return (...args: Parameters<T>) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
};

/**
 * Generate random ID
 */
export const generateId = (): string => {
  return Math.random().toString(36).substring(2) + Date.now().toString(36);
};

/**
 * Truncate text with ellipsis
 */
export const truncateText = (text: string, maxLength: number): string => {
  if (!text || text.length <= maxLength) return text;
  return text.slice(0, maxLength) + '...';
};

/**
 * Get file extension from filename
 */
export const getFileExtension = (filename: string): string => {
  if (!filename) return '';
  return filename.split('.').pop()?.toLowerCase() || '';
};

/**
 * Check if URL is valid
 */
export const isValidUrl = (url: string): boolean => {
  if (!url) return false;
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
};