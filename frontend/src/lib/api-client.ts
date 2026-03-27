/**
 * API Client Utility - PRODUCTION READY
 * This client is optimized to work with Next.js Rewrites via /api/py prefix.
 * It prevents Double Pathing (/api/api) and handles AI processing timeouts.
 */

// Senior Architect Fix: 
// Hum BASE_URL ko sirf proxy prefix rakhenge. 
// Next.js rewrite rule isse automatically "http://127.0.0.1:8000/api" par map kar dega.
const BASE_URL = "/api/py";
const DIRECT_BACKEND_URL =
    (process.env.NEXT_PUBLIC_DIRECT_BACKEND_URL || "http://127.0.0.1:8000").replace(/\/$/, "");

function normalizeApiUrl(url: string): string {
    // Guard against accidental double-prefixing like /api/py/api/search
    return url.replace("/api/py/api/", "/api/py/");
}

/**
 * Robust Request Wrapper
 * Implements: 90s timeout and Exponential backoff retry.
 */
async function robustRequest(url: string, options: RequestInit = {}, retries = 3): Promise<any> {
    const requestUrl = normalizeApiUrl(url);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 90000); // 90s for Heavy AI Tasks

    try {
        const response = await fetch(requestUrl, {
            ...options,
            signal: controller.signal,
            headers: {
                'Accept': 'application/json',
                ...options.headers,
            }
        });

        if (!response.ok) {
            const contentType = response.headers.get("content-type");
            let result;
            if (contentType && contentType.includes("application/json")) {
                result = await response.json().catch(() => ({}));
            } else {
                result = await response.text().catch(() => "");
            }
            
            // If API returns partial match data even on error, recover it
            if (result && typeof result === 'object' && Array.isArray(result.matches)) {
                return result;
            }

            throw new Error(result?.detail || result?.message || `Server Error: ${response.status}`);
        }

        const contentType = response.headers.get("content-type");
        if (contentType && contentType.includes("application/json")) {
            return await response.json();
        }
        return await response.text();
    } catch (error: any) {
        clearTimeout(timeoutId);

        const isConnectionError = 
            error.name === 'AbortError' || 
            error.message.includes('socket hang up') || 
            error.message.includes('ECONNRESET') ||
            error.message.includes('fetch failed');

        if (retries > 0 && isConnectionError) {
            const delay = (4 - retries) * 2000;
            console.warn(`[API Resilience] Connection reset. Retrying in ${delay}ms...`);
            await new Promise(resolve => setTimeout(resolve, delay));
            return robustRequest(url, options, retries - 1);
        }

            console.error(`[API Critical Failure] ${requestUrl}:`, error.message);
        throw error;
    } finally {
        clearTimeout(timeoutId);
    }
}

export const apiClient = {
    // --- Auth/session helpers ---
    saveSession: (payload: { access_token: string; token_type?: string; user_id?: number; name?: string }) => {
        if (typeof window === 'undefined') return;
        localStorage.setItem('auth_access_token', payload.access_token);
        localStorage.setItem('auth_token_type', payload.token_type || 'bearer');
        if (payload.user_id !== undefined) localStorage.setItem('auth_user_id', String(payload.user_id));
        if (payload.name) localStorage.setItem('auth_user_name', payload.name);
    },

    getSession: () => {
        if (typeof window === 'undefined') return null;
        const access_token = localStorage.getItem('auth_access_token');
        if (!access_token) return null;
        return {
            access_token,
            token_type: localStorage.getItem('auth_token_type') || 'bearer',
            user_id: Number(localStorage.getItem('auth_user_id') || '0') || undefined,
            name: localStorage.getItem('auth_user_name') || undefined,
        };
    },

    clearSession: () => {
        if (typeof window === 'undefined') return;
        localStorage.removeItem('auth_access_token');
        localStorage.removeItem('auth_token_type');
        localStorage.removeItem('auth_user_id');
        localStorage.removeItem('auth_user_name');
    },

    signup: async (payload: { name: string; email: string; password: string }) => {
        return robustRequest(`${BASE_URL}/auth/signup`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });
    },

    login: async (payload: { email: string; password: string }) => {
        const body = new URLSearchParams();
        body.set('username', payload.email);
        body.set('password', payload.password);
        const result = await robustRequest(`${BASE_URL}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: body.toString(),
        });
        if (result?.access_token) {
            apiClient.saveSession(result);
        }
        return result;
    },

    /**
     * 1. Get Admin Dashboard Stats
     * Maps to: GET http://127.0.0.1:8000/api/admin/stats
     */
    getDashboardStats: async () => {
        return robustRequest(`${BASE_URL}/admin/stats`, {
            method: 'GET',
            cache: 'no-store',
        });
    },

    /**
     * 2. Create New Event
     * Maps to: POST http://127.0.0.1:8000/api/events/create
     */
    createEvent: async (eventData: { name: string; location: string; photographer_id: number }) => {
        const result = await robustRequest(`${BASE_URL}/events/create`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(eventData),
        });
        const data = result?.data || result;
        return {
            ...result,
            id: data?.id,
            event_id: data?.id ?? result?.event_id,
        };
    },

    /**
     * 3. List Events for Photographer
     */
    listEvents: async (photographerId: number) => {
        const result = await robustRequest(`${BASE_URL}/events/list/${photographerId}`, {
            method: 'GET',
            cache: 'no-store'
        });

        if (!Array.isArray(result)) return [];

        return result.map((event: any) => {
            const photo_count = event.photo_count ?? event.count ?? (Array.isArray(event.photos) ? event.photos.length : 0);
            return { 
                ...event, 
                photo_count: Number(photo_count) || 0 
            };
        });
    },

    updateEvent: async (eventId: number | string, payload: { name?: string; location?: string }) => {
        return robustRequest(`${BASE_URL}/events/${eventId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });
    },

    deleteEvent: async (eventId: number | string) => {
        return robustRequest(`${BASE_URL}/events/${eventId}`, {
            method: 'DELETE',
        });
    },

    /**
     * 4. Get All Photos for an Event
     */
    getEventPhotos: async (eventId: string | number) => {
        if (!eventId || eventId === 'undefined') return [];
        return robustRequest(`${BASE_URL}/photos/event/${eventId}`, {
            cache: 'no-store'
        });
    },

    /**
     * Face cluster rows for an event
     */
    getEventFaceClusters: async (eventId: string | number) => {
        if (!eventId || eventId === 'undefined') return [];
        const result = await robustRequest(`${BASE_URL}/photos/event/${eventId}/face-clusters`, {
            cache: 'no-store'
        });
        return Array.isArray(result) ? result : [];
    },

    /**
     * Get specific event details
     */
    getEventDetails: async (eventId: string | number) => {
        if (!eventId || eventId === 'undefined') return null;
        return robustRequest(`${BASE_URL}/events/${eventId}/details`, {
            cache: 'no-store'
        });
    },

    /**
     * 5. Guest face search (AI Vector Match)
     * Maps to: POST http://127.0.0.1:8000/api/search
     */
    searchByFace: async (eventId: string | number, file: File) => {
        if (!eventId || eventId === 'undefined') throw new Error("Event ID is missing");
        
        const formData = new FormData();
        formData.append('file', file);
        formData.append('eventId', String(eventId));

        // Use direct backend call for heavy AI search to avoid Next dev proxy socket hangups.
        return robustRequest(`${DIRECT_BACKEND_URL}/api/py/search`, {
            method: 'POST',
            body: formData,
        });
    },

    /**
     * 6. Admin Bulk Photo Upload
     */
    uploadBulkPhotos: async (eventId: string | number, files: FileList | File[]) => {
        const formData = new FormData();
        formData.append('event_id', eventId.toString());
        
        Array.from(files).forEach((file) => {
            formData.append('files', file); 
        });

        return robustRequest(`${BASE_URL}/photos/upload-bulk`, {
            method: 'POST',
            body: formData,
        });
    },

    /**
     * 7. Image URL Resolution Helper
     * Images bypass the proxy and hit the direct backend to avoid blob/buffer overhead.
     */
    getImageUrl: (path: string) => {
        if (!path || path === 'undefined' || typeof path !== 'string') {
            return 'https://placehold.co/400x600/1e293b/475569?text=Invalid+Path';
        }
        
        if (path.startsWith('http')) return path;

        const cleanPath = path.startsWith('/') ? path.substring(1) : path;
        // Direct backend for static assets
        const BACKEND_RAW = DIRECT_BACKEND_URL;
        
        return `${BACKEND_RAW}/${cleanPath}`;
    }
};