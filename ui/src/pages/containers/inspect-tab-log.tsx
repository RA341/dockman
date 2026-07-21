import LogsViewer from "../../components/log-viewer/logs-viewer.tsx";

const InspectTabLog = ({containerID}: { containerID: string }) => {
    return <LogsViewer containers={[{id: containerID}]}/>;
};

export default InspectTabLog;
