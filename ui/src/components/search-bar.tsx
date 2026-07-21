import {TextField} from "@mui/material";
import {Search} from '@mui/icons-material';
import type {Ref} from "react";

interface SearchBarProps {
    inputRef: Ref<HTMLInputElement>;
    search: string;
    setSearch: (search: string) => void;
}

function SearchBar({inputRef, search, setSearch}: SearchBarProps) {
    return (
        <TextField
            inputRef={inputRef}
            size="small"
            placeholder={`Search... ALT+Q`}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            slotProps={{
                input: {
                    startAdornment: <Search sx={{mr: 1, color: 'action.active'}}/>,
                }
            }}
            sx={{
                minWidth: 250,
                '& .MuiOutlinedInput-root': {
                    backgroundColor: 'rgba(255, 255, 255, 0.05)',
                    height: 32,
                }
            }}
        />
    );
}

export default SearchBar;