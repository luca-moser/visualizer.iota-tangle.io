import {action, observable} from 'mobx';

function getRandomInt(min, max) {
    min = Math.ceil(min);
    max = Math.floor(max);
    return Math.floor(Math.random() * (max - min)) + min;
}

export class ApplicationStore {
    @observable color = "#000000";

    @action
    updateColor = (color: string) => {
        this.color = color;
    }
}

export var AppStoreInstance = new ApplicationStore();