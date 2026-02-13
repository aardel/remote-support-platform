const { defineConfig } = require('vite')
const react = require('@vitejs/plugin-react')

// https://vitejs.dev/config/
module.exports = defineConfig({
    plugins: [react()],
    base: '/remote/',
    server: {
        host: '0.0.0.0',
        port: 5173,
    }
})
