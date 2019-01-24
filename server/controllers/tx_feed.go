package controllers

import (
	"fmt"
	"github.com/luca-moser/visualizer.iota-tangle.io/server/server/config"
	"github.com/luca-moser/visualizer.iota-tangle.io/server/utilities"
	"github.com/pebbe/zmq4"
	"gopkg.in/inconshreveable/log15.v2"
	"strconv"
	"strings"
	"sync"
	"time"
)

type TxFeedCtrl struct {
	Configuration *config.Configuration `inject:""`
	subMu         sync.Mutex
	subscribers   map[int]chan interface{}
	nextSubId     int
	logger        log15.Logger
}

func (ctrl *TxFeedCtrl) Init() error {
	var err error
	ctrl.logger, err = utilities.GetLogger("feed")
	ctrl.subscribers = map[int]chan interface{}{}

	// print out current zmq version
	major, minor, patch := zmq4.Version()
	ctrl.logger.Info(fmt.Sprintf("running ZMQ %d.%d.%d\n", major, minor, patch))

	// start feeds
	go ctrl.startTxFeed()
	go ctrl.startMilestoneFeed()
	go ctrl.startConfirmationFeed()
	go ctrl.startLog()
	return err
}

func (ctrl *TxFeedCtrl) startLog() {
	feedLogInterval := ctrl.Configuration.App.FeedLogInterval
	for {
		<-time.After(time.Duration(feedLogInterval) * time.Second)
		ctrl.logger.Info(fmt.Sprintf("received: txs %d, ms %d, cnf %d\n", txMsgReceived, msMsgReceived, confirmedMsgReceived))
	}
}

func must(err error) {
	if err != nil {
		panic(err)
	}
}

type MsgType byte

const (
	TX MsgType = iota
	MS
	CONF_TX
	RW_TX
)

var msMsgReceived = 0
var txMsgReceived = 0
var confirmedMsgReceived = 0

type Msg struct {
	Type MsgType     `json:"type"`
	Obj  interface{} `json:"obj"`
}

type Transaction struct {
	Hash         string `json:"hash"`
	Address      string `json:"address"`
	Value        int    `json:"value"`
	ObsoleteTag  string `json:"obsolete_tag"`
	Timestamp    int64  `json:"timestamp"`
	CurrentIndex int    `json:"current_index"`
	LastIndex    int    `json:"last_index"`
	BundleHash   string `json:"bundle_hash"`
	TrunkTxHash  string `json:"trunk_tx_hash"`
	BranchTxHash string `json:"branch_tx_hash"`
	ArrivalTime  string `json:"arrival_time"`
	Tag          string `json:"tag"`
}

var bucketsMu = sync.Mutex{}
var buckets = map[string]*Bucket{}

type Bucket struct {
	TXs []*Transaction
}

func (b *Bucket) Full() bool {
	size := len(b.TXs)
	return size != 0 && size == b.TXs[0].LastIndex+1
}

func (ctrl *TxFeedCtrl) startTxFeed() {
	address := ctrl.Configuration.Net.ZMQ.Address

	socket, err := zmq4.NewSocket(zmq4.SUB)
	must(err)
	socket.SetSubscribe("tx")
	err = socket.Connect(address)
	must(err)

	ctrl.logger.Info("started tx feed")
	for {
		msg, err := socket.Recv(0)
		must(err)
		tx := buildTxFromZMQData(msg)
		if tx == nil {
			continue
		}

		/*
		// add transaction to bucket
		var b *Bucket
		var has bool
		b, has = buckets[tx.BundleHash]
		if !has {
			b = &Bucket{TXs: []*Transaction{}}
			b.TXs = append(b.TXs, tx)
			buckets[tx.BundleHash] = b
		} else {
			b.TXs = append(b.TXs, tx)
		}
		if b.Full() {
			fmt.Printf("new bundle bucket complete: %s\n", b.TXs[0].BundleHash)
		}
		*/

		txMsgReceived++
		for _, subscriber := range ctrl.subscribers {
			select {
			case subscriber <- Msg{Type: TX, Obj: tx}:
				break
			default:
			}
		}
	}
}

type Milestone struct {
	Hash string `json:"hash"`
}

func (ctrl *TxFeedCtrl) startMilestoneFeed() {
	address := ctrl.Configuration.Net.ZMQ.Address

	socket, err := zmq4.NewSocket(zmq4.SUB)
	must(err)
	socket.SetSubscribe("lmhs")
	err = socket.Connect(address)
	must(err)

	ctrl.logger.Info("started milestone feed")
	for {
		msg, err := socket.Recv(0)
		must(err)
		msgSplit := strings.Split(msg, " ")
		if len(msgSplit) != 2 {
			continue
		}
		msMsgReceived++
		milestone := Milestone{msgSplit[1]}
		for _, subscriber := range ctrl.subscribers {
			select {
			case subscriber <- Msg{Type: MS, Obj: milestone}:
				break
			default:
			}
		}
	}
}

type ConfTx struct {
	Hash string `json:"hash"`
}

func (ctrl *TxFeedCtrl) startConfirmationFeed() {
	address := ctrl.Configuration.Net.ZMQ.Address

	socket, err := zmq4.NewSocket(zmq4.SUB)
	must(err)
	socket.SetSubscribe("sn")
	err = socket.Connect(address)
	must(err)

	ctrl.logger.Info("started confirmation feed")
	for {
		msg, err := socket.Recv(0)
		must(err)
		msgSplit := strings.Split(msg, " ")
		if len(msgSplit) != 7 {
			continue
		}
		confirmedMsgReceived++
		confTx := ConfTx{msgSplit[2]}
		for _, subscriber := range ctrl.subscribers {
			select {
			case subscriber <- Msg{Type: CONF_TX, Obj: confTx}:
				break
			default:
			}
		}
	}
}

type RWTX struct {
	Hash string `json:"hash"`
}

func (ctrl *TxFeedCtrl) startRWFeed() {
	address := ctrl.Configuration.Net.ZMQ.Address

	socket, err := zmq4.NewSocket(zmq4.SUB)
	must(err)
	socket.SetSubscribe("mctn")
	err = socket.Connect(address)
	must(err)

	ctrl.logger.Info("started random walk feed")
	for {
		msg, err := socket.Recv(0)
		must(err)
		msgSplit := strings.Split(msg, " ")
		if len(msgSplit) != 7 {
			continue
		}
		confirmedMsgReceived++
		rwTx := RWTX{msgSplit[2]}
		for _, subscriber := range ctrl.subscribers {
			select {
			case subscriber <- Msg{Type: RW_TX, Obj: rwTx}:
				break
			default:
			}
		}
	}
}

func (ctrl *TxFeedCtrl) Subscribe() (int, <-chan interface{}) {
	ctrl.subMu.Lock()
	defer ctrl.subMu.Unlock()
	ctrl.nextSubId++
	channel := make(chan interface{})
	ctrl.subscribers[ctrl.nextSubId] = channel
	return ctrl.nextSubId, channel
}

func (ctrl *TxFeedCtrl) RemoveSubscriber(id int) {
	ctrl.subMu.Lock()
	defer ctrl.subMu.Unlock()
	channel, ok := ctrl.subscribers[id]
	if ok {
		close(channel)
	}
	delete(ctrl.subscribers, id)
}

func buildTxFromZMQData(msg string) *Transaction {
	msgSplit := strings.Split(msg, " ")
	if len(msgSplit) != 13 {
		return nil
	}
	var err error
	msgSplit = msgSplit[1:]
	tx := &Transaction{}
	tx.Hash = msgSplit[0]
	tx.Address = msgSplit[1]
	tx.Value, err = strconv.Atoi(msgSplit[2])
	if err != nil {
		return nil
	}
	tx.ObsoleteTag = msgSplit[3]
	tx.Timestamp, err = strconv.ParseInt(msgSplit[4], 10, 64)
	if err != nil {
		return nil
	}
	tx.CurrentIndex, err = strconv.Atoi(msgSplit[5])
	if err != nil {
		return nil
	}
	tx.LastIndex, err = strconv.Atoi(msgSplit[6])
	if err != nil {
		return nil
	}
	tx.BundleHash = msgSplit[7]
	tx.TrunkTxHash = msgSplit[8]
	tx.BranchTxHash = msgSplit[9]
	tx.ArrivalTime = msgSplit[10]
	tx.Tag = msgSplit[11]
	return tx
}
