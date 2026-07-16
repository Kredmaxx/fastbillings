import { ArrowDownLeft, ArrowUpRight } from "lucide-react";
import type { FC, ReactNode } from "react";

interface StatsCardProps {
    title: string;
    value: number | string;
    difference: number;
    icon: ReactNode;
    color: string; // e.g. "red", "green", "yellow", "purple"
}

const StatsCard: FC<StatsCardProps> = ({ title, value, difference, icon, color, }) => {
    const isPositive = difference >= 0;

    return (
        <div
            className={`relative bg-white rounded-xl shadow-sm hover:shadow-md transition-all p-4 border border-gray-100`}
        >
            {/* Top: title + icon */}
            <div className="flex justify-between items-center">
                <h3 className="text-sm font-medium text-gray-600">
                    {title}
                </h3>
                <div
                    className={`flex items-center justify-center w-10 h-10 rounded-full border border-${color}-300 bg-${color}-50 text-${color}-600`}
                >
                    {icon}
                </div>
            </div>

            {/* Value */}
            <p className="text-2xl font-bold text-gray-950 mt-3">
                {value}
            </p>

            {/* Difference */}
            <div className="flex items-center mt-1 text-xs">
                <span
                    className={`flex items-center font-medium ${isPositive ? "text-green-600" : "text-red-600"
                        }`}
                >
                    {isPositive ? (
                        <ArrowUpRight className="w-3 h-3 mr-1" />
                    ) : (
                        <ArrowDownLeft className="w-3 h-3 mr-1" />
                    )}
                    {difference.toFixed()}%
                </span>
                <span className="ml-1 text-gray-400">from last month</span>
            </div>
        </div>
    );
};

export default StatsCard;
