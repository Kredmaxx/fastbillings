import { useEffect, useRef, useState } from "react";
import { useReactToPrint } from "react-to-print";
import { useNavigate, useParams } from "react-router-dom";
import Constants from "@constants/api";
import axios from "axios";
import LoaderSpinner from "@components/admin/LoaderSpinner";
import { useSelector } from "react-redux";
import type { RootState } from "@store/index";
import type { QuotationDetail } from "@models/quotation";
import QuotationTemplate from "./QuotationTemplate";

const ViewQuotation: React.FC = () => {
    const { id: quotationId } = useParams<{ id: string }>()
    const { token } = useSelector((state: RootState) => state.auth);
    const [isFetching, setIsFetching] = useState(true);
    const [quotationDetails, setQuotationDetails] = useState<QuotationDetail | null>(null);

    useEffect(() => {
        const fetchQuotationDetails = async () => {
            try {
                setIsFetching(true);
                const response = await axios.get(`${Constants.FETCH_QUOTATION_DETAILS_URL}/${quotationId}`)
                if (response.data.data) {
                    setQuotationDetails(response.data.data);
                }
            } catch (error) {
                console.error('Error fetching quotation details:', error);
            } finally {
                setIsFetching(false);
            }
        }
        if (quotationId) {
            fetchQuotationDetails();
        }
    }, [quotationId]);

    const navigate = useNavigate();
    const componentRef = useRef<HTMLDivElement>(null);
    const handlePrint = useReactToPrint({
        contentRef: componentRef,
        documentTitle: "Invoice",
        pageStyle: `
        @page {
        size: auto;
        margin: 5mm 5mm 2mm 2mm;
        }
        @page:first {
          margin: 2mm;
        }

        .page-break {
        page-break-before: always;
        }
    `,
    });

    if (isFetching) {
        return (
            <div className="p-6 space-y-4 flex items-center justify-center h-screen">
                <LoaderSpinner />
            </div>
        );
    }

    const SelectedTemplate = QuotationTemplate;
    return (
        <>
            {/* Printable content */}
            <div ref={componentRef}>
                {quotationDetails ? (
                    <SelectedTemplate quotationDeta={quotationDetails} />
                ) : (
                    <p>Loading invoice…</p>
                )}
            </div>

            {/* Print Button */}
            <div className="flex p-12 font-sans text-gray-950 max-w-5xl mx-auto my-8">
                <button
                    onClick={handlePrint}
                    className="mr-4 bg-purple-600 hover:bg-gray-950 text-white px-4 py-2 rounded cursor-pointer"
                >
                    Print / Save as PDF
                </button>
                {/* Back Button */}
                {token &&
                    <button
                        onClick={() => navigate("/admin/quotations")}
                        className="bg-gray-300 hover:bg-gray-400 text-gray-950 px-4 py-2 rounded cursor-pointer"
                    >
                        Back
                    </button>
                }
            </div>
        </>
    );
};

export default ViewQuotation;