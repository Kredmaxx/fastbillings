import { useEffect, useRef, useState } from "react";
import { useReactToPrint } from "react-to-print";
import { useNavigate, useParams } from "react-router-dom";
import { useSelector } from "react-redux";
import type { RootState } from "@store/index";
import Constants from "@constants/api";
import axios from "axios";
import ChallanTemplateA from "./ChallanTemplateA";
import type { DeliveryChannalDetail } from "@models/delivery-challan";

const ViewDeliveryChallan: React.FC = () => {
    const { id: challanId } = useParams<{ id: string }>()
    const { token } = useSelector((state: RootState) => state.auth);
    const [challanDetails, setChallanDetails] = useState<DeliveryChannalDetail | null>(null);

    useEffect(() => {
        const fetchChallanDetails = async () => {
            try {
                const response = await axios.get(`${Constants.FETCH_DELIVERY_CHALLAN_FOR_EDIT_URL}/${challanId}`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                })
                if (response.data.data) {
                    setChallanDetails(response.data.data);
                }
            } catch (error) {
                console.error('Error fetching invoice details:', error);
            }
        }
        if (challanId && token) {
            fetchChallanDetails();
        }
    }, [challanId, token]);

    const navigate = useNavigate();
    const template = 1;
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
    return (
        <>
            {/* Printable content */}
            <div ref={componentRef}>
                {template === 1 && challanDetails ? <ChallanTemplateA challanData={challanDetails} /> : <div>Template 2</div>}
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
                <button
                    onClick={() => navigate("/admin/delivery-challans")}
                    className="bg-gray-300 hover:bg-gray-400 text-gray-950 px-4 py-2 rounded cursor-pointer"
                >
                    Back
                </button>
            </div>
        </>
    );
};

export default ViewDeliveryChallan;