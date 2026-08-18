import { BRAND } from "@constants/brand";
import { Helmet } from "react-helmet-async";
import { useEffect } from "react";

interface SeoProps {
    title?: string;
    description?: string;
    keywords?: string;
}

/**
 * App-wide SEO / browser chrome always uses Byzkon brand assets.
 * Tenant company logos (siteLogo / favicon / companyLogo) are reserved for
 * invoices and other tenant-facing documents — never for the product UI.
 */
const Seo: React.FC<SeoProps> = ({ title, description, keywords }) => {
    const favicon = `${BRAND.logos.favicon}?v=12`;
    const finalTitle = title ? `${BRAND.name} | ${title}` : `${BRAND.name} | Smart Invoicing & ERP`;
    const finalDescription = description || BRAND.description;
    const finalKeywords = keywords || BRAND.keywords;

    useEffect(() => {
        document.title = finalTitle;
    }, [finalTitle]);

    useEffect(() => {
        let link = document.querySelector("link[rel*='icon']") as HTMLLinkElement;
        if (!link) {
            link = document.createElement("link");
            link.rel = "icon";
            document.head.appendChild(link);
        }
        link.type = "image/png";
        link.href = favicon;
    }, [favicon]);

    return (
        <Helmet>
            <title>{finalTitle}</title>
            <meta name="description" content={finalDescription} />
            <meta name="keywords" content={finalKeywords} />
            <link rel="icon" type="image/png" href={favicon} />
        </Helmet>
    );
};

export default Seo;
