import {observable, ObservableMap, runInAction} from 'mobx';
import {addConfTx, addMilestone, addTx, markRW} from "../comps/canvas";
import * as async from 'async';

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
    isConfirmed: boolean;
    isMilestone: boolean;
    isRWTip: boolean;
    isRWApprover: boolean;
    isRWEntry: boolean;
    isRWNext: boolean;
}

export enum MsgType {
    TX, MS, CONF_TX, RW_TX
}

export enum RWType {
    RW_ENTRY,
    RW_APPROVER,
    RW_NEXT,
    RW_TIP,
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
        let tipwalkobjs;
        let currentStep;
        this.ws.onmessage = (e: MessageEvent) => {
            let msg: Msg = null;
            try {
                msg = JSON.parse(e.data);
            } catch (err) {
                return;
            }
            switch (msg.type) {
                case MsgType.TX:
                    addTx(msg.obj);
                    break;
                case MsgType.MS:
                    addMilestone(msg.obj.hash);
                    break;
                case MsgType.CONF_TX:
                    addConfTx(msg.obj.hash);
                    break;

                case MsgType.RW_TX:
                    switch (msg.obj.type) {
                        case RWType.RW_ENTRY:
                            tipwalkobjs = []; // reset
                            currentStep = [msg.obj];
                            break;
                        case RWType.RW_TIP:
                            currentStep.push(msg.obj);
                            let funcs = tipwalkobjs.map(step => {
                                return function (cb) {
                                    setTimeout(() => {
                                        step.forEach(obj => markRW(obj.hash, obj.type));
                                        cb();
                                    }, 100);
                                };
                            });
                            async.series(funcs);
                            break;
                        case RWType.RW_APPROVER:
                            currentStep.push(msg.obj);
                            break;
                        case RWType.RW_NEXT:
                            tipwalkobjs.push(currentStep);
                            currentStep = [];
                            currentStep.push(msg.obj);
                            break;

                    }
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