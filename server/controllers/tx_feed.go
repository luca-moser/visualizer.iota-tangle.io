package controllers

import (
	"container/ring"
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
	Configuration   *config.Configuration `inject:""`
	subMu           sync.Mutex
	subscribers     map[int]chan interface{}
	nextSubId       int
	logger          log15.Logger
	txBuffer        *ring.Ring
	milestoneBuffer *ring.Ring
	confirmedBuffer *ring.Ring
}

func (ctrl *TxFeedCtrl) Init() error {
	var err error
	ctrl.logger, err = utilities.GetLogger("feed")
	ctrl.subscribers = map[int]chan interface{}{}

	// print out current zmq version
	major, minor, patch := zmq4.Version()
	ctrl.logger.Info(fmt.Sprintf("running ZMQ %d.%d.%d\n", major, minor, patch))

	ctrl.txBuffer = ring.New(5000)
	ctrl.milestoneBuffer = ring.New(500)
	ctrl.confirmedBuffer = ring.New(5000)

	// start feeds
	go ctrl.startTxFeed()
	go ctrl.startMilestoneFeed()
	go ctrl.startConfirmationFeed()
	go ctrl.startRWFeed()
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

		m := Msg{Type: TX, Obj: tx}
		ctrl.txBuffer.Value = m
		ctrl.txBuffer = ctrl.txBuffer.Next()
		txMsgReceived++

		ctrl.subMu.Lock()
		for _, subscriber := range ctrl.subscribers {
			select {
			case subscriber <- m:
			default:
			}
		}
		ctrl.subMu.Unlock()
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

		milestone := Milestone{msgSplit[1]}
		m := Msg{Type: MS, Obj: milestone}
		msMsgReceived++

		ctrl.milestoneBuffer.Value = m
		ctrl.milestoneBuffer = ctrl.milestoneBuffer.Next()

		ctrl.subMu.Lock()
		for _, subscriber := range ctrl.subscribers {
			select {
			case subscriber <- m:
			default:
			}
		}
		ctrl.subMu.Unlock()
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

		confTx := ConfTx{msgSplit[2]}
		m := Msg{Type: CONF_TX, Obj: confTx}
		ctrl.confirmedBuffer.Value = m
		ctrl.confirmedBuffer = ctrl.confirmedBuffer.Next()
		confirmedMsgReceived++

		ctrl.subMu.Lock()
		for _, subscriber := range ctrl.subscribers {
			select {
			case subscriber <- m:
			default:
			}
		}
		ctrl.subMu.Unlock()
	}
}

type RWTX struct {
	Hash string `json:"hash"`
	Type int    `json:"type"`
}

const (
	RW_ENTRY = iota
	RW_APPROVER
	RW_NEXT
	RW_TIP
)

func (ctrl *TxFeedCtrl) startRWFeed() {
	address := ctrl.Configuration.Net.ZMQ.Address

	socket, err := zmq4.NewSocket(zmq4.SUB)
	must(err)
	socket.SetSubscribe("walkerentry")
	socket.SetSubscribe("walkernext")
	socket.SetSubscribe("walkerapprover")
	socket.SetSubscribe("walkertip")
	err = socket.Connect(address)
	must(err)

	ctrl.logger.Info("started random walk feed")
	for {
		msg, err := socket.Recv(0)
		must(err)
		msgSplit := strings.Split(msg, " ")
		if len(msgSplit) != 2 {
			continue
		}

		var rwTx *RWTX
		switch msgSplit[0] {
		case "walkerentry":
			rwTx = &RWTX{msgSplit[1], RW_ENTRY}
		case "walkernext":
			rwTx = &RWTX{msgSplit[1], RW_APPROVER}
		case "walkerapprover":
			rwTx = &RWTX{msgSplit[1], RW_NEXT}
		case "walkertip":
			rwTx = &RWTX{msgSplit[1], RW_TIP}
		}

		ctrl.subMu.Lock()
		for _, subscriber := range ctrl.subscribers {
			select {
			case subscriber <- Msg{Type: RW_TX, Obj: *rwTx}:
			default:
			}
		}
		ctrl.subMu.Unlock()
	}
}

func (ctrl *TxFeedCtrl) Subscribe() (int, <-chan interface{}) {
	ctrl.subMu.Lock()
	defer ctrl.subMu.Unlock()
	ctrl.nextSubId++
	channel := make(chan interface{}, 100)
	ctrl.subscribers[ctrl.nextSubId] = channel
	go func() {
		ctrl.txBuffer.Do(func(m interface{}) {
			channel <- m
		})
		ctrl.milestoneBuffer.Do(func(m interface{}) {
			channel <- m
		})
		ctrl.confirmedBuffer.Do(func(m interface{}) {
			channel <- m
		})
	}()
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
