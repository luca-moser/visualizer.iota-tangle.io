const webpack = require('webpack');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const HtmlWebpackHarddiskPlugin = require('html-webpack-harddisk-plugin');
const UglifyJSPlugin = require('uglifyjs-webpack-plugin');
const ExtractTextPlugin = require('extract-text-webpack-plugin');
const Autoprefixer = require('autoprefixer');
const path = require('path');

module.exports = env => {
    const removeEmpty = array => array.filter(p => !!p);

    const NODE_ENV = 'production' ;

    return {
        mode: 'production',
        entry: {
            app: path.join(__dirname, '../js/entry.tsx'),
            vendor: ['react', 'react-dom', 'mobx', 'mobx-react', 'tslib'],
        },

        resolve: {
            //modules: ['node_modules'],
            extensions: ['.ts', '.tsx', '.js', '.json', '.scss'],
        },

        output: {
            filename: '[name].js',
            path: path.join(__dirname, '../js'),
            publicPath: '/assets/js'
        },

        module: {
            rules: [
                {
                    test: /\.tsx?$/,
                    loader: "ts-loader",
                    exclude: /node_modules/
                },
                {
                    test: /\.scss$/,
                    exclude: /node_modules/,
                    use: [
                        'style-loader',
                        {
                            loader: 'typings-for-css-modules-loader',
                            options: {
                                modules: true,
                                namedExport: true,
                                camelCase: true,
                                localIdentName: '[name]__[local]',
                                sourceMap: true,
                            }
                        },
                        {
                            loader: 'sass-loader',
                            options: {
                                includePaths: ['..'],
                            },
                        },
                    ]
                }
            ]
        },

        plugins: removeEmpty([
            new UglifyJSPlugin({}),
            new webpack.LoaderOptionsPlugin({
                minimize: true,
                debug: false,
                options: {
                    context: __dirname,
                    postcss: [Autoprefixer({browsers: ['last 3 versions']})],
                },
            }),
            new webpack.HotModuleReplacementPlugin(),
            new webpack.NamedModulesPlugin(),

            new HtmlWebpackPlugin({
                template: path.join(__dirname, "../html/index.dev.html"),
                alwaysWriteToDisk: true
            }),

            new HtmlWebpackHarddiskPlugin({
                outputPath: path.join(__dirname, "../html"),
            }),

            new webpack.DefinePlugin({
                __DEVELOPMENT__: Boolean(false),
                'process.env.NODE_ENV': JSON.stringify('production'),
            }),
        ]),
    };
};