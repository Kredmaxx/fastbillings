import type { ReactNode } from "react";

export type NavLinkItem = {
    type: 'link';
    to: string;
    title: string;
    slug: string;
    icon?: ReactNode;
    addPath?: string;
};

export type NavCollapsibleItem = {
    type: 'collapsible';
    id: string;
    icon: ReactNode;
    title: string;
    slug: string;
    children: (NavLinkItem | NavCollapsibleItem)[]; // Recursive type
    addPath?: string;
};

export type NavHeaderItem = { type: 'header'; title: string, slug: string };

export type NavItemType = NavLinkItem | NavCollapsibleItem | NavHeaderItem;
