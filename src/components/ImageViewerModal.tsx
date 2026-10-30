'use client';

import React from 'react';
import { X, Download } from 'lucide-react';

interface ImageViewerModalProps {
  isOpen: boolean;
  onClose: () => void;
  imageUrl: string | null;
  title?: string;
}

export const ImageViewerModal: React.FC<ImageViewerModalProps> = ({
  isOpen,
  onClose,
  imageUrl,
  title,
}) => {
  if (!isOpen || !imageUrl) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/90 backdrop-blur-md animate-fade-in cursor-zoom-out"
      onClick={onClose}
    >
      <div
        className="relative max-w-5xl max-h-[90vh] rounded-2xl overflow-hidden bg-slate-950 border border-slate-800 shadow-2xl flex flex-col cursor-default"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 상단 바 */}
        <div className="px-4 py-3 bg-slate-900/90 border-b border-slate-800 flex items-center justify-between text-xs text-slate-300">
          <span className="font-bold text-white truncate max-w-[70%]">
            {title || '식사 사진 확대보기'}
          </span>
          <div className="flex items-center space-x-2">
            <a
              href={imageUrl}
              download="meal_photo.jpg"
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
              title="이미지 다운로드"
            >
              <Download className="w-4 h-4" />
            </a>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* 원본 이미지 */}
        <div className="p-2 sm:p-4 flex items-center justify-center overflow-auto max-h-[calc(90vh-60px)]">
          <img
            src={imageUrl}
            alt={title || '식사 사진'}
            className="max-h-[80vh] max-w-full object-contain rounded-xl shadow-lg"
          />
        </div>
      </div>
    </div>
  );
};
