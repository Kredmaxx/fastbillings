
// export const formatDate = (date: string | Date, locale = "en-US") => {
//     const d = typeof date === "string" ? new Date(date) : date;
//     return d.toLocaleDateString(locale, {
//         year: "numeric",
//         month: "short",
//         day: "numeric",
//     });
// };

export const formatCurrency = (amount: number, currency = "INR", locale = "en-US") => {
    return new Intl.NumberFormat(locale, {
        style: "currency",
        currency,
        minimumFractionDigits: 2,
    }).format(amount);
};

export const formatNumber = (num: number, locale = "en-US") => {
    return new Intl.NumberFormat(locale).format(num);
};

const ones = [
    "", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine",
];
const teens = [
    "ten", "eleven", "twelve", "thirteen", "fourteen",
    "fifteen", "sixteen", "seventeen", "eighteen", "nineteen",
];
const tens = [
    "", "", "twenty", "thirty", "forty", "fifty",
    "sixty", "seventy", "eighty", "ninety",
];

function numToWordsBelow100(n: number): string {
    if (n < 10) return ones[n];
    if (n < 20) return teens[n - 10];
    return tens[Math.floor(n / 10)] + (n % 10 ? " " + ones[n % 10] : "");
}

export const numberToWords = (num: number): string => {
    if (num === 0) return "zero";

    let words: string[] = [];

    const crore = Math.floor(num / 10000000);
    num %= 10000000;

    const lakh = Math.floor(num / 100000);
    num %= 100000;

    const thousand = Math.floor(num / 1000);
    num %= 1000;

    const hundred = Math.floor(num / 100);
    num %= 100;

    if (crore) words.push(numToWordsBelow100(crore) + " crore");
    if (lakh) words.push(numToWordsBelow100(lakh) + " lakh");
    if (thousand) words.push(numToWordsBelow100(thousand) + " thousand");
    if (hundred) words.push(ones[hundred] + " hundred");
    if (num > 0) words.push(numToWordsBelow100(num));
    
    return toTitleCase(words.join(" ").trim());
};

export const toTitleCase = (str: string): string => {
  return str
    .split(" ")
    .filter(Boolean)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
};


export const systemSettings = {
    currency: {
        code: "USD",
        symbol: "$",
        name: "US Dollar",
    },
    language: {
        code: "en",
        name: "English",
    },
    companyDetails: {
        name: "My Company",
        address: "123 Main Street, Anytown, USA",
        phone: "123-456-7890",
        email: "f3m1E@example.com",
        logo: "",
    },
};

export const formatLocalDateTime = (
  date: Date,
  type: "start" | "end" = "start",
  parseTimeforFilter = false
) => {
  const pad = (n: number) => n.toString().padStart(2, "0");

  if (parseTimeforFilter && type === "start") {
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} 00:00:00`;
  } else if (parseTimeforFilter && type === "end") {
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} 23:59:59`;
  } else {
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
  }
};

