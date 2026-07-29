import React from 'react';
import { X } from 'lucide-react';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}

const SIZE_CLASS: Record<string, string> = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-2xl',   // ~672px
  xl: 'max-w-4xl',   // ~896px
};

export const Modal: React.FC<ModalProps> = ({ isOpen, onClose, title, children, size = 'md' }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-[2px]">
      <div className={`bg-warm-white rounded-2xl shadow-soft-lg border border-sage/20 w-full ${SIZE_CLASS[size]} overflow-hidden flex flex-col max-h-[90vh]`}>
        <div className="flex justify-between items-center p-5 border-b border-sage/20">
          <h3 className="text-xl font-bold text-coffee capitalize">{title}</h3>
          <button onClick={onClose} className="p-2 rounded-xl text-muted hover:text-forest-dark hover:bg-sage/10 transition-colors">
            <X size={20} strokeWidth={1.5} />
          </button>
        </div>
        <div className="p-5 overflow-y-auto">
          {children}
        </div>
      </div>
    </div>
  );
};