declare var __DEVELOPMENT__;
import * as React from 'react';
import {inject, observer} from 'mobx-react';
import {ApplicationStore} from '../stores/AppStore';
import DevTools from 'mobx-react-devtools';

import * as css from './app.scss';
import * as canvas from './canvas';

interface Props {
    appStore: ApplicationStore;
}

@inject("appStore")
@observer
export class App extends React.Component<Props, {}> {
    componentDidMount() {
        this.drawCanvas();
    }

    drawCanvas = () => {
        canvas.setup();
    }

    render() {
        const {color} = this.props.appStore;
        return (
            <div>
                <div className={css.drawboard} ref={"drawboard"}>
                </div>
                {__DEVELOPMENT__ ? <DevTools/> : <span></span>}
            </div>
        );
    }
}