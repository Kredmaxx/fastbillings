import { Autocomplete, TextField, Box } from '@mui/material';
import type { SyntheticEvent } from 'react';
type OptionType = {
    id: string;
    name: string;
};

interface SearchableDropdownProps {
    label?: string | null;
    value: OptionType | null;
    options: OptionType[];
    inputValue?: string;
    onInputChange?: (event: SyntheticEvent, value: string) => void;
    onChange?: (event: SyntheticEvent, value: OptionType | null) => void;
    disabled?: boolean;
    required?: boolean;
    placeholder?: string;
    loading?: boolean;
    noAsterisk?: boolean;
}

const SearchableDropdown = ({
    label,
    value,
    options,
    inputValue,
    onInputChange,
    onChange,
    disabled = false,
    required = false,
    placeholder = `Select ${label}`,
    loading = false,
    noAsterisk = false,
}: SearchableDropdownProps) => {
    return (
        <Box>
            <label className="block text-sm font-medium text-gray-700 mb-1">
                {label} {required && !noAsterisk && <span className="text-red-500">*</span>}
            </label>
            <Autocomplete
                disablePortal
                options={options}
                value={value}
                inputValue={inputValue}
                onInputChange={onInputChange}
                onChange={onChange}
                getOptionLabel={(option) => option.name}
                isOptionEqualToValue={(option, value) => option.id === value.id}
                disabled={disabled}
                loading={loading}
                renderOption={(props, option) => (
                    <li {...props} key={option.id}>
                        {option.name}
                    </li>
                )}
                renderInput={(params) => (
                    <TextField
                        {...params}
                        placeholder={placeholder}
                        size="small"
                        variant="outlined"
                        InputLabelProps={{ shrink: false }}
                        sx={{
                            '& .MuiOutlinedInput-root': {
                                borderRadius: '8px',
                                backgroundColor: '#fff',
                                color: '#374151', // gray-700
                                fontSize: '14px',
                                height: '42px',
                                '&.Mui-disabled': {
                                    backgroundColor: '#f3f4f6', // gray-100
                                },
                                '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
                                    borderColor: '#7539FF', // purple-600
                                    borderWidth: '1px',
                                },
                            },
                            '& .MuiOutlinedInput-notchedOutline': {
                                borderColor: '#d1d5db', // gray-300
                            },
                            '&:hover .MuiOutlinedInput-notchedOutline': {
                                borderColor: '#7539FF', // purple-600
                            },
                        }}
                    />
                )}
            />
        </Box>
    );
};

export default SearchableDropdown;