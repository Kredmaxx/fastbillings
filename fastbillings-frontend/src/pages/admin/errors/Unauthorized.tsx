import { useNavigate } from "react-router-dom";

const Unauthorized: React.FC = () => {
    const navigate = useNavigate();
    return (
        <div className="flex flex-col items-center justify-center h-screen bg-gray-50">
            <h1 className="text-4xl font-bold text-gray-800 mb-2">
                401
            </h1>
            <p className="text-lg text-gray-600 mb-6">
                Unauthorized – You don’t have access to this page
            </p>
            <button
                type="button"
                onClick={() => navigate("/admin")}
                className="px-6 py-2 text-white bg-purple-600 rounded-lg hover:bg-purple-600 focus:outline-none focus:ring-2 focus:ring-purple-400 focus:ring-offset-2 transition cursor-pointer"
            >
                Back to Home
            </button>
        </div>
    );
};

export default Unauthorized;
