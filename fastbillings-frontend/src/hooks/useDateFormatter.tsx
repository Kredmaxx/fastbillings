import { useCallback } from "react";
import { useSelector } from "react-redux";

import type { RootState } from "@store/index";

/**
 * Centralised date/time formatting.
 *
 * The backend stores the user-selected format as a PHP-style token string
 * (e.g. "d-m-Y", "d/m/Y", "Y-m-d", "F j, Y"). This hook formats against those
 * tokens AND the legacy uppercase tokens (YYYY/MM/DD) that older call sites
 * used, so a single helper renders every date the same way product-wide.
 *
 * The configured format is read from systemSettings, so call sites can simply
 * call `formatDate(date)` — passing a format explicitly still works and wins.
 *
 * Supported tokens:
 *   Year   Y / YYYY = 2025   y / YY = 25
 *   Month  m / MM = 08   n = 8   M / MMM = Aug   F / MMMM = August
 *   Day    d / DD = 05   j = 5   D / DDD = Sat   l / DDDD = Saturday
 *   Time   H = 14   G = 14   h = 02   g = 2   i = 09   s = 07   A = PM   a = pm
 */

export const DEFAULT_DATE_FORMAT = "d-m-Y";
export const DEFAULT_TIME_FORMAT = "h:i A";
const EMPTY = "—";

const MONTHS = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
];
const DAYS = [
    "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday",
];

// Longest tokens first so multi-char tokens win over single-char ones.
const TOKEN_RE = /YYYY|MMMM|DDDD|MMM|DDD|YY|MM|DD|F|l|D|d|j|M|m|n|Y|y|H|G|h|g|i|s|A|a/g;

const tokenValues = (d: Date): Record<string, string> => {
    const h24 = d.getHours();
    const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
    const year = String(d.getFullYear());
    const month = MONTHS[d.getMonth()];
    const day = DAYS[d.getDay()];
    return {
        // year
        YYYY: year, Y: year,
        YY: year.slice(-2), y: year.slice(-2),
        // month
        MMMM: month, F: month,
        MMM: month.slice(0, 3), M: month.slice(0, 3),
        MM: String(d.getMonth() + 1).padStart(2, "0"), m: String(d.getMonth() + 1).padStart(2, "0"),
        n: String(d.getMonth() + 1),
        // day of month / week
        DDDD: day, l: day,
        DDD: day.slice(0, 3), D: day.slice(0, 3),
        DD: String(d.getDate()).padStart(2, "0"), d: String(d.getDate()).padStart(2, "0"),
        j: String(d.getDate()),
        // time
        H: String(h24).padStart(2, "0"), G: String(h24),
        h: String(h12).padStart(2, "0"), g: String(h12),
        i: String(d.getMinutes()).padStart(2, "0"),
        s: String(d.getSeconds()).padStart(2, "0"),
        A: h24 < 12 ? "AM" : "PM", a: h24 < 12 ? "am" : "pm",
    };
};

const toDate = (date: Date | string | number | null | undefined): Date | null => {
    if (date === null || date === undefined || date === "") return null;
    const d = typeof date === "string" || typeof date === "number" ? new Date(date) : date;
    return isNaN(d.getTime()) ? null : d;
};

const applyFormat = (d: Date, format: string): string => {
    const values = tokenValues(d);
    return format.replace(TOKEN_RE, (token) => values[token] ?? token);
};

const useDateFormatter = () => {
    const dateFormat =
        useSelector((state: RootState) => state.systemSettings.data?.dateFormat?.format) ||
        DEFAULT_DATE_FORMAT;
    const timeFormat =
        useSelector((state: RootState) => state.systemSettings.data?.timeFormat?.format) ||
        DEFAULT_TIME_FORMAT;

    // Format a date. `format` is optional — defaults to the configured format.
    const formatDate = useCallback(
        (date: Date | string | number | null | undefined, format?: string): string => {
            const d = toDate(date);
            if (!d) return EMPTY;
            return applyFormat(d, format || dateFormat);
        },
        [dateFormat],
    );

    // Format a date + time using the configured (or supplied) formats.
    const formatDateTime = useCallback(
        (
            date: Date | string | number | null | undefined,
            dFormat?: string,
            tFormat?: string,
        ): string => {
            const d = toDate(date);
            if (!d) return EMPTY;
            return applyFormat(d, `${dFormat || dateFormat} ${tFormat || timeFormat}`);
        },
        [dateFormat, timeFormat],
    );

    return { formatDate, formatDateTime, dateFormat, timeFormat };
};

export default useDateFormatter;
