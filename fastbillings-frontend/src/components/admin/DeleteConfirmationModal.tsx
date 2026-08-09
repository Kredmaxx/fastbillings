import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, LoaderCircle, X } from 'lucide-react';

interface DeleteConfirmationModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => void;
    title?: string;
    message?: ReactNode;
    isDeleting?: boolean;
}

const DeleteConfirmationModal = ({
    isOpen,
    onClose,
    onConfirm,
    title = 'Confirm Deletion',
    message = 'Are you sure you want to proceed? This action cannot be undone.',
    isDeleting = false,
}: DeleteConfirmationModalProps) => {
    if (!isOpen) return null;

    return createPortal(
        <>
            <div
                className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm"
                onClick={!isDeleting ? onClose : undefined}
                aria-hidden
            />

            <div
                className="fixed inset-0 z-[110] flex items-center justify-center p-4"
                aria-labelledby="delete-modal-title"
                role="dialog"
                aria-modal="true"
            >
                <div className="relative w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
                    <button
                        onClick={onClose}
                        disabled={isDeleting}
                        className="absolute top-2 right-2 rounded-full p-1 text-gray-500 hover:bg-gray-100 cursor-pointer"
                        aria-label="Close"
                    >
                        <X size={20} />
                    </button>

                    <div className="text-center">
                        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-red-100">
                            <AlertTriangle className="h-6 w-6 text-red-600" aria-hidden="true" />
                        </div>

                        <h3
                            id="delete-modal-title"
                            className="mt-4 text-lg font-bold text-gray-950"
                        >
                            {title}
                        </h3>

                        <div className="mt-2 text-sm font-medium text-gray-600">
                            {message}
                        </div>
                    </div>

                    <div className="mt-6 grid grid-cols-2 gap-4">
                        <button
                            type="button"
                            onClick={onClose}
                            disabled={isDeleting}
                            className="w-full rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-400 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer"
                        >
                            Cancel
                        </button>
                        <button
                            type="button"
                            onClick={onConfirm}
                            disabled={isDeleting}
                            className="flex w-full items-center justify-center rounded-md border border-transparent bg-red-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:bg-red-400 disabled:opacity-50 cursor-pointer"
                        >
                            {isDeleting ? (
                                <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
                            ) : null}
                            {isDeleting ? 'Loading...' : 'Confirm'}
                        </button>
                    </div>
                </div>
            </div>
        </>,
        document.body,
    );
};

export default DeleteConfirmationModal;
