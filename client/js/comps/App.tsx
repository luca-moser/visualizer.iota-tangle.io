declare var __DEVELOPMENT__;
import * as React from 'react';
import {observer, inject} from 'mobx-react';
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
        canvas.setup((this.refs.canvas as HTMLCanvasElement));
    }

    filterTx = (e) => {
        canvas.filter(e.target.value);
    }

    render() {
        const {color} = this.props.appStore;
        return (
            <div>
                <div className={css.drawboard}>
                    <div className={css.controls}>
                        <div className={css.sitetitle}>
                            Tangle Visualizer <span className={css.betatag}>alpha</span>
                        </div>
                        <input
                            type="text"
                            placeholder={"Filter..."}
                            onChange={this.filterTx}
                            className={css.input + ' ' + css.searchfield}
                        />
                        <br/>
                        <div className={css.colorBox} style={{background: '#e8425c'}}>
                        </div>
                        <span className={css.colorBoxDesc}>Approved</span>
                        <div className={css.colorBox} style={{background: '#00ffff'}}>
                        </div>
                        <span className={css.colorBoxDesc}>Tip</span>
                        <div className={css.colorBox} style={{background: '#00ff51'}}>
                        </div>
                        <span className={css.colorBoxDesc}>Confirmed</span>
                        <div className={css.colorBox} style={{background: '#e8d942'}}>
                        </div>
                        <span className={css.colorBoxDesc}>Milestone</span>
                        <div className={css.colorBox} style={{background: '#ff8c69'}}>
                        </div>
                        <span className={css.colorBoxDesc}>Value</span>
                    </div>
                    <canvas ref={"canvas"}>
                    </canvas>
                </div>
                {__DEVELOPMENT__ ? <DevTools/> : <span></span>}
            </div>
        );
    }
}