"use client";
import { motion, AnimatePresence } from 'framer-motion';
import { X, Download, Share2 } from 'lucide-react';

export default function Lightbox({ url, onClose }: { url: string | null, onClose: () => void }) {
  if (!url) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="fixed inset-0 z-[100] bg-black/95 flex items-center justify-center p-4 backdrop-blur-sm"
      >
        <button 
          onClick={onClose}
          className="absolute top-6 right-6 p-3 bg-zinc-800 rounded-full text-white hover:bg-zinc-700 transition-colors"
        >
          <X size={24} />
        </button>

        <motion.img
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          src={url}
          className="max-h-[85vh] max-w-full rounded-lg shadow-2xl object-contain"
        />

        <div className="absolute bottom-10 left-1/2 -translate-x-1/2 flex gap-4">
          <a 
            href={url} download 
            className="px-8 py-4 bg-white text-black rounded-full font-bold flex items-center gap-3 shadow-xl hover:scale-105 transition-transform"
          >
            <Download size={20} /> Download HD
          </a>
          <button className="p-4 bg-zinc-800 text-white rounded-full shadow-xl hover:bg-zinc-700">
            <Share2 size={20} />
          </button>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}