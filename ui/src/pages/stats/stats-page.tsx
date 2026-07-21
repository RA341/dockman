import {TabStat} from "../compose/tab-stats.tsx";

// the stats view is TabStat in page mode: it brings the uniform view header
// (title, count, host, search) on top of the aggregate band and the table
const StatsPage = () => <TabStat variant="page"/>;

export default StatsPage;
