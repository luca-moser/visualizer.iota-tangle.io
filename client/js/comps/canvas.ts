import {Transaction} from "../stores/TxStore";
import {default as Viva} from 'vivagraphjs';

let graph;
let graphics;

export function setup() {
    graph = Viva.Graph.graph();

    graphics = Viva.Graph.View.webglGraphics();
    graphics.node((node) => {
        let tx: Transaction = node.data;
        if (!tx) return Viva.Graph.View.webglSquare(5, "#dddddd");
        if (tx.isMilestone) {
            return Viva.Graph.View.webglSquare(10, "#bf4e4e");
        }
        if (tx.isConfirmed) {
            return Viva.Graph.View.webglSquare(10, "#8abf4e");
        }
        return Viva.Graph.View.webglSquare(5, "#dddddd");
    })
        .link((link) => {
            return Viva.Graph.View.webglLine("#424242");
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
        console.log('milestone not in graph');
        return
    }
    console.log('milestone in graph');
    let mut: Transaction = node.data;
    mut.isMilestone = true;
    graph.addNode(hash, mut);
}