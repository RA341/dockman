import React from 'react';
import {Description, Folder} from '@mui/icons-material';
import {amber, blue} from "@mui/material/colors";

interface SvgFromUrlProps {
    url: string;
    size?: number;
}

const SvgFromUrl: React.FC<SvgFromUrlProps> = ({url, size = 25}) => {
    return (
        <img
            src={url}
            alt="SVG from URL"
            width={size}
            height={size}
            style={{fill: 'currentColor'}} // Note: Styling is limited
        />
    );
};

const SqliteIcon = () => (
    <SvgFromUrl url={'/sqlite.svg'}/>
)

const DockerComposeIcon = () => (
    <SvgFromUrl url={'/docker.svg'}/>
);

const YamlIcon = () => (
    <SvgFromUrl url={'/yaml.png'}/>
);

const EnvIcon = () => (
    <SvgFromUrl url={'/env.png'}/>
);

const GitignoreIcon = () => (
    <SvgFromUrl url={'/git.svg'}/>
);

const DefaultFileIcon = () => (
    <Description sx={{color: blue[200]}}/>
);

export const DockerFolderIcon = () => (
    <SvgFromUrl url={'/docker-folder.svg'}/>
);

export const FolderIcon = () => (
    <Folder sx={{color: amber[800], fontSize: '1.4rem'}}/>
);

export const ContainerIcon = () => (
    <SvgFromUrl url={'/container.svg'}/>
);


export const StacksIcon = () => (
    <SvgFromUrl url={'/stacks.svg'}/>
);


export const StatsIcon = () => (
    <SvgFromUrl url={'/stats.svg'}/>
);

export const ImagesIcon = () => (
    <SvgFromUrl url={'/images.svg'}/>
);

export const NetworkIcon = () => (
    <SvgFromUrl url={'/network.svg'}/>
);

export const VolumeIcon = () => (
    <SvgFromUrl url={'/volumes.svg'}/>
);

interface FileIconProps {
    filename: string;
}

const FileBarIcon: React.FC<FileIconProps> = ({filename}) => {
    // since we check before the dot as well
    if (filename.endsWith('compose.yaml') || filename.endsWith('compose.yml')) {
        return <DockerComposeIcon/>;
    }

    const ext = getExt(filename)

    switch (ext) {
        case "yaml":
        case "yml":
            return <YamlIcon/>;
        case "env":
            return <EnvIcon/>;
        case "db":
            return <SqliteIcon/>;
        case "gitignore":
            return <GitignoreIcon/>;
    }

    return <DefaultFileIcon/>;
};

export function getExt(filename: string) {
    return filename.split(".").pop() ?? "";
}

export default FileBarIcon;