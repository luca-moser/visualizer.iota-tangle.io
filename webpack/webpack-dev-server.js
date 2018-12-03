const webpack = require('webpack');
const WebpackDevServer = require('webpack-dev-server');
const webpackConfig = require('./webpack.dev.config');
const path = require('path');

const env = { dev: process.env.NODE_ENV === 'development' };

const devServerConfig = {
    hot: true,
    inline: true,
    https: false,
    lazy: false,
    disableHostCheck: true,
    headers: { 'Access-Control-Allow-Origin': '*' },
    contentBase: path.join(__dirname, '../client'),
    // need historyApiFallback to be able to refresh on dynamic route
    historyApiFallback: { disableDotRule: true },
    // pretty colors in console
    stats: { colors: true }
};

try {
    const server = new WebpackDevServer(webpack(webpackConfig(env)), devServerConfig);
    server.listen(3000, 'localhost');
} catch (err) {
    console.error(err);
}

