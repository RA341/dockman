// todo
// import {callRPC, useClient} from "../../lib/api.ts";
// import {DockerService, type File as DFile} from "../../gen/docker/v1/docker_pb.ts";
// import {useCallback, useEffect, useMemo, useState} from "react";
// import {useSnackbar} from "../../hooks/snackbar.ts";
// import {
//     Box,
//     Chip,
//     IconButton,
//     Paper,
//     Table,
//     TableBody,
//     TableCell,
//     TableContainer,
//     TableHead,
//     TableRow,
//     Typography,
//     useTheme
// } from "@mui/material";
//
// import {
//     ArrowDownward,
//     ArrowRight,
//     Folder as FolderIcon,
//     FolderOpen,
//     InsertDriveFile as FileIcon
// } from '@mui/icons-material';
// import {formatBytes} from "../../lib/editor.ts";
//
// const InspectTabFiles = ({containerID}: { containerID: string }) => {
//     const docker = useClient(DockerService)
//     const {showError} = useSnackbar()
//     const [files, setFiles] = useState<DFile[]>([])
//
//     const fetchFiles = useCallback(async () => {
//         const {val, err} = await callRPC(() => docker.containerFiles({containerId: containerID}))
//         if (err) {
//             showError(err)
//         } else {
//             setFiles(val?.files ?? [])
//         }
//     }, [containerID, docker)
//
//     useEffect(() => {
//         fetchFiles().then()
//     }, [fetchFiles])
//
//     const fileTree = useMemo(() => buildFileTree(files), [files]);
//
//     return (
//         <Paper elevation={0} sx={{width: '100%', overflow: 'hidden', border: '1px solid #e0e0e0', borderRadius: 2}}>
//             <TableContainer sx={{maxHeight: 800}}>
//                 <Table stickyHeader aria-label="collapsible table" size="small">
//                     <TableHead>
//                         <TableRow>
//                             <TableCell sx={{fontWeight: 'bold', minWidth: 300}}>Name</TableCell>
//                             <TableCell sx={{fontWeight: 'bold', width: 100}}>Status</TableCell>
//                             <TableCell sx={{fontWeight: 'bold'}} align="right">Size</TableCell>
//                             <TableCell sx={{fontWeight: 'bold'}}>Mode</TableCell>
//                             <TableCell sx={{fontWeight: 'bold'}}>Modified</TableCell>
//                         </TableRow>
//                     </TableHead>
//                     <TableBody>
//                         {fileTree.map((node) => (
//                             <FileRow key={node.name} node={node} level={0}/>
//                         ))}
//                     </TableBody>
//                 </Table>
//             </TableContainer>
//         </Paper>
//     );
// };
//
// const buildFileTree = (files) => {
//     const root = [];
//
//     files.forEach((file) => {
//         // Remove leading slash and split
//         const parts = file.path.replace(/^\//, '').split('/');
//
//         let currentLevel = root;
//
//         parts.forEach((part, index) => {
//             // Check if this part exists in current level
//             let existingPath = currentLevel.find(p => p.name === part);
//
//             if (existingPath) {
//                 // If we are at the last part (the actual file/dir entry provided)
//                 // merge the details into the existing node (in case it was created synthetically before)
//                 if (index === parts.length - 1) {
//                     Object.assign(existingPath, {...file, name: part});
//                 }
//                 currentLevel = existingPath.children;
//             } else {
//                 // Create new node
//                 const newNode = {
//                     name: part,
//                     children: [],
//                     // If this is the last part, add the file data.
//                     // If not, it's a parent folder we found along the way (synthetic).
//                     ...(index === parts.length - 1 ? file : {isDir: true, path: part})
//                 };
//
//                 currentLevel.push(newNode);
//                 currentLevel = newNode.children;
//             }
//         });
//     });
//
//     return root;
// };
//
// // --- Recursive Row Component ---
// const FileRow = ({node, level = 0}) => {
//     const theme = useTheme();
//     const [open, setOpen] = useState(false);
//
//     const isDir = node.isDir || (node.children && node.children.length > 0);
//     const hasChildren = node.children && node.children.length > 0;
//
//     // Indentation based on depth level
//     const paddingLeft = level * 20 + 10;
//
//     // Handle Toggle
//     const handleToggle = () => setOpen(!open);
//
//     // Color logic for diff state
//     const getDiffColor = (state) => {
//         if (!state) return 'default';
//         const s = state.toLowerCase();
//         if (s.includes('new') || s.includes('add')) return 'success';
//         if (s.includes('mod')) return 'warning';
//         if (s.includes('del')) return 'error';
//         return 'default';
//     };
//
//     return (
//         <>
//             <TableRow
//                 hover
//                 sx={{'& > *': {borderBottom: 'unset'}}}
//             >
//                 {/* File Name Column with Indentation */}
//                 <TableCell component="th" scope="row">
//                     <Box sx={{display: 'flex', alignItems: 'center', pl: `${paddingLeft}px`}}>
//                         {/* Expand/Collapse Button */}
//                         <Box sx={{width: 24, display: 'flex', justifyContent: 'center', mr: 1}}>
//                             {hasChildren ? (
//                                 <IconButton aria-label="expand row" size="small" onClick={handleToggle}>
//                                     {open ? <ArrowDownward fontSize="inherit"/> : <ArrowRight fontSize="inherit"/>}
//                                 </IconButton>
//                             ) : (
//                                 <Box sx={{width: 24}}/> // Spacer for alignment
//                             )}
//                         </Box>
//
//                         {/* Icon */}
//                         <Box sx={{mr: 2, color: isDir ? theme.palette.warning.main : theme.palette.text.secondary}}>
//                             {isDir ? (open ? <FolderOpen/> : <FolderIcon/>) : <FileIcon/>}
//                         </Box>
//
//                         {/* Name */}
//                         <Box>
//                             <Typography variant="body2" fontWeight={isDir ? 600 : 400}>
//                                 {node.name}
//                             </Typography>
//                         </Box>
//                     </Box>
//                 </TableCell>
//
//                 {/* Diff State */}
//                 <TableCell>
//                     {node.diffState && (
//                         <Chip
//                             label={node.diffState}
//                             size="small"
//                             color={getDiffColor(node.diffState)}
//                             variant="outlined"
//                             sx={{height: 20, fontSize: '0.65rem'}}
//                         />
//                     )}
//                 </TableCell>
//
//                 {/* Size */}
//                 <TableCell align="right">
//                     <Typography variant="body2" fontFamily="monospace">
//                         {isDir ? '' : formatBytes(node.size || 0)}
//                     </Typography>
//                 </TableCell>
//
//                 {/* Mode / Permissions */}
//                 <TableCell>
//                     <Typography variant="caption" fontFamily="monospace" color="text.secondary">
//                         {node.mode || '-'}
//                     </Typography>
//                 </TableCell>
//
//                 {/* Modified Time */}
//                 <TableCell>
//                     <Typography variant="body2" fontSize="0.85rem">
//                         {node.modTime ? new Date(node.modTime).toLocaleDateString() : '-'}
//                     </Typography>
//                 </TableCell>
//             </TableRow>
//
//             {/* Recursive Children Rendering */}
//             {hasChildren && open && (
//                 node.children.map((childNode) => (
//                     <FileRow
//                         key={childNode.path + childNode.name}
//                         node={childNode}
//                         level={level + 1}
//                     />
//                 ))
//             )}
//         </>
//     );
// };
//
// const formatDate = (dateString: string) => {
//     if (!dateString) return '-';
//     return new Date(dateString).toLocaleString(undefined, {
//         dateStyle: 'medium',
//         timeStyle: 'short',
//     });
// };
//
// const getDiffStatusColor = (state: string) => {
//     const s = state.toLowerCase();
//     if (s.includes('new') || s.includes('add')) return 'success';
//     if (s.includes('mod') || s.includes('change')) return 'warning';
//     if (s.includes('del') || s.includes('rem')) return 'error';
//     return 'default'; // default grey
// };
//
// export default InspectTabFiles;