declare module 'composerize' {
    /**
     * The main composerize function.
     * @param command - The docker run command string.
     * @param existingCompose - (Optional) Existing compose file content.
     * @param version - (Optional) Target compose version.
     * @param indent - (Optional) Indentation spaces.
     */
    function composerize(
        command: string,
        existingCompose?: string | null,
        version?: string,
        indent?: number
    ): string;

    export default composerize;
}

  