import React from 'react';
import { Pagination } from '@mui/material';

interface CustomPaginationProps {
  count: number;
  page: number;
  onChange: (event: React.ChangeEvent<unknown>, page: number) => void;
  paginationVariant?: any;
  paginationShape?: 'rounded' | 'circular';
}

const CustomPagination: React.FC<CustomPaginationProps> = ({ count, page, onChange, paginationVariant, paginationShape }) => {
  return (
    <Pagination
      count={count}
      page={page}
      onChange={onChange}
      variant={paginationVariant || 'outlined'}
      shape={paginationShape || 'rounded'}
      sx={{
        '& .MuiPaginationItem-root': {
          color: '#8b5cf6',
          fontWeight: 'medium',
        },
        '& .MuiPaginationItem-page.Mui-selected': {
          backgroundColor: '#8b5cf6',
          color: 'white',
          '&:hover': {
            backgroundColor: '#7c3aed',
          },
        },
        '& .MuiPaginationItem-page:hover': {
          backgroundColor: '#ede9fe',
        },
      }}
    />
  );
};

export default CustomPagination;