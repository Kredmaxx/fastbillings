import { useState } from "react";
import Preferences from "@pages/admin/settings/moduleSettings/quotation/Preferences";
import CustomFieldList from "../customFields/CustomFieldList";
interface TabProps {
    label: string;
    slug: string;
}
const tabs = [
    { label: 'Preferences', slug: 'preferences' },
    { label: 'Custom Fields', slug: 'custom-fields' }
];

const QuotationSettings: React.FC = () => {

    const [activeTab, setActiveTab] = useState<TabProps>(tabs[0]);

    return (
        <div className="space-y-4">
            <h4 className="text-2xl font-bold">Quotation Settings</h4>
            <div className="flex gap-4 py-2">
                {tabs.map((tab, index) => {
                    return (
                        <button
                            key={index + 1}
                            className={`font-medium text-sm ${activeTab?.slug === tab.slug ? 'border-b-2 text-purple-600' : ''} hover:text-purple-600`}
                            onClick={() => setActiveTab(tab)}
                        >{tab.label}
                        </button>
                    );
                })}
            </div>
            {/* Tab Content */}
            <div className="mt-4">
                {activeTab.slug === 'preferences' && <Preferences />}
                {activeTab.slug === 'custom-fields' && <CustomFieldList moduleSlug="quotations" />}
            </div>
        </div>
    );
}
export default QuotationSettings;