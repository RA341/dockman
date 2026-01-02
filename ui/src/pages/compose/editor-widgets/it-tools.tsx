import {Box} from "@mui/material";
import {useConfig} from "../../../hooks/config.ts";

const ItToolsWidget = () => {
    const {dockYaml} = useConfig()

    const itToolsUrl = dockYaml?.customTools["ittools"] ?? "https://it-tools.tech/"
    console.log("itToolsUrl", itToolsUrl)

    return (
        <Box sx={{
            position: 'absolute',
            top: 0, left: 0,
            width: '100%', height: '100%',
            overflow: 'hidden'
        }}>
            <Box
                component="iframe"
                title="It tools"
                src={itToolsUrl}
                sx={{
                    // Hide the default scrollbar its ugly
                    width: 'calc(100% + 20px)',
                    height: '100%',
                    border: 'none',
                }}
            />
        </Box>
    );
};

export default ItToolsWidget;