import {RWType, Transaction} from "../stores/TxStore";
import {default as Viva} from 'vivagraphjs';

let graph;
let graphics;

export function setup() {
    graph = Viva.Graph.graph();

    graphics = Viva.Graph.View.webglGraphics();
    graphics.node((node) => {
        let tx: Transaction = node.data;
        if (!tx) return Viva.Graph.View.webglSquare(5, "#dddddd");
        if (tx.isRWEntry) {
            return Viva.Graph.View.webglSquare(20, "#42f4f4");
        }
        if (tx.isRWApprover) {
            return Viva.Graph.View.webglSquare(20, "#e241f4");
        }
        if (tx.isRWNext) {
            return Viva.Graph.View.webglSquare(20, "#f4dc41");
        }
        if (tx.isRWTip) {
            return Viva.Graph.View.webglSquare(20, "#f48e41");
        }
        if (tx.isMilestone) {
            return Viva.Graph.View.webglSquare(5, "#bf4e4e");
        }
        if (tx.isConfirmed) {
            return Viva.Graph.View.webglSquare(5, "#bababa");
        }
        return Viva.Graph.View.webglSquare(5, "#565656");
    })
        .link((link) => {
            let linkage = link.data;
            if (!linkage) {
                return Viva.Graph.View.webglLine("#424242");
            }
            return Viva.Graph.View.webglLine("#f48e41");
        });
    let ele = document.getElementById('drawboard');
    let renderer = Viva.Graph.View.renderer(graph, {container: ele, graphics});
    renderer.run();
}

export function addTx(tx: Transaction) {
    graph.addNode(tx.hash, tx);
    let trunk = graph.getNode(tx.trunk_tx_hash);
    if (trunk) {
        graph.addLink(tx.hash, tx.trunk_tx_hash);
    }
    let branch = graph.getNode(tx.branch_tx_hash);
    if (branch) {
        graph.addLink(tx.hash, tx.branch_tx_hash);
    }
}

export function addConfTx(hash: string) {
    let node = graph.getNode(hash);
    if (!node) {
        return
    }
    let mut: Transaction = node.data;
    mut.isConfirmed = true;
    graph.addNode(hash, mut);
}

export function addMilestone(hash: string) {
    let node = graph.getNode(hash);
    if (!node) {
        return
    }
    let mut: Transaction = node.data;
    mut.isMilestone = true;
    graph.addNode(hash, mut);
}

function resetRWNode(hash: string) {
    setTimeout(function () {
        let node = graph.getNode(hash);
        let mut: Transaction = node.data;
        mut.isRWNext = false;
        mut.isRWEntry = false;
        mut.isRWApprover = false;
        mut.isRWTip = false;
        unmarkLinksToApprovers(node, hash);
        graph.addNode(hash, mut);
    }, 100);
}

interface Link {
    fromId: string;
    toId: string;
}

class Linkage {
    approves: boolean;

    constructor(app: boolean) {
        this.approves = app;
    }
}

function markLinksToApprovers(node, hash) {
    node.links.forEach((link: Link) => {
        if (link.toId !== hash) {
            return;
        }
        graph.addLink(link.fromId, link.toId, new Linkage(true));
    });
}

function unmarkLinksToApprovers(node, hash) {
    node.links.forEach((link: Link) => {
        if (link.toId !== hash) {
            return;
        }
        graph.addLink(link.fromId, link.toId);
    });
}

export let markRW = (hash: string, type: number) => {
    let node = graph.getNode(hash);
    if (!node) return;
    let mut: Transaction = node.data;
    switch (type) {
        case RWType.RW_TIP:
            mut.isRWTip = true;
            break;
        case RWType.RW_APPROVER:
            mut.isRWApprover = true;
            break;
        case RWType.RW_ENTRY:
            markLinksToApprovers(node, hash);
            mut.isRWEntry = true;
            break;
        case  RWType.RW_NEXT:
            markLinksToApprovers(node, hash);
            mut.isRWNext = true;
            break;
    }

    graph.addNode(hash, mut);
    resetRWNode(hash);
};