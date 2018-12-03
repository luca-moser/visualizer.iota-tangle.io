import {Transaction} from "../stores/TxStore";
import {TxStoreInstance} from "../stores/TxStore";

// origin canvas
let screenCanvas: HTMLCanvasElement;
let screenCtx: CanvasRenderingContext2D;

// use back buffers to draw elements
let verticesCanvas: HTMLCanvasElement;
let verticesBackBuffer: CanvasRenderingContext2D;
let edgesCanvas: HTMLCanvasElement;
let edgesBackBuffer: CanvasRenderingContext2D;

// current scale factor of the canvas
let scale = 1;
const canvasScaleFactor = 1;

// loaded transactions
const txs = {};

// retained data for replay up on becoming again active
const retainedTxs: Array<Transaction> = [];
const retainedMilestones = [];
let replayingRetainedData = false;
let toReplayLeft = 0;
let blockMovement = false;
let retainData = false;

enum VisibilityState {
    HIDDEN = 'hidden', VISIBLE = 'visible'
}

function getRandomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

export function setup(can: HTMLCanvasElement) {
    screenCanvas = can;
    screenCtx = screenCanvas.getContext("2d");

    verticesCanvas = document.createElement("canvas");
    verticesBackBuffer = verticesCanvas.getContext("2d");
    verticesBackBuffer.globalAlpha = 0.1;
    edgesCanvas = document.createElement("canvas");
    edgesBackBuffer = edgesCanvas.getContext("2d");

    // resize to screen width/height
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas, false);

    screenCanvas.onmousedown = startDragCapture;
    screenCanvas.onmousemove = applyDrag;
    screenCanvas.onmouseup = endDragCapture;
    screenCanvas.onmousewheel = scrollVertical;
    //screenCanvas.ondblclick = resetDrag;
    window.addEventListener('keydown', (e: KeyboardEvent) => {
        if (e.code !== 'Enter') return;
        if (retainData) {
            addRetainedData();
        } else {
            retainData = true;
            blockMovement = true;
        }
    });

    verticesBackBuffer.font = "14px Helvetica";
    verticesBackBuffer.scale(1, 1);

    let backgroundUpdateTaskId;
    document.onvisibilitychange = () => {
        switch (document.visibilityState) {
            case VisibilityState.HIDDEN:
                // store all incoming txs separately until page is active again
                retainData = true;
                blockMovement = true;
                break;
            case VisibilityState.VISIBLE:
                // add all withhold data
                addRetainedData();
                break;
        }
    };

    window.requestAnimationFrame(draw);
    setInterval(computeTPS, secInMilli);
    setInterval(computeTimeSpan, secInMilli);
    setInterval(computeStats, secInMilli / 2);
}

function resizeCanvas() {
    // let the canvas take the entire screen
    verticesCanvas.width = window.innerWidth;
    verticesCanvas.height = window.innerHeight;
    edgesCanvas.width = window.innerWidth;
    edgesCanvas.height = window.innerHeight;
    screenCanvas.width = window.innerWidth;
    screenCanvas.height = window.innerHeight;
}

let dragXStart = 0;
let dragYStart = 0;
let xDragDelta = 0;
let yDragDelta = 0;
let dragActive = false;
const dragSlowDownFactor = 20;
const mouseWheelHorizontalDrag = 20;

function startDragCapture(e: MouseEvent) {
    dragActive = true;
    dragXStart = e.clientX;
    dragYStart = e.clientY;
}

function applyDrag(e: MouseEvent) {
    if (!dragActive) {
        handleNodeSelection(e);
        return true;
    }
    let xDelta = (e.clientX - dragXStart) / dragSlowDownFactor;
    xDragDelta = xDelta !== 0 ? xDragDelta + xDelta : xDragDelta;
}

function endDragCapture(e: MouseEvent) {
    dragActive = false;
}

function resetDrag() {
    xDragDelta = yDragDelta = 0;
}

function scrollVertical(e: MouseWheelEvent) {
    const deltaX = e.deltaX;
    let xDelta = 0;
    deltaX > 0 ? xDelta += -mouseWheelHorizontalDrag : xDelta += mouseWheelHorizontalDrag;
    xDragDelta = xDelta !== 0 ? xDragDelta + xDelta : xDragDelta;
}

let currentlySelected = null;

function handleNodeSelection(e) {
    let rect = screenCanvas.getBoundingClientRect();
    let x = e.clientX - rect.left;
    let y = e.clientY - rect.top;

    let oneSetActive = false;
    for (let hash in txs) {
        let tx = txs[hash];
        if (oneSetActive) {
            tx.isMouseOver = false;
            continue;
        }
        verticesBackBuffer.beginPath();
        let factor = tx.getScaleFactor();
        const scaleDelta = (txBallSize * factor) / 2;
        verticesBackBuffer.arc(tx.x + xDragDelta + scaleDelta, tx.y + yDragDelta + scaleDelta, txBallSize * 4, 0, 2 * Math.PI);
        if (verticesBackBuffer.isPointInPath(x, y,)) {
            tx.isMouseOver = true;
            oneSetActive = true;
            currentlySelected = tx.hash;
            break;
        }
        tx.isMouseOver = false;
    }

    if (!oneSetActive) currentlySelected = null;
}

const timeSpanMaxTime = 600;
const minMoveSpeed = 0.5;
const decimalsFactor = 100;

let txCount, txsInViewCount;
let tips, milestones, confirmed, value;
let oldestTS, newestTS;
let viewTimeDelta;
let newestTSSec, oldTSSec;
let tipsPerc, confirmedPerc, approvedPerc;
let avgTPS;

function computeStats() {
    txCount = txsInViewCount = tips = milestones = confirmed = value =
        newestTS = oldestTS = 0;
    const canvasWidth = screenCanvas.width;
    for (let hash in txs) {
        txCount++;
        let tx = txs[hash];
        // delete transaction if it is off the max time span
        if ((performance.now() - tx.ts) / secInMilli > timeSpanMaxTime) {
            tx.isDeleted = true;
            delete txs[hash];
            continue;
        }
        if (tx.isInView(canvasWidth)) {
            txsInViewCount++;
            if (!oldestTS) {
                oldestTS = tx.ts;
                newestTS = tx.ts;
            }
            if (oldestTS > tx.ts) {
                oldestTS = tx.ts;
            }
            if (newestTS < tx.ts) {
                newestTS = tx.ts;
            }
        }
        if (tx.isTip) {
            tips++;
        }
        if (tx.isValueTx) {
            value++;
        }
        if (tx.isMilestone) {
            milestones++;
        }
        if (tx.isConfirmed) {
            confirmed++;
        }
    }

    // compute stats
    const now = performance.now();
    viewTimeDelta = Math.floor((newestTS - oldestTS) / secInMilli);
    newestTSSec = Math.floor((now - newestTS) / secInMilli);
    oldTSSec = Math.floor((now - oldestTS) / secInMilli);

    tipsPerc = (Math.floor((tips / txCount) * 10000) / decimalsFactor) || 0;
    confirmedPerc = Math.floor((confirmed / txCount) * 10000) / 100;
    approvedPerc = (Math.floor((decimalsFactor - tipsPerc) * decimalsFactor) / decimalsFactor) || 0;

    // compute TPS
    let sum = 0;
    for (let i = 0; i < tpsMeas.length; i++) {
        sum += tpsMeas[i];
    }
    avgTPS = sum / tpsMeas.length;
    avgTPS = Math.floor(avgTPS * decimalsFactor) / decimalsFactor || 0;

    // adjust move speed of vertices according to TPS
    moveSpeed = avgTPS / tpsBucketSize;
    moveSpeed = moveSpeed < minMoveSpeed ? minMoveSpeed : moveSpeed;
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function addRetainedData() {
    blockMovement = false;
    let pastTPS = tps;
    toReplayLeft = retainedTxs.length;
    let originLength = retainedTxs.length;
    replayingRetainedData = true;
    retainedTxs.sort((a, b) => a.timestamp > b.timestamp ? 1 : -1);
    for (let i = 0; i < retainedTxs.length; i++) {
        let tx = retainedTxs[i];
        let next;
        if (i !== retainedTxs.length - 1) {
            next = retainedTxs[i + 1];
        }
        await sleep(10);
        addTx(tx, true);
        const lengthDelta = retainedTxs.length - originLength;
        toReplayLeft--;
        if (toReplayLeft < 0) {
            toReplayLeft = 0;
            toReplayLeft += lengthDelta;
        }
    }
    for (let i = 0; i < retainedMilestones.length; i++) {
        let ms = retainedMilestones[i];
        await sleep(10);
        addMilestone(ms, true);
    }
    for (let i = 0; i < tpsBucketSize; i++) {
        tpsMeas[i] = pastTPS;
    }
    for (let hash in txs) {
        let tx = txs[hash];
        if (!tx.wasRetained) continue;

    }
    retainData = false;
    replayingRetainedData = false;
    retainedTxs.length = 0;
    retainedMilestones.length = 0;
}

function draw() {
    window.requestAnimationFrame(draw);

    // clear screen
    verticesBackBuffer.clearRect(0, 0, window.innerWidth, window.innerHeight);
    edgesBackBuffer.clearRect(0, 0, window.innerWidth, window.innerHeight);

    // draw txs
    const canvasWidth = screenCanvas.width;
    for (let hash in txs) {
        txs[hash].update(canvasWidth);
    }

    // draw stats
    verticesBackBuffer.fillStyle = statsColor;
    verticesBackBuffer.fillText(`Total Time span: total ${timeSpanSeconds} sec. (max. ${timeSpanMaxTime} sec.)`, 10, 20);
    verticesBackBuffer.fillText(`Viewport: ${viewTimeDelta} sec.; time span: ${oldTSSec}-${newestTSSec} sec.; ${txsInViewCount} vertices`, 10, 40);
    verticesBackBuffer.fillText(`Vertices: ${txCount} txs, ${milestones} milestones, ${value} value txs`, 10, 60);
    verticesBackBuffer.fillText(`Tips: ${tipsPerc}% (${tips}); Approved: ${approvedPerc}% (${txCount - tips}); Confirmed: ${confirmedPerc}% (${confirmed})`, 10, 80);
    if (retainData && !replayingRetainedData) {
        verticesBackBuffer.fillStyle = replayTextColor;
        verticesBackBuffer.fillText(`🗲 Retaining txs: ${retainedTxs.length}`, 10, 100);
    } else if (replayingRetainedData) {
        verticesBackBuffer.fillStyle = replayTextColor;
        verticesBackBuffer.fillText(`🗲 Replaying retained txs: ${toReplayLeft}`, 10, 100);
    } else {
        verticesBackBuffer.fillText(`TPS: ${avgTPS}`, 10, 100);
    }
    verticesBackBuffer.fillStyle = statsColor;

    // write back buffer to on screen canvas
    screenCtx.clearRect(0, 0, window.innerWidth, window.innerHeight);
    screenCtx.drawImage(edgesCanvas, 0, 0);
    screenCtx.drawImage(verticesCanvas, 0, 0);
}

let tpsMeas = [];
let tpsBucketSize = 10;
let tps = 0;
const secInMilli = 1000;

function computeTPS() {
    tpsMeas.push(tps);
    if (tpsMeas.length > tpsBucketSize) {
        tpsMeas = tpsMeas.splice(1, tpsMeas.length - 1);
    }
    tps = 0;
}

let timeSpanSeconds = 0;

function computeTimeSpan() {
    let newest = 0;
    let oldest = 0;
    for (let hash in txs) {
        let tx = txs[hash];
        if (!newest) {
            newest = tx.ts;
            oldest = tx.ts;
        }
        if (newest < tx.ts) {
            newest = tx.ts;
            continue;
        }
        if (oldest > tx.ts) {
            oldest = tx.ts;
            continue;
        }
    }
    timeSpanSeconds = Math.floor((newest - oldest) / secInMilli);
}

const deltaFromScreenTop = 150;
const deltaFromScreenBottom = 10;
const deltaFromScreenEnd = 200;
const horiShiftToChild = 50;

export function addTx(rawTx: Transaction, isRetained?: boolean) {
    if (retainData && !isRetained) {
        retainedTxs.push(rawTx);
        return;
    }
    let x = getRandomInt(window.innerWidth - deltaFromScreenEnd, window.innerWidth);
    let y = getRandomInt(deltaFromScreenTop, window.innerHeight - deltaFromScreenBottom);
    let tx: Tx = new Tx(rawTx.hash, x, y);
    tx.tag = rawTx.tag;

    const branch = txs[rawTx.branch_tx_hash];
    if (branch) {
        tx.branch = branch;
        branch.isTip = false;
        if (branch.x > tx.x) {
            tx.x = branch.x + horiShiftToChild + getRandomInt(30, horiShiftToChild * 2);
        }
        branch.approves++;
    }

    const trunk = txs[rawTx.trunk_tx_hash];
    if (trunk) {
        tx.trunk = trunk;
        trunk.isTip = false;
        if (trunk.x > tx.x) {
            tx.x = trunk.x + horiShiftToChild + getRandomInt(30, horiShiftToChild * 2);
        }
        trunk.approves++;
    }
    if (rawTx.value > 0) {
        tx.isValueTx = true;
    }

    tx.ts = performance.now();
    txs[rawTx.hash] = tx;
    if (isRetained) {
        tx.wasRetained = true;
    }
    tps++;
}

export function addMilestone(hash: string, isRetained?) {
    if (retainData && !isRetained) {
        retainedMilestones.push(hash);
        return;
    }
    let tx = txs[hash];
    if (tx) {
        tx.isMilestone = true;
        tx.confirm();
    }
}

export function addConfTx(hash: string) {
    let tx = txs[hash];
    if (tx) {
        tx.confirm();
    }
}

export function filter(word: string) {
    for (let hash in txs) {
        let tx = txs[hash];
        if (!word) {
            tx.filtered = false;
            continue;
        }
        if (tx.tag.toLowerCase().indexOf(word) === -1) {
            tx.filtered = true;
        }
    }
}

const txBallSize = 5;
let middlePointFactor = txBallSize / 2;
let moveSpeed = 0.5;
const newTTL = 10;
const approveTTL = 10;
const statsColor = '#00ffff';
const milestoneColor = '#e8d942';
const confirmedTxColor = '#00ff51';
const txColor = '#e8425c';
const txFiltered = '#b1d0d5';
const tipColor = '#00ffff';
const markedTx = '#69e842';
const newTx = '#b442e8';
const approveTx = '#ffe500';
const beingApprovedTx = '#ec7ea3';
const valueTx = '#ff8c69';
const strokeWidth = 0.4;
const strokeColor = '#9f4384';
const tipStrokeColor = '#46439f';
const activeStrokeColor = '#00b0e7';
const replayTextColor = '#ffd700';

class Tx {
    hash;
    tag: string;
    x: number;
    y: number;
    trunk: Tx = null;
    branch: Tx = null;
    ts = null;
    new = newTTL;
    up = false;
    approves = 0;
    filtered = false;
    newApprover = 0;
    isTip = true;
    isValueTx = false;
    isMouseOver = false;
    isMilestone = false;
    isConfirmed = false;
    isDeleted = false;
    wasRetained = false;

    constructor(hash, x, y) {
        this.hash = hash;
        this.x = x;
        this.y = y;
    }

    move() {
        if(blockMovement) {

            return;
        }
        this.x -= moveSpeed;
    }

    update(width) {
        if (this.new) {
            this.new--;
        }
        if (this.hash !== currentlySelected) {
            this.move();
        }
        if (this.isInView(width)) {
            this.draw();
        }
        this.drawLineTo(this.trunk, width);
        this.drawLineTo(this.branch, width);
    }

    draw(color?: string) {
        verticesBackBuffer.beginPath();
        let size = txBallSize * this.getScaleFactor();
        verticesBackBuffer.rect(this.x + xDragDelta, this.y + yDragDelta, size, size);
        if (color) {
            verticesBackBuffer.strokeStyle = tipColor;
            verticesBackBuffer.fillStyle = tipColor;
        } else {
            if (this.isMouseOver) {
                verticesBackBuffer.strokeStyle = markedTx;
                verticesBackBuffer.fillStyle = markedTx;
            } else if (this.isMilestone) {
                verticesBackBuffer.strokeStyle = milestoneColor;
                verticesBackBuffer.fillStyle = milestoneColor;
            } else if (this.isConfirmed) {
                verticesBackBuffer.strokeStyle = confirmedTxColor;
                verticesBackBuffer.fillStyle = confirmedTxColor;
            } else if (this.newApprover) {
                verticesBackBuffer.strokeStyle = beingApprovedTx;
                verticesBackBuffer.fillStyle = beingApprovedTx;
                this.newApprover--;
            } else if (this.filtered) {
                verticesBackBuffer.fillStyle = txFiltered;
                verticesBackBuffer.strokeStyle = txFiltered;
            } else if (this.isTip) {
                verticesBackBuffer.strokeStyle = tipColor;
                verticesBackBuffer.fillStyle = tipColor;
            } else if (this.isValueTx) {
                verticesBackBuffer.strokeStyle = valueTx;
                verticesBackBuffer.fillStyle = valueTx;
            } else {
                verticesBackBuffer.strokeStyle = txColor;
                verticesBackBuffer.fillStyle = txColor;
            }
        }
        verticesBackBuffer.fill();
        verticesBackBuffer.lineWidth = strokeWidth;
        verticesBackBuffer.stroke();
    }

    isInView(width: number) {
        return this.x + xDragDelta >= 0 && this.x + xDragDelta <= width;
    }

    confirm() {
        this.isConfirmed = true;
        if (this.trunk && !this.trunk.isConfirmed) {
            this.trunk.confirm();
        }
        if (this.branch && !this.branch.isConfirmed) {
            this.branch.confirm();
        }
    }

    adjustColorForChild(otherTx) {
        if (otherTx.hash === currentlySelected) {
            edgesBackBuffer.strokeStyle = approveTx;
            edgesBackBuffer.lineWidth = strokeWidth * 2;
        } else if (this.new) {
            edgesBackBuffer.strokeStyle = newTx;
            otherTx.newApprover = approveTTL;
        } else if (this.isMouseOver) {
            edgesBackBuffer.strokeStyle = markedTx;
            edgesBackBuffer.lineWidth = strokeWidth * 2;
        } else if (this.isTip) {
            edgesBackBuffer.strokeStyle = tipStrokeColor;
        } else {
            edgesBackBuffer.strokeStyle = strokeColor;
        }
    }

    drawLineTo(otherTx: Tx, width) {
        if (
            (!otherTx || otherTx.isDeleted)
            ||
            (!otherTx.isInView(width) && !this.isInView(width))
        ) {
            return;
        }
        let factorSelf = this.getScaleFactor();
        let factor = otherTx.getScaleFactor();
        edgesBackBuffer.beginPath();
        edgesBackBuffer.moveTo(this.x + xDragDelta + middlePointFactor * factorSelf, this.y + yDragDelta + middlePointFactor * factorSelf);
        this.adjustColorForChild(otherTx);
        edgesBackBuffer.lineTo(otherTx.x + xDragDelta + middlePointFactor * factor, otherTx.y + +yDragDelta + middlePointFactor * factor);
        edgesBackBuffer.stroke();
    }

    getScaleFactor = () => {
        return !this.approves ? 1 : 1 + (this.approves / 5);
    }
}
