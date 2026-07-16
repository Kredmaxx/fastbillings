import type { ReactNode } from 'react';

interface TableProps {
  headers: string[];
  children: ReactNode;
}

const Table = ({ headers, children }: TableProps) => {
  return (
    <div className="w-full rounded-lg border border-gray-100 overflow-hidden">
      <table className="w-full bg-white text-sm text-gray-950 border-collapse border border-gray-100">
        <thead className="bg-gray-100 uppercase text-xs font-semibold">
          <tr>
            {headers.map((header, idx) => (
              <th
                key={idx}
                className="px-4 py-3 text-left border-b border-gray-100"
              >
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {children}
        </tbody>
      </table>
    </div>

  );
};

export default Table;