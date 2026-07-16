import type { SystemSettings } from "@models/system-settings";

const STORAGE_KEY = 'systemSettings:v1';

export function readSystemSettings(): SystemSettings | null {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return null;
        return JSON.parse(raw) as SystemSettings;
    } catch (e) {
        console.warn("Failed to read system settings from localStorage", e);
        return null;
    }
}

export function writeSystemSettings(settings: SystemSettings) {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch (e) {
        console.warn("Failed to write system settings to localStorage", e);
    }
}

export function clearSystemSettings() {
    try {
        localStorage.removeItem(STORAGE_KEY);
    } catch { }
}