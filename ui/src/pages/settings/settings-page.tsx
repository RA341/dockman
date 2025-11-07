import React from 'react';
import {Box, Tab, Tabs} from "@mui/material";
import {useSearchParams} from 'react-router-dom';
import {TabDockerHosts} from "./tab-host.tsx";
import {TabContainerUpdater} from "./tab-updater.tsx";

// Define the structure for a tab configuration
interface TabConfig {
    label: string;
    component: React.ReactNode;
}

// Configuration array for all the tabs
const tabConfigurations: TabConfig[] = [
    {
        label: "Docker Hosts",
        component: <TabDockerHosts/>
    },
    // {
    //     label: "Container Updater",
    //     component: <TabContainerUpdater/>
    // },
];

interface TabPanelProps {
    children?: React.ReactNode;
    index: number;
    value: number;
}

function TabPanel(props: TabPanelProps) {
    const {children, value, index, ...other} = props;

    return (
        <div
            role="tabpanel"
            hidden={value !== index}
            id={`simple-tabpanel-${index}`}
            aria-labelledby={`simple-tab-${index}`}
            {...other}
        >
            {value === index && (
                <Box sx={{p: 3}}>
                    {children}
                </Box>
            )}
        </div>
    );
}

export function SettingsPage() {
    const [searchParams, setSearchParams] = useSearchParams();

    // Get the 'tab' query param, or default to '0'
    const activeTabIndex = parseInt(searchParams.get('tab') || '0', 10);

    const handleChange = (_event: React.SyntheticEvent, newValue: number) => {
        setSearchParams({tab: newValue.toString()});
    };

    return (
        <>
            <Box sx={{width: '100%'}}>
                <Box sx={{borderBottom: 1, borderColor: 'divider'}}>
                    <Tabs value={activeTabIndex} onChange={handleChange} aria-label="settings tabs">
                        {tabConfigurations.map((tab, index) => (
                            <Tab label={tab.label} key={index}/>
                        ))}
                    </Tabs>
                </Box>
                {tabConfigurations.map((tab, index) => (
                    <TabPanel value={activeTabIndex} index={index} key={index}>
                        {tab.component}
                    </TabPanel>
                ))}
            </Box>
        </>
    );
}
