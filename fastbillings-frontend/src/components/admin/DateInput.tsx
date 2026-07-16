import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import type { FC } from 'react';

interface DateInputProps {
    label: string;
    value: Date | null;
    onChange: (date: Date | null) => void;
    minDate?: Date;
    maxDate?: Date;
    isRequired?: boolean;
}

const DateInput: FC<DateInputProps> = ({ label, value, onChange, minDate, maxDate, isRequired }) => {
    return (
        <div>
            <label className="block text-sm font-medium text-gray-700 pb-1">
                {label} {isRequired && <span className="text-red-500">*</span>}
            </label>
            <DatePicker
                value={value}
                onChange={onChange}
                minDate={minDate}
                maxDate={maxDate}
                format="dd/MM/yyyy"
                slotProps={{
                    textField: {
                        size: 'small',
                        fullWidth: true,
                        sx: {
                            backgroundColor: 'white',
                            borderRadius: '6px',
                            '& .MuiOutlinedInput-root': {
                                paddingRight: '8px',
                            },
                            '& .MuiOutlinedInput-notchedOutline': {
                                borderColor: '#d1d5db', // Tailwind gray-300
                            },
                            '&:hover .MuiOutlinedInput-notchedOutline': {
                                borderColor: '#a855f7', // Tailwind purple-600
                            },
                            '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
                                borderColor: '#a855f7',
                            },
                        },
                    },
                }}
            />
        </div>
    );
};

export default DateInput;