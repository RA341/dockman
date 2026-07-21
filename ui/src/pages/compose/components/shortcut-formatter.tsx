import {Box, Typography} from "@mui/material";
import React from "react";
import {KeyChar} from "../../../components/keychar.tsx";

export const ShortcutFormatter = ({title, keyCombo}: { title: string, keyCombo: string[] }) => {
    return (
        <Box
            sx={{
                display: "flex",
                alignItems: "center",
                gap: 0.5
            }}>
            {title !== "" && <Typography variant="body2">{title}</Typography>}
            {
                keyCombo.length > 0 && <Box
                    sx={{
                        display: "flex",
                        alignItems: "center",
                        gap: 0.3,
                        ml: 1
                    }}>{
                    keyCombo.map((key, index) => (
                        <React.Fragment key={key}>
                            <KeyChar>{key}</KeyChar>
                            {index < keyCombo.length - 1 && (
                                <Typography variant="body2" component="span" sx={{mx: 0.3}}>
                                    +
                                </Typography>
                            )}
                        </React.Fragment>
                    ))
                }
                </Box>
            }
        </Box>
    );
};
