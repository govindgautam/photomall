'use client';

/**
 * PATH CHECK: 
 * Next.js projects mein agar component 'src/components' mein hai, 
 * toh 'src/lib/api-client' ke liye '../lib/api-client' ekdum sahi hai.
 */
import { apiClient } from '../lib/api-client';

interface Photo {
  id: string | number;
  preview_path: string;
  file_path: string;
}

export default function GalleryGrid({ photos }: { photos: any }) {
  
  // 1. SAFETY CHECK: Agar photos array nahi hai (e.g. backend response object aa gaya), 
  // toh use array mein convert karo ya empty array set karo.
  const photosArray = Array.isArray(photos) 
    ? photos 
    : (photos?.matches || []); 

  // 2. Initial Check: Agar array empty hai
  if (photosArray.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-32 space-y-6 animate-in fade-in duration-700">
        <div className="text-7xl">📸</div>
        <div className="text-center">
          <p className="text-white text-2xl font-bold tracking-tight">No photos to display.</p>
          <p className="text-slate-500 text-sm mt-2 max-w-xs mx-auto">
            Admin panel se photos upload karo ya apni selfie check karo.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 columns-1 sm:columns-2 md:columns-3 lg:columns-4 gap-4 space-y-4 animate-in slide-in-from-bottom-4 duration-500">
      {photosArray.map((photo: Photo) => {
        // 3. URL GENERATION: Safety check ke saath
        const previewUrl = photo.preview_path 
          ? apiClient.getImageUrl(photo.preview_path) 
          : null;

        const originalUrl = photo.file_path 
          ? apiClient.getImageUrl(photo.file_path) 
          : '#';

        // Invalid data ko skip karo
        if (!previewUrl) return null;

        return (
          <div 
            key={photo.id} 
            className="relative group overflow-hidden rounded-2xl shadow-2xl break-inside-avoid border border-white/5 bg-slate-900/50 backdrop-blur-sm"
          >
            <img 
              src={previewUrl} 
              alt="Event Memory" 
              className="w-full h-auto object-cover transition-all duration-700 group-hover:scale-110 group-hover:brightness-[0.3]"
              loading="lazy"
              // 4. FALLBACK: Agar server se image fetch fail ho (404 Error)
              onError={(e) => {
                const target = e.target as HTMLImageElement;
                target.src = 'https://placehold.co/600x400/1e293b/ffffff?text=Image+Missing';
                target.className = "w-full h-48 object-contain opacity-40 p-4";
              }}
            />
            
            {/* Hover Actions - Only Visible on Hover */}
            <div className="absolute inset-0 flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-500 scale-95 group-hover:scale-100">
              <button 
                onClick={() => window.open(originalUrl, '_blank')}
                className="bg-white text-black px-8 py-2.5 rounded-full font-bold shadow-xl hover:bg-blue-50 active:scale-95 transition-all"
              >
                View High Res
              </button>
              
              <div className="mt-4 flex flex-col items-center gap-1">
                <span className="text-white/40 text-[10px] uppercase tracking-[0.2em] font-bold">
                  Photo System ID
                </span>
                <span className="text-blue-400 font-mono text-xs">
                  #{photo.id}
                </span>
              </div>
            </div>

            {/* Subtle Overlay for better contrast */}
            <div className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/40 to-transparent pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity" />
          </div>
        );
      })}
    </div>
  );
}