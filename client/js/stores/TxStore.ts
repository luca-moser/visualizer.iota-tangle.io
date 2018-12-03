import {action, observable, ObservableMap, runInAction} from 'mobx';
import {addConfTx, addMilestone, addTx} from "../comps/canvas";

function getRandomInt(min, max) {
    min = Math.ceil(min);
    max = Math.floor(max);
    return Math.floor(Math.random() * (max - min)) + min;
}

export class Transaction {
    hash: string;
    address: string;
    value: number;
    obsolete_tag: string;
    timestamp: number;
    current_index: string;
    last_index: string;
    bundle_hash: string;
    trunk_tx_hash: string;
    branch_tx_hash: string;
    arrival_time: string;
    tag: string;
}

export enum MsgType {
    TX, MS, CONF_TX
}

export class Msg {
    type: MsgType;
    obj: any;
}

export class TxStore {
    @observable txs: ObservableMap = new ObservableMap();
    ws: WebSocket;
    @observable ws_connected = false;

    constructor() {
        this.connectWebSocket();
    }

    connectWebSocket() {
        let wsProtocol = location.protocol === 'https:' ? 'wss://' : 'ws://';
        this.ws = new WebSocket(`${wsProtocol}${location.host}/api/txs`);
        this.ws.onmessage = (e: MessageEvent) => {
            let msg: Msg = null;
            try {
                msg = JSON.parse(e.data);
            } catch (err) {
                return;
            }
            switch(msg.type) {
                case MsgType.TX:
                    runInAction('add tx', () => {
                        addTx(msg.obj);
                    });
                    break;
                case MsgType.MS:
                    runInAction('add ms', () => {
                        addMilestone(msg.obj.hash);
                    });
                    break;
                case MsgType.CONF_TX:
                    runInAction('add conf tx', () => {
                        addConfTx(msg.obj.hash);
                    });
                    break;
            }
        };

        this.ws.onopen = (e) => {
            console.log('websocket connected');
            runInAction('websocket open', () => {
                this.ws_connected = true;
            });
        };

        this.ws.onclose = (e) => {
            console.log('websocket closed');
            runInAction('websocket closed', () => {
                this.ws_connected = false;
            });
        };
    }
}

export var TxStoreInstance = new TxStore();