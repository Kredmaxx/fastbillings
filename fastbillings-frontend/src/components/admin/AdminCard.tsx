import React, { useState } from "react";

interface AdminCardProps {
    logoUrl?: string | null;
    fallbackLogo?: string | null;
    companyName: string;
    city?: string;
    state?: string;
    address?: string;
    className?: string;
}

const AdminCard: React.FC<AdminCardProps> = ({
    logoUrl,
    fallbackLogo,
    companyName,
    city,
    state,
    address,
    className = "",
}) => {
    const [imgError, setImgError] = useState(false);

    const displayLogo = !imgError ? logoUrl || fallbackLogo : null;
    const firstLetter = companyName.trim().charAt(0).toUpperCase();

    return (
        <div
            className={`flex gap-3 p-4 bg-gray-50  border border-gray-200 rounded-md ${className}`}
        >
            {/* Logo */}
            <div className="w-15 h-15 flex items-center justify-center rounded bg-white border border-gray-200">
                {displayLogo ? (
                    <img
                        src={displayLogo}
                        alt={companyName}
                        className="w-12 h-12 object-contain"
                        onError={() => setImgError(true)}
                    />
                ) : (
                    <div className="w-12 h-12 flex items-center justify-center rounded-full bg-purple-600 text-white font-bold text-xl">
                        {firstLetter || "?"}
                    </div>
                )}
            </div>

            {/* Company details */}
            <div>
                <h4 className="font-semibold text-gray-950 uppercase">
                    {companyName}
                </h4>
                {(city || state) && (
                    <p className="text-sm text-gray-600">
                        {[city, state].filter(Boolean).join(", ")}
                    </p>
                )}
                {address && (
                    <p className="text-sm text-gray-500">{address}</p>
                )}
            </div>
        </div>
    );
};

export default AdminCard;
