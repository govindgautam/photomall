'use client';

import React, { useState, useRef, use } from 'react';
import { apiClient } from '@/lib/api-client';
import { 
    Camera, Loader2, Zap, Download, Sparkles, 
    RefreshCcw, Image as ImageIcon, Search, ArrowLeft 
} from 'lucide-react';
import { useRouter } from 'next/navigation';

export default function GuestSearch({ params }: { params: Promise<{ eventId: string }> }) {
    // Step 1: Unwrap params safely for Next.js 15
    const resolvedParams = use(params);
    const eventId = resolvedParams?.eventId;
    const router = useRouter();
    
    const [file, setFile] = useState<File | null>(null);
    const [preview, setPreview] = useState<string | null>(null);
    const [results, setResults] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [hasSearched, setHasSearched] = useState(false);
    
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const selectedFile = e.target.files?.[0];
        if (selectedFile) {
            setFile(selectedFile);
            setPreview(URL.createObjectURL(selectedFile));
            setHasSearched(false);
            setResults([]);
        }
    };

    const handleSearch = async () => {
        if (!file || !eventId) return;
        
        setLoading(true);
        setHasSearched(true);
        try {
            // Step 2: Backend AI Engine Call
            // Backend endpoint: POST /api/search/face/{event_id}
            const response = await apiClient.searchByFace(eventId, file);
            
            // FAISS matches usually return as an array or {matches: []}
            const matches = Array.isArray(response) ? response : (response.matches || []);
            setResults(matches); 
            
            console.log(`[AI Search] Found ${matches.length} matches for Event ${eventId}`);
        } catch (error) {
            console.error("Architect Error: AI Matching Pipeline Failed", error);
            setResults([]);
        } finally {
            setLoading(false);
        }
    };

    const getFullImageUrl = (path: string) => {
        return apiClient.getImageUrl(path);
    };

    return (
        <div className="min-h-screen bg-[#020617] text-white selection:bg-blue-500/30 overflow-x-hidden">
            {/* Background Decor */}
            <div className="fixed inset-0 z-0">
                <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-blue-600/10 blur-[120px] rounded-full animate-pulse" />
                <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-indigo-600/10 blur-[120px] rounded-full" />
            </div>

            <div className="relative z-10 max-w-5xl mx-auto px-6 py-12">
                {/* Header */}
                <header className="text-center mb-12 space-y-4">
                    <div className="inline-flex items-center gap-2 px-4 py-2 bg-blue-500/10 border border-blue-500/20 rounded-full text-blue-400 text-[10px] font-black tracking-[0.2em] uppercase">
                        <Sparkles size={14} className="animate-spin-slow" /> Neural Match Engine Active
                    </div>
                    <h1 className="text-5xl md:text-7xl font-black tracking-tighter italic">
                        FIND YOUR <span className="text-blue-500">MOMENTS.</span>
                    </h1>
                    <p className="text-slate-400 text-lg max-w-xl mx-auto font-medium">
                        Upload a selfie to find your photos from{' '}
                        <span className="text-white font-bold">event #{eventId}</span>.
                    </p>
                </header>
                
                {/* Upload Section */}
                {!hasSearched || results.length === 0 ? (
                    <div className="max-w-xl mx-auto bg-slate-900/40 backdrop-blur-2xl p-10 rounded-[3.5rem] border border-slate-800 shadow-2xl animate-in fade-in slide-in-from-bottom-10 duration-700">
                        <div className="space-y-8">
                            <div 
                                onClick={() => fileInputRef.current?.click()}
                                className={`group relative aspect-square rounded-[2.5rem] border-2 border-dashed transition-all duration-500 flex flex-col items-center justify-center overflow-hidden cursor-pointer ${
                                    preview ? 'border-blue-500 bg-blue-500/5' : 'border-slate-800 bg-slate-950/50 hover:border-blue-500/50'
                                }`}
                            >
                                {preview ? (
                                    <>
                                        <img src={preview} className="w-full h-full object-cover" alt="Selfie" />
                                        <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity font-bold uppercase text-xs">
                                            Change Photo
                                        </div>
                                        {loading && (
                                            <div className="absolute inset-0 bg-blue-500/20">
                                                <div className="absolute w-full h-[2px] bg-blue-400 shadow-[0_0_15px_rgba(96,165,250,1)] animate-scan-line top-0" />
                                            </div>
                                        )}
                                    </>
                                ) : (
                                    <div className="text-center space-y-4">
                                        <div className="w-20 h-20 bg-slate-800 rounded-3xl flex items-center justify-center mx-auto text-slate-500 group-hover:text-blue-500 transition-all">
                                            <Camera size={40} />
                                        </div>
                                        <p className="font-black text-xl tracking-tight">TAP TO TAKE SELFIE</p>
                                    </div>
                                )}
                                <input type="file" ref={fileInputRef} onChange={handleFileChange} accept="image/*" capture="user" className="hidden" />
                            </div>
                            
                            <button 
                                onClick={handleSearch} 
                                disabled={loading || !file}
                                className="w-full bg-blue-600 hover:bg-blue-500 disabled:bg-slate-800 py-6 rounded-3xl font-black text-xl transition-all flex items-center justify-center gap-4 shadow-2xl shadow-blue-900/40"
                            >
                                {loading ? <Loader2 className="animate-spin" size={24} /> : <Zap size={22} fill="currentColor" />}
                                {loading ? 'SCANNING DATABASE...' : 'FIND MY PHOTOS'}
                            </button>
                        </div>
                    </div>
                ) : null}

                {/* Results Section */}
                {hasSearched && !loading && results.length > 0 && (
                    <div className="space-y-12 animate-in fade-in duration-1000">
                        <div className="flex flex-col md:flex-row items-center justify-between gap-6 bg-slate-900/50 p-8 rounded-[2.5rem] border border-slate-800">
                            <div className="flex items-center gap-5">
                                <div className="w-20 h-20 rounded-2xl overflow-hidden border-2 border-blue-500 shadow-xl">
                                    <img src={preview!} className="w-full h-full object-cover" alt="Me" />
                                </div>
                                <div>
                                    <h3 className="text-3xl font-black italic">FOUND {results.length} PHOTOS</h3>
                                    <p className="text-slate-500 font-bold uppercase text-[10px] tracking-widest">AI Match Certainty: 98%</p>
                                </div>
                            </div>
                            <button 
                                onClick={() => { setHasSearched(false); setPreview(null); setFile(null); }}
                                className="flex items-center gap-2 px-8 py-4 bg-slate-800 hover:bg-slate-700 rounded-2xl font-bold text-sm transition-all"
                            >
                                <RefreshCcw size={16} /> New Search
                            </button>
                        </div>

                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
                            {results.map((photo: any, i: number) => (
                                <div key={i} className="group relative rounded-[2rem] overflow-hidden bg-slate-900 border border-slate-800 hover:border-blue-500/50 transition-all duration-500">
                                    <img 
                                        src={getFullImageUrl(photo.url || photo.preview_path || photo.path || photo.file_path || '')} 
                                        className="w-full aspect-[3/4] object-cover transition-transform duration-1000 group-hover:scale-110"
                                        alt="Result"
                                    />
                                    <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-transparent opacity-0 group-hover:opacity-100 transition-all duration-300 flex flex-col justify-end p-5">
                                        <a 
                                            href={getFullImageUrl(photo.url || photo.preview_path || photo.path || photo.file_path || '')} 
                                            target="_blank"
                                            className="bg-white text-black text-center py-3.5 rounded-2xl font-black text-[10px] uppercase flex items-center justify-center gap-2"
                                        >
                                            <Download size={14} /> Download HD
                                        </a>
                                    </div>
                                    <div className="absolute top-4 left-4">
                                        <div className="bg-blue-600 text-[8px] font-black px-2 py-1 rounded uppercase">AI Match</div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Empty State */}
                {hasSearched && !loading && results.length === 0 && (
                    <div className="text-center py-20 bg-slate-900/30 rounded-[4rem] border-2 border-dashed border-slate-800 max-w-2xl mx-auto">
                        <div className="w-20 h-20 bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-6 text-4xl grayscale">🔍</div>
                        <h3 className="text-2xl font-black italic mb-2 uppercase text-slate-400">No Matches Found</h3>
                        <p className="text-slate-500 px-10">We could not find a strong face match in this event. Try a clearer, front-facing photo with better lighting.</p>
                        <button 
                            onClick={() => setHasSearched(false)}
                            className="mt-8 px-8 py-4 bg-blue-600 rounded-2xl font-black text-xs uppercase"
                        >
                            Try Another Photo
                        </button>
                    </div>
                )}
            </div>

            <style jsx global>{`
                @keyframes scan {
                    0% { top: 0%; opacity: 0; }
                    10% { opacity: 1; }
                    90% { opacity: 1; }
                    100% { top: 100%; opacity: 0; }
                }
                .animate-scan-line { animation: scan 2s linear infinite; }
                .animate-spin-slow { animation: spin 3s linear infinite; }
            `}</style>
        </div>
    );
}