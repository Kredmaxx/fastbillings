import { useState } from "react";
import ExpenseCategoryList from "@pages/admin/finance-and-accounting/ExpenseCategoryList";
import CustomFieldList from "../customFields/CustomFieldList";
interface TabProps {
    label: string;
    slug: string;
}
const tabs = [
    { label: 'Expense Categories', slug: 'expense-categories' },
    { label: 'Custom Fields', slug: 'custom-fields' }
];

const ExpenseSettings: React.FC = () => {

    const [activeTab, setActiveTab] = useState<TabProps>(tabs[0]);

    return (
        <div className="space-y-4">
            <h4 className="text-2xl font-bold">Expense Settings</h4>
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
                {activeTab.slug === 'expense-categories' && <ExpenseCategoryList />}
                {activeTab.slug === 'custom-fields' && <CustomFieldList moduleSlug="expenses" />}
            </div>
        </div>
    );
}
export default ExpenseSettings;