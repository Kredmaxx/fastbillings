import React, { useState } from "react";

interface SupplierCardProps {
    profileImage?: string | null;
    firstName: string;
    lastName?: string;
    email?: string;
    phone?: string;
    defaultImage?: string;
    className?: string;
}

const SupplierCard: React.FC<SupplierCardProps> = ({
    profileImage,
    firstName,
    lastName = "",
    email,
    phone,
    defaultImage,
    className = "",
}) => {
    const [imgError, setImgError] = useState(false);

    const fullName = `${firstName} ${lastName}`.trim();
    const firstLetter = fullName.charAt(0).toUpperCase();
    const shouldShowFallback = !profileImage || imgError;

    return (
        <div
            className={`flex gap-3 p-4 bg-gray-50 border border-gray-200 rounded-md ${className}`}
        >
            {/* Avatar */}
            <div className="w-15 h-15 flex items-center justify-center rounded bg-white border border-gray-200">
                {shouldShowFallback ? (
                    defaultImage ? (
                        <img
                            src={defaultImage}
                            alt="Default Supplier"
                            className="w-12 h-12 object-contain"
                        />
                    ) : (
                        <div className="w-12 h-12 flex items-center justify-center rounded-full bg-purple-600 text-white font-bold text-xl">
                            {firstLetter || "?"}
                        </div>
                    )
                ) : (
                    <img
                        src={profileImage}
                        alt={fullName}
                        className="w-12 h-12 object-contain"
                        onError={() => setImgError(true)}
                    />
                )}
            </div>

            {/* Details */}
            <div>
                <h4 className="font-semibold text-gray-950 uppercase">
                    {fullName}
                </h4>
                {email && (
                    <p className="text-sm text-gray-600">
                        <span className="font-semibold">Email :</span> {email}
                    </p>
                )}
                {phone && (
                    <p className="text-sm text-gray-500">
                        <span className="font-semibold">Phone :</span> {phone}
                    </p>
                )}
            </div>
        </div>
    );
};

export default SupplierCard;
