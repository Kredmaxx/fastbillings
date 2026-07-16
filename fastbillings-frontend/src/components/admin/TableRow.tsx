import { ActionMenu } from '@components/admin/ActionMenu';

type Action<T> = {
  label: string;
  icon?: React.ReactNode;
  onClick: (row: T) => void;
  isDisabled?: (row: T) => boolean;
};

type TableRowProps<T> = {
  index: number;
  row: T;
  columns: React.ReactNode[];
  actions?: Action<T>[];
  onRowClick?: (row: T) => void;
};

const TableRow = <T,>({ index, row, columns, actions, onRowClick }: TableRowProps<T>) => {

  return (
    <tr
      className={`border-b border-[#EEF3FB] transition-colors hover:bg-[#F4F8FF]${onRowClick ? ' cursor-pointer' : ''}`}
      {...(onRowClick ? { onClick: () => onRowClick(row) } : {})}
    >
      <td className="px-3 py-1 text-sm text-gray-700">{index}</td>
      {columns.map((col, colIndex) => (
        <td key={colIndex} className={`px-3 py-1 text-sm text-gray-500 font-medium`}>
          {col}
        </td>
      ))}
      {actions && (
        <td className="px-3 py-1" onClick={(e) => e.stopPropagation()}>
          <div className="flex justify-start">
            <ActionMenu row={row} actions={actions} />
          </div>
        </td>
      )}
    </tr>
  );
};

export default TableRow;