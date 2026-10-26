export const trimPrefix = (str: string, prefix: string): string =>
    str.startsWith(prefix) ? str.slice(prefix.length) : str;

export const trimSuffix = (str: string, suffix: string): string =>
    str.endsWith(suffix) ? str.slice(0, -suffix.length) : str;


export const stripQueryParams = (url: string): string => url.split('?')[0];
