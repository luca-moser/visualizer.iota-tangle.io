package routers

import (
	"github.com/labstack/echo"
	"github.com/gorilla/websocket"
	"gitlab.com/luca-moser/tangle-visualizer/server/controllers"
)

type TxsRouter struct {
	WebEngine  *echo.Echo              `inject:""`
	TxFeedCtrl *controllers.TxFeedCtrl `inject:""`
}

var (
	upgrader = websocket.Upgrader{}
)

func (txsRouter *TxsRouter) Init() {

	feedCtrl := txsRouter.TxFeedCtrl
	e := txsRouter.WebEngine
	group := e.Group("/api/txs")
	group.GET("", func(c echo.Context) error {
		ws, err := upgrader.Upgrade(c.Response(), c.Request(), nil)
		if err != nil {
			return err
		}
		defer ws.Close()

		writer := make(chan interface{})
		stop := make(chan struct{})
		defer close(stop) // auto-free writer, poller

		feedId, feed := feedCtrl.Subscribe()
		defer feedCtrl.RemoveSubscriber(feedId)

		// sync WS writer
		go func() {
			for {
				select {
				case msgToWrite, ok := <-writer:
					if !ok {
						return
					}
					if err := ws.WriteJSON(msgToWrite); err != nil {
						return
					}
				case <-stop:
					return
				}
			}
		}()

		go func() {
			for {
				select {
				case tx, ok := <-feed:
					if !ok {
						// timeout was reached in controller for metric send
						return
					}
					writer <- tx
				case <-stop:
					return
				}
			}
		}()
		<-stop
		return nil
	})
}
