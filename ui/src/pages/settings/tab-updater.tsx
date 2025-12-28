// import {
//     Box,
//     Button,
//     CircularProgress,
//     FormControl,
//     FormControlLabel,
//     InputLabel,
//     MenuItem,
//     Select,
//     Switch,
//     TextField,
//     Typography
// } from "@mui/material"
// import {useConfig} from "../../hooks/config.ts";
// import {type ChangeEvent, useEffect, useState} from "react";
// import {callRPC, useClient} from "../../lib/api.ts";
// import {useSnackbar} from "../../hooks/snackbar.ts";
//
// export function TabContainerUpdater() {
//     const {config, isLoading, updateSettings} = useConfig()
//     const [localConfig, setLocalConfig] = useState(config)
//     const [timeUnit, setTimeUnit] = useState('seconds')
//     const [displayValue, setDisplayValue] = useState('0')
//     const dockerManager = useClient()
//     const {showError, showSuccess} = useSnackbar()
//
//     const timeUnits = {
//         seconds: 1,
//         minutes: 60,
//         hours: 3600,
//         days: 86400
//     }
//
//     useEffect(() => {
//         setLocalConfig(config)
//         if (config?.updater?.IntervalInSeconds) {
//             const seconds = Number(config.updater.IntervalInSeconds)
//             // select appropriate unit
//             if (seconds % 86400 === 0) {
//                 setTimeUnit('days')
//                 setDisplayValue((seconds / 86400).toString())
//             } else if (seconds % 3600 === 0) {
//                 setTimeUnit('hours')
//                 setDisplayValue((seconds / 3600).toString())
//             } else if (seconds % 60 === 0) {
//                 setTimeUnit('minutes')
//                 setDisplayValue((seconds / 60).toString())
//             } else {
//                 setTimeUnit('seconds')
//                 setDisplayValue(seconds.toString())
//             }
//         }
//     }, [config])
//
//     if (isLoading) {
//         return <Box sx={{display: 'flex', justifyContent: 'center', p: 4}}><CircularProgress/></Box>
//     }
//
//     const handleEnableChange = (event: ChangeEvent<HTMLInputElement>) => {
//         localConfig!.updater!.Enable = event.target.checked
//         setLocalConfig({...localConfig})
//     }
//
//     const handleManualUpdate = () => {
//         callRPC(() => dockerManager.startUpdate({})).finally(() => {
//             showSuccess("sent update req")
//         }).catch(error => {
//             showError(error)
//         })
//     }
//
//     const handleNotifyModeChange = (event: ChangeEvent<HTMLInputElement>) => {
//         localConfig!.updater!.NotifyOnly = event.target.checked
//         setLocalConfig({...localConfig})
//     }
//
//     const handleIntervalChange = (event: ChangeEvent<HTMLInputElement>) => {
//         const value = event.target.value
//         setDisplayValue(value)
//         const seconds = Number(value || '0') * timeUnits[timeUnit as keyof typeof timeUnits]
//         localConfig!.updater!.IntervalInSeconds = BigInt(seconds)
//         setLocalConfig({...localConfig})
//     }
//
//     const handleUnitChange = (newUnit: string) => {
//         setTimeUnit(newUnit)
//         const seconds = Number(displayValue || '0') * timeUnits[newUnit as keyof typeof timeUnits]
//         localConfig!.updater!.IntervalInSeconds = BigInt(seconds)
//         setLocalConfig({...localConfig})
//     }
//
//     const handleSave = async () => {
//         // setIsSaving(true)
//         await updateSettings(localConfig, {updateUpdater: true}).finally(() => {
//             // setIsSaving(false)
//         })
//     }
//
//     return (
//         <Box sx={{display: 'flex', justifyContent: 'center', p: 4}}>
//             <Box sx={{
//                 width: '100%',
//                 border: '1px solid',
//                 borderColor: 'divider',
//                 borderRadius: 2,
//                 p: 3,
//                 display: 'flex',
//                 flexDirection: 'column',
//                 alignItems: 'flex-start'
//             }}>
//                 <Box sx={{display: 'flex', flexDirection: 'column', gap: 3, mb: 3, alignItems: 'flex-start'}}>
//                     <FormControlLabel
//                         control={
//                             <Switch
//                                 checked={localConfig?.updater?.Enable || false}
//                                 onChange={handleEnableChange}
//                             />
//                         }
//                         label="Enable Updater"
//                     />
//
//                     <Box sx={{textAlign: 'left'}}>
//                         <FormControlLabel
//                             control={
//                                 <Switch
//                                     checked={localConfig?.updater?.NotifyOnly || false}
//                                     onChange={handleNotifyModeChange}
//                                 />
//                             }
//                             label="Notify Only mode"
//                         />
//                         <Typography variant="caption" sx={{display: 'block', color: 'text.secondary', mt: 0.5}}>
//                             {localConfig.updater?.NotifyOnly ? "You'll only get update notifications. Updates must be installed manually."
//                                 : "New images will be downloaded automatically, and your containers will be updated."}
//                         </Typography>
//                     </Box>
//
//                     <Box sx={{textAlign: 'left'}}>
//                         <Box sx={{display: 'flex', gap: 2, maxWidth: 300}}>
//                             <TextField
//                                 label="Interval"
//                                 type="number"
//                                 value={displayValue}
//                                 onChange={handleIntervalChange}
//                                 sx={{flex: 1}}
//                                 slotProps={{
//                                     input: {
//                                         inputProps: {min: 1}
//                                     }
//                                 }}
//                             />
//
//                             <FormControl sx={{minWidth: 100}}>
//                                 <InputLabel>Unit</InputLabel>
//                                 <Select
//                                     value={timeUnit}
//                                     label="Unit"
//                                     onChange={event => handleUnitChange(event.target.value)}
//                                 >
//                                     <MenuItem value="seconds">Seconds</MenuItem>
//                                     <MenuItem value="minutes">Minutes</MenuItem>
//                                     <MenuItem value="hours">Hours</MenuItem>
//                                     <MenuItem value="days">Days</MenuItem>
//                                 </Select>
//                             </FormControl>
//                         </Box>
//                         <Typography variant="caption" sx={{display: 'block', color: 'text.secondary', mt: 0.5}}>
//                             Set how often to check for updates
//                         </Typography>
//                     </Box>
//
//                     <Box sx={{textAlign: 'left'}}>
//                         <Button
//                             variant="contained"
//                             onClick={handleManualUpdate}
//                             // disabled={isSaving}
//                             sx={{
//                                 position: 'relative',
//                             }}
//                         >
//                             Manual Update
//                         </Button>
//                         <Typography variant="caption" sx={{display: 'block', color: 'text.secondary', mt: 0.5}}>
//                             Runs a test update with default options (ignores your settings) useful for debugging.
//                         </Typography>
//                     </Box>
//
//
//                 </Box>
//
//
//                 {/*todo add loading spinner*/}
//                 <Button
//                     variant="contained"
//                     onClick={handleSave}
//                     // disabled={isSaving}
//                     sx={{
//                         width: 100,
//                         height: 38,
//                         position: 'relative',
//                     }}
//                 >
//                     Save
//                 </Button>
//             </Box>
//         </Box>
//     )
// }