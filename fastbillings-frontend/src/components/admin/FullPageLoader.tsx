import { createPortal } from 'react-dom';
import { Loader2 } from "lucide-react";

const FullPageLoader = () => {
    return createPortal(
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/40">
            <Loader2 className="h-12 w-12 animate-spin text-white" />
        </div>,
        document.body,
    );
};

export default FullPageLoader;
