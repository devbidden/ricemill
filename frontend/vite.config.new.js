import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, process.cwd(), '');
    return {
        plugins: [react(), tailwindcss()],
        // Dev-only proxy; production uses VITE_API_URL directly.
        server: { proxy: { '/api': env.VITE_PROXY_TARGET } },
    };
});
