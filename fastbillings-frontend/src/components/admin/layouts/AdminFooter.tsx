// components/Footer.tsx
// A simple footer for the dashboard.

const AdminFooter = () => {
  const currentYear: number = new Date().getFullYear();
  return (
    <footer className="text-center p-4 text-sm text-gray-500 bg-white border-t">
      &copy; {currentYear} My App. All Rights Reserved.
    </footer>
  );
}

export default AdminFooter;