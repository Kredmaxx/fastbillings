export interface CustomFieldTypeShape {
    id: string;
    name: string;
    slug: string;
    status: string;
}

export interface CustomFieldOption {
    label: string;
    value: string;
}

export interface CustomFieldShape {
    id?: string;
    moduleId: string;
    labelName: string;
    fieldSlug: string;
    dataType: string;
    helpText?: string;
    isMandatory: boolean;
    showInTable: boolean;
    options?: CustomFieldOption[];
    status?: string;
}