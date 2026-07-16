import { Route } from "react-router-dom";
import Seo from "@components/admin/Seo";

interface SeoRouteProps {
  path?: string;
  index?: boolean;
  element: React.ReactNode;
  seo?: {
    title?: string;
    description?: string;
    keywords?: string;
  };
}

export default function SeoRoute({ seo, element, ...rest }: SeoRouteProps) {
  return (
    <Route
      {...rest}
      element={
        <>
          <Seo {...seo} />
          {element}
        </>
      }
    />
  );
}
