import {useCallback, useEffect, useState} from 'react'
import {callRPC, useDockerClient} from "../../lib/api.ts";
import {type Image} from "../../gen/docker/v1/docker_pb.ts";
import {useSnackbar} from "../../hooks/snackbar.ts";
import {useHostStore} from "../compose/state/files.ts";

/**
 * Generates a clickable URL for a container image, pointing to its repository.
 * Handles Docker Hub and other public/private registries.
 * @param {
 string
 } imageName The full name of the docker image (e.g., "nginx:latest", "gcr.io/my-project/my-image:v1").
 * @returns {
 string
 } The full URL to the image's web home page.
 */
export const getImageHomePageUrl = (imageName: string): string => {
    if (!imageName) {
        return '#' // Return a non-functional link if name is missing
    }

    // Strip the tag or digest from the image name
    // e.g., "nginx:latest" -> "nginx", "gcr.io/img@sha256:..." -> "gcr.io/img"
    let cleanName = imageName.split('@')[0]
    const tagIndex = cleanName.lastIndexOf(':')
    if (tagIndex > 0 && !cleanName.substring(tagIndex + 1).includes('/')) {
        cleanName = cleanName.substring(0, tagIndex)
    }

    const nameSplit = cleanName.split('/')
    const firstPart = nameSplit[0]
    const isCustomRegistry = firstPart.includes('.') || firstPart.includes(':')

    const customRegistryMap: Record<string, (image: string[]) => string> = {
        "lscr.io": (splits: string[]) => {
            // expected ["lscr.io", "linuxserver", "radarr"] <- get last part
            return `https://docs.linuxserver.io/images/docker-${splits[2]}`
        },
    }

    if (isCustomRegistry) {
        const registryDomain = nameSplit[0]
        const customUrl = customRegistryMap[registryDomain]
        if (customUrl) {
            // For known custom registries with special URL patterns
            return customUrl(nameSplit)
        }
        // For other registries, link to the registry itself
        return `https://${cleanName}`
    } else {
        // todo move this to backend
        // It's a Docker Hub image
        if (nameSplit.length === 1) {
            // Official Docker Hub image (e.g., "nginx")
            return `https://hub.docker.com/_/${cleanName}`
        } else {
            // User/organization image (e.g., "user/image")
            return `https://hub.docker.com/r/${cleanName}`
        }
    }
}

export function useDockerImages() {
    const dockerService = useDockerClient()
    const {showWarning} = useSnackbar()
    const selectedHost = useHostStore(state => state.host)


    const [images, setImages] = useState<Image[]>([])
    const [totalImageSize, setTotalImageSize] = useState(BigInt(0))
    const [unusedContainerCount, setUnusedContainerCount] = useState(BigInt(0))
    const [untagged, setUntagged] = useState(BigInt(0))

    const [loading, setLoading] = useState(true)

    const fetchImages = useCallback(async () => {
        setLoading(true)

        const {val, err} = await callRPC(() => dockerService.imageList({}))
        if (err) {
            showWarning(`Failed to refresh containers: ${err}`)
            setImages([])
            setUntagged(BigInt(0))
            setUnusedContainerCount(BigInt(0))
            setTotalImageSize(BigInt(0))
            return
        }

        setTotalImageSize(val?.totalDiskUsage ?? BigInt(0))
        setUntagged(val?.untaggedImageCount ?? BigInt(0))
        setUnusedContainerCount(val?.unusedImageCount ?? BigInt(0))
        setImages(val?.images || [])

    }, [dockerService, selectedHost])

    const refreshImages = useCallback(() => {
        fetchImages().finally(() => setLoading(false))
    }, [fetchImages]);

    const pruneUnused = useCallback(async (all = false) => {
        const {val, err} = await callRPC(() => dockerService.imagePruneUnused({
            pruneAll: all,
        }))
        if (err) {
            showWarning(`Failed to prune images: ${err}`)
            return
        }

        console.info(val)
        fetchImages().finally(() => {
            setLoading(false)
        })
    }, [dockerService, fetchImages])

    const deleteImages = useCallback(async (images: string[]) => {
        const {err} = await callRPC(() => dockerService.imageRemove({
            imageIds: images,
        }))
        if (err) {
            showWarning(`Failed to delete images: ${err}`)
            return
        }

        fetchImages().finally(() => {
            setLoading(false)
        })
    }, [dockerService, fetchImages])

    useEffect(() => {
        refreshImages()
    }, [refreshImages]) // run only once on page load

    return {
        images,
        loading,
        refreshImages,
        pruneUnused,
        totalImageSize,
        unusedContainerCount,
        untagged,
        deleteImages,
    }
}