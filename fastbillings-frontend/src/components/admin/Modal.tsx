import type { ReactNode } from 'react';
import { XCircleIcon } from 'lucide-react';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl' | '4xl' | 'full';
}

const sizeClassMap = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-xl',
  '2xl': 'max-w-2xl',
  '3xl': 'max-w-3xl',
  '4xl': 'max-w-4xl',
  full: 'w-full max-w-none',
};

const Modal = ({ isOpen, onClose, title, children, size = '2xl' }: ModalProps) => {
  if (!isOpen) return null;

  return (
    <>
      {/* Fixed Backdrop */}
      <div className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm" onClick={onClose}></div>

      {/* Scrollable Page Flow */}
      <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto px-4 py-10">
        <div
          className={`w-full ${sizeClassMap[size ?? '2xl']} rounded-lg bg-white shadow-lg`}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-gray-200 px-4 py-2">
            <h2 className="text-xl font-bold text-gray-600 font-sans">{title}</h2>
            <button
              onClick={onClose}
              className="text-gray-500 hover:text-gray-700 cursor-pointer"
              aria-label="Close modal"
            >
              <XCircleIcon size={24} />
            </button>
          </div>

          {/* Body */}
          <div className="p-4">{children}</div>
        </div>
      </div>
    </>
  );



};

export default Modal;
