import esbuild from "esbuild";
import SassPlugin from "esbuild-plugin-sass";
import NodeGlobalsPolyfills from "@esbuild-plugins/node-globals-polyfill";
import NodeModulesPolyfill from "@esbuild-plugins/node-modules-polyfill";

const NodeGlobalsPolyfillsPlugin = NodeGlobalsPolyfills.NodeGlobalsPolyfillPlugin(
{
	process: true,
	buffer: true,
	// define: {"global": "window"},
});

esbuild.build(
{
	entryPoints: ["app.jsx"],
	bundle: true,
	define: {global: "window"},
	// incremental: false,
	// inject: [],
	outfile: "out.js",
    plugins: [NodeGlobalsPolyfillsPlugin, NodeModulesPolyfill.NodeModulesPolyfillPlugin(), SassPlugin()],
	sourcemap: true,
	target: ["es2020"]
})
.catch(() => process.exit(1));
