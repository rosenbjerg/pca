import pegjs from "rollup-plugin-pegjs";


export default {
    input: "engine.js",

    output: {
        name: 'pca',
        file: 'built-engine.js',
        format: 'iife',
        sourcemap: true
    },

    plugins: [
        pegjs({
            optimize: 'size'
        })
    ]
}