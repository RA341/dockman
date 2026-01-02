import {type ReactElement, type ReactNode, type SyntheticEvent, useMemo} from "react";
import {useNavigate, useParams, useSearchParams} from "react-router-dom";
import {Box, Breadcrumbs, IconButton, Link as MuiLink, Paper, Stack, Tab, Tabs, Typography} from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';
import TerminalIcon from '@mui/icons-material/Terminal';
import InspectTabLog from "./inspect-tab-log.tsx";
import InspectTabExec from "./inspect-tab-exec.tsx";
import InspectTabInfo from "./inspect-tab-info.tsx";
import scrollbarStyles from "../../components/scrollbar-style.tsx";

interface TabConfig {
    id: string;
    label: string;
    icon: ReactElement;
    component: ReactNode;
}

const ContainerInspect = () => {
    const {id: containerId} = useParams();
    const [searchParams, setSearchParams] = useSearchParams();
    const navigate = useNavigate();
    const {host} = useParams();


    const tabConfigurations: TabConfig[] = useMemo(() => [
        {
            id: "info",
            label: "Info",
            icon: <InfoOutlinedIcon sx={{fontSize: 18}}/>,
            component: <InspectTabInfo containerId={containerId!}/>
        },
        {
            id: "logs",
            label: "Logs",
            icon: <ReceiptLongIcon sx={{fontSize: 18}}/>,
            component: <InspectTabLog containerID={containerId!}/>
        },
        {
            id: "exec",
            label: "Exec",
            icon: <TerminalIcon sx={{fontSize: 18}}/>,
            component: <InspectTabExec containerID={containerId!}/>
        },
        // {
        //     id: "files",
        //     label: "Files",
        //     icon: <FolderOpenIcon sx={{fontSize: 18}}/>,
        //     component: <InspectTabFiles containerID={containerId!}/>
        // },
    ], [containerId]);

    const currentTabId = searchParams.get("tabId") || "info";
    const tabValue = Math.max(0, tabConfigurations.findIndex(t => t.id === currentTabId));

    const handleTabChange = (_: SyntheticEvent, newValue: number) => {
        const selectedTab = tabConfigurations[newValue];
        setSearchParams({tabId: selectedTab.id});
    };

    if (!containerId) {
        return (
            <Box sx={{p: 4, textAlign: 'center'}}>
                <Typography color="error">Unknown Container Id</Typography>
            </Box>
        );
    }

    return (
        <Box sx={{
            display: 'flex',
            flexDirection: 'column',
            height: '100vh',
            overflow: 'hidden',
            bgcolor: 'background.default',
            ...scrollbarStyles
        }}>
            {/* Header Area */}
            <Paper
                elevation={0}
                square
                sx={{
                    borderBottom: '1px solid',
                    borderColor: 'divider',
                    bgcolor: 'background.paper',
                    pt: 2, px: 3
                }}
            >
                <Stack spacing={2}>
                    <Stack direction="row" alignItems="center" spacing={1}>
                        <IconButton
                            onClick={() => navigate(`/${host}/containers`)}
                            size="small"
                            sx={{border: '1px solid', borderColor: 'divider'}}
                        >
                            <ArrowBackIcon fontSize="small"/>
                        </IconButton>

                        <Box sx={{ml: 1}}>
                            <Breadcrumbs aria-label="breadcrumb" sx={{'& .MuiBreadcrumbs-separator': {mx: 0.5}}}>
                                <MuiLink underline="hover" color="inherit" sx={{cursor: 'pointer', fontSize: '0.8rem'}}
                                         onClick={() => navigate(`/${host}/containers`)}>
                                    Containers
                                </MuiLink>
                                <Typography color="text.primary" sx={{fontSize: '0.8rem', fontWeight: 700}}>
                                    Inspect
                                </Typography>
                            </Breadcrumbs>
                            <Typography variant="h6" sx={{fontWeight: 800, lineHeight: 1.2}}>
                                {containerId.substring(0, 12)}
                            </Typography>
                        </Box>
                    </Stack>

                    <Tabs
                        value={tabValue}
                        onChange={handleTabChange}
                        variant="standard"
                        sx={{
                            minHeight: 40,
                            '& .MuiTab-root': {
                                textTransform: 'none',
                                fontWeight: 600,
                                fontSize: '0.9rem',
                                minHeight: 40,
                                minWidth: 100,
                                mr: 2,
                                color: 'text.secondary',
                                '&.Mui-selected': {
                                    color: 'primary.main',
                                },
                            },
                        }}
                    >
                        {tabConfigurations.map((tab) => (
                            <Tab
                                key={tab.id}
                                icon={tab.icon}
                                iconPosition="start"
                                label={tab.label}
                            />
                        ))}
                    </Tabs>
                </Stack>
            </Paper>

            <Box sx={{
                flexGrow: 1,
                overflowY: 'auto',
                position: 'relative',
            }}>
                {tabConfigurations.map((tab, index) => (
                    <div
                        key={tab.id}
                        role="tabpanel"
                        hidden={tabValue !== index}
                        style={{height: '100%'}}
                    >
                        {tabValue === index && (
                            <Box sx={{height: '100%'}}>
                                {tab.component}
                            </Box>
                        )}
                    </div>
                ))}
            </Box>
        </Box>
    );
};

export default ContainerInspect;
