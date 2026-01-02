// interface DiffViewProps {
//     commitId: string;
//     currentContent: string;
//     selectedFile: string;
// }
//
// export function DiffViewer({commitId, currentContent, selectedFile}: DiffViewProps) {
//     const {showError} = useSnackbar();
//     const [commitContent, setCommitContent] = useState("");
//     const [loading, setLoading] = useState(true);
//
//     const fetchFileAtCommit = useCallback(async () => {
//         setLoading(true);
//         // const {file, err} = await downloadFileAtCommit(selectedFile, commitId);
//         // if (err) {
//         //     showError(err);
//         // } else {
//         //     setCommitContent(file);
//         // }
//         setLoading(false);
//     }, [commitId, selectedFile]);
//
//     useEffect(() => {
//         fetchFileAtCommit().then();
//     }, [fetchFileAtCommit]);
//
//     if (loading) {
//         return (
//             <Box sx={{display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%'}}>
//                 <CircularProgress/>
//             </Box>
//         );
//     }
//
//     return (
//         // Add width: '100%' to this root Box
//         <Box sx={{
//             height: '100%',
//             width: '100%',
//             display: 'flex',
//             flexDirection: 'column',
//             border: '1px solid #333'
//         }}>
//             {/* Label Bar */}
//             <Box
//                 sx={{
//                     display: 'flex',
//                     justifyContent: 'space-around',
//                     backgroundColor: '#1E1E1E',
//                     py: 0.5,
//                     borderBottom: '1px solid #333',
//                 }}
//             >
//                 <Typography
//                     variant="caption"
//                     sx={{
//                         color: '#60a5fa', // Blue color
//                         flex: 1,
//                         textAlign: 'center',
//                         fontSize: '0.8rem',
//                         fontWeight: 'bold',
//                     }}
//                 >
//                     Commit: {commitId.substring(0, 7)}
//                 </Typography>
//                 <Typography
//                     variant="caption"
//                     sx={{
//                         color: '#4ade80', // Green color
//                         flex: 1,
//                         textAlign: 'center',
//                         fontSize: '0.8rem',
//                         fontWeight: 'bold',
//                     }}
//                 >
//                     Yours
//                 </Typography>
//             </Box>
//
//             {/* Diff Editor Wrapper: Add minHeight: 0 for robust flex scaling */}
//             <Box sx={{flex: 1, minHeight: 0}}>
//                 <DiffEditor
//                     height="100%"
//                     theme="vs-dark"
//                     original={commitContent}
//                     modified={currentContent}
//                     language={getLanguageFromExtension(selectedFile)}
//                     options={{
//                         readOnly: true,
//                         renderSideBySide: true,
//                     }}
//                 />
//             </Box>
//         </Box>
//     );
// }