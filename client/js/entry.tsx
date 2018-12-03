declare var module;
declare var require;
require("react-hot-loader/patch");

import './../css/reset.scss';
import './../css/main.scss';

import * as React from 'react';
import * as ReactDOM from 'react-dom';
import {configure} from 'mobx';
import {Provider} from 'mobx-react';
import {AppContainer} from 'react-hot-loader'
import {App} from './comps/App';

// use MobX in strict mode
configure({ enforceActions: true });

// stores
import {AppStoreInstance as appStore} from "./stores/AppStore";
import {TxStoreInstance as txStore} from "./stores/TxStore";
let stores = {appStore, txStore};

const render = Component => {
    ReactDOM.render(
        <AppContainer>
            <Provider {...stores}>
                <Component />
            </Provider>
        </AppContainer>,
        document.getElementById('app')
    )
}

render(App);

if (module.hot) {
    module.hot.accept()
}