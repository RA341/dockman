import {defineConfig} from 'vite'
import react, {reactCompilerPreset} from '@vitejs/plugin-react'
import babel from '@rolldown/plugin-babel'

// https://vite.dev/config/
export default defineConfig(({mode}) => {
    console.log(`Building for ${mode}`)

    return {
        plugins: [
            react(),
            babel({
                presets: [reactCompilerPreset()],
            }),
        ],
    }
})
