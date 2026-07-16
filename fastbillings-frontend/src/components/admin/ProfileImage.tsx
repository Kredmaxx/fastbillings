import React, { useState } from "react";

interface ProfileCardProps {
    imageUrl?: string | null;
    name: string;
    email?: string;
    className?: string;
    defaultImage?: string;
    primary?: boolean;
}

const ProfileCard: React.FC<ProfileCardProps> = ({ imageUrl, name, email, className = "", defaultImage, primary = false }) => {
    const [imgError, setImgError] = useState(false);
    const firstLetter = name ? name.trim().charAt(0).toUpperCase() : "?";
    const shouldShowFallback = !imageUrl || imgError;

    return (
        <div className={`flex items-center ${className}`}>
            {shouldShowFallback ? (
                defaultImage ? (
                    <img
                        src={defaultImage}
                        alt="Default Profile"
                        className="h-8 w-8 rounded-full object-cover mr-3 border border-gray-300"
                    />
                ) : (
                    <div className="h-8 w-8 flex items-center justify-center rounded-full mr-3 border border-purple-600 bg-purple-600 text-white font-semibold text-xl">
                        {firstLetter || "?"}
                    </div>
                )
            ) : (
                <img
                    src={imageUrl}
                    alt={name}
                    className="h-8 w-8 rounded-full object-cover mr-3 border border-gray-300"
                    onError={() => setImgError(true)}
                />
            )}

            <div>
                <span className={`font-medium ${primary ? "text-indigo-600" : "text-gray-600"} capitalize`}>
                    {name || "Deleted User"}
                </span>
                {email && (
                    <p className="text-gray-500 text-xs font-medium">{email}</p>
                )}
            </div>
        </div>
    );
};

export default ProfileCard;
