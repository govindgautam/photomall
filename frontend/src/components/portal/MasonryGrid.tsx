"use client";
import { motion } from 'framer-motion';
import { getImageUrl } from '@/lib/utils';

interface Photo {
  id: string;
  url: string;
}

export default function MasonryGrid({ photos, onPhotoClick }: { photos: Photo[], onPhotoClick: (url: string) => void }) {
  return (
    <div className="columns-2 md:columns-3 lg:columns-4 gap-4 space-y-4 p-4">
      {photos.map((photo, index) => (
        <motion.div
          key={photo.id}
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: index * 0.05 }}
          className="relative group cursor-pointer overflow-hidden rounded-2xl shadow-lg border border-zinc-800"
          onClick={() => onPhotoClick(getImageUrl(photo.url))}
        >
          <img
            src={getImageUrl(photo.url)}
            alt="Event moment"
            className="w-full object-cover transition-transform duration-700 group-hover:scale-110"
            loading="lazy"
            onError={(e) => {
              // Fallback for broken images
              const target = e.target as HTMLImageElement;
              target.src = 'https://placehold.co/600x400/1e1e2e/ffffff?text=Image+Not+Found';
              console.warn(`Failed to load image: ${photo.url}`);
            }}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-4">
            <span className="text-white text-xs font-medium">View Fullscreen</span>
          </div>
        </motion.div>
      ))}
    </div>
  );
}